/**
 * GET /api/v2/projects/{ref}/usage — what this project has cost.
 *
 * Billing exists and nothing showed it. A customer whose balance is being drawn
 * down with no way to see what for has to take our word for the number, and the
 * first time they doubt it there is nothing to point at. That is worse than not
 * billing: an unexplained charge is a support ticket at best.
 *
 * READ-ONLY AND RLS-SCOPED. `paas.project_charges` grants SELECT to authenticated
 * and nothing else — no INSERT, no UPDATE, no DELETE — and its policy scopes rows
 * to the caller's team. This route inherits both gates: it can only show what the
 * metering sweep recorded, for teams the caller belongs to.
 *
 * The arithmetic lives in `lib/paas/usage.ts` and is tested there. What is left
 * here is auth, a query, and the difference between a projection and a charge —
 * all of which fail loudly. A summing mistake would not.
 */

import { createClient } from "@/lib/supabase/server";
import { requireTier, hourlyRateUsd, BILLING_HOURS_PER_MONTH, clampInstances } from "@/lib/paas/tiers";
import { assessArrears } from "@/lib/paas/arrears";
import { summariseCharges } from "@/lib/paas/usage";
import { json, unauthenticated, notFound, apiError } from "../../../_lib/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ ref: string }> };
const PROJECT_REF = /^prj-[0-9a-f]{12}$/;

/** Rows older than this are not returned. A bill nobody scrolls is not a bill. */
const WINDOW_DAYS = 31;

export async function GET(_req: Request, ctx: Ctx) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return unauthenticated();

  const { ref } = await ctx.params;
  if (!PROJECT_REF.test(ref)) return notFound("Project");

  const db = supabase.schema("paas");

  const { data: project, error: projectError } = await db
    .from("projects")
    .select("id,ref,tier,instance_count,arrears_since,deleted_at")
    .eq("ref", ref)
    .maybeSingle();

  if (projectError) {
    console.error("[v2/usage] project read failed:", JSON.stringify(projectError));
    return apiError("internal", "Could not read the project.", 500);
  }
  if (!project || project.deleted_at) return notFound("Project");

  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  const { data: charges, error } = await db
    .from("project_charges")
    .select("period_start,amount_usd,tier,instances")
    .eq("project_id", project.id)
    .gte("period_start", since)
    .order("period_start", { ascending: false });

  if (error) {
    // NOT an empty bill. Rendering a failed read as "you have been charged
    // nothing" is the one direction a billing page must never fail in — the
    // customer closes the tab reassured and the balance keeps dropping.
    console.error("[v2/usage] charges read failed:", JSON.stringify(error));
    return apiError("internal", "Could not read your usage. This is a display problem, not a billing one.", 500);
  }

  const summary = summariseCharges(charges ?? []);

  // What a full month at the CURRENT shape would cost. Clearly separated from
  // what has actually been charged, because a projection presented alongside a
  // real total is read as a real total.
  let projected: { hourly: number; monthly: number; tier: string; instances: number } | null = null;
  try {
    const t = requireTier(project.tier);
    const instances = clampInstances(project.instance_count ?? 1);
    const hourly = hourlyRateUsd(t, instances);
    projected = {
      hourly,
      monthly: Math.round(hourly * BILLING_HOURS_PER_MONTH * 100) / 100,
      tier: t.label,
      instances,
    };
  } catch {
    // An unpriceable tier is left null rather than guessed. A projection based
    // on the cheapest plan would understate someone's bill.
    projected = null;
  }

  const arrears = assessArrears(project.arrears_since ?? null);

  return json({
    project: { ref: project.ref },
    windowDays: WINDOW_DAYS,
    // Hours billed, not hours elapsed. An app asleep or stopped is not charged,
    // so these differ and the difference is the customer's saving.
    hoursBilled: summary.hoursBilled,
    totalUsd: summary.totalUsd,
    byDay: summary.byDay,
    projected,
    billing: {
      state: arrears.state,
      reason: arrears.reason,
      hoursRemaining: arrears.hoursRemaining,
    },
    // Only present when it is not zero. A row we could not read is excluded
    // from the total above, so saying nothing would make an incomplete
    // statement look complete.
    ...(summary.unreadable > 0
      ? {
          unreadableRows: summary.unreadable,
          unreadableNote:
            "Some charge rows could not be read and are excluded from the total above. Please contact support before relying on this figure.",
        }
      : {}),
    note:
      summary.hoursBilled === 0 && summary.unreadable === 0
        ? "No charges recorded. Metering runs hourly and only bills hours the app was actually running."
        : undefined,
  });
}
