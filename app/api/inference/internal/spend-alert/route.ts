/**
 * POST /api/inference/internal/spend-alert
 *
 * Fans out a single spend-threshold notification through the existing
 * emitInferenceEvent pipeline (in-app + email + outbound webhook).
 *
 * Called by the Worker's usage-events consumer when an org's monthly
 * spend crosses a threshold (80% / 100% of budget; 90% / 100% of hard
 * cap). The consumer dedupes via KV so this endpoint is safe to call
 * at-most-once per (org, month, threshold).
 *
 * Auth: header `X-Ahura-Internal-Token: <BATCH_PROCESSOR_TOKEN>` —
 *       same shared secret the watchdog uses.
 *
 * Why a dedicated endpoint instead of putting the fan-out in the Worker:
 *   - emitInferenceEvent needs Resend (email), Supabase REST (in-app
 *     notifications insert + notification_settings read) AND a Node-only
 *     HMAC path — none of those compose cleanly inside a CF Worker, and
 *     duplicating the logic risks the worker version drifting from the
 *     control-plane version.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { emitInferenceEvent } from "@/lib/inference/notifications";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const THRESHOLD_NAMES = ["budget_80", "budget_100", "cap_90", "cap_100"] as const;
type ThresholdName = (typeof THRESHOLD_NAMES)[number];

const bodySchema = z.object({
  org_id: z.string().uuid(),
  threshold: z.enum(THRESHOLD_NAMES),
  current_cents: z.number().int().nonnegative(),
  cap_cents: z.number().int().positive(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

function copyFor(
  threshold: ThresholdName,
  currentCents: number,
  capCents: number,
  month: string
): { title: string; summary: string } {
  const spent = `$${(currentCents / 100).toFixed(2)}`;
  const cap = `$${(capCents / 100).toFixed(2)}`;
  switch (threshold) {
    case "budget_80":
      return {
        title: `Spend at 80% of monthly budget — ${spent}`,
        summary: `You've spent ${spent} of your ${cap} monthly budget for ${month}. This is an informational budget — traffic is not blocked.`,
      };
    case "budget_100":
      return {
        title: `Monthly budget exceeded — ${spent}`,
        summary: `You've spent ${spent}, past your ${cap} monthly budget for ${month}. This is an informational budget — traffic is not blocked. Set a hard cap if you want to enforce a ceiling.`,
      };
    case "cap_90":
      return {
        title: `Spend at 90% of hard cap — ${spent}`,
        summary: `You've spent ${spent} of your ${cap} hard cap for ${month}. At 100% the gateway will return 402 for every request until next billing period. Raise the cap on Inference Settings if needed.`,
      };
    case "cap_100":
      return {
        title: `Hard cap reached — inference traffic is now blocked`,
        summary: `You've spent ${spent}, at your ${cap} hard cap for ${month}. All inference requests now return 402. Raise the cap on Inference Settings or wait for the next billing period.`,
      };
  }
}

export async function POST(request: NextRequest) {
  const token = request.headers.get("x-ahura-internal-token");
  const expected =
    process.env.BATCH_PROCESSOR_TOKEN || process.env.INTERNAL_CRON_TOKEN;
  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.issues },
      { status: 400 }
    );
  }
  const { org_id, threshold, current_cents, cap_cents, month } = parsed.data;

  const { title, summary } = copyFor(threshold, current_cents, cap_cents, month);
  const isBudget = threshold.startsWith("budget_");
  const kindLabel = isBudget ? "Monthly budget" : "Monthly hard cap";

  // Spend alerts bypass the events_subscribed filter — these are
  // operational notifications (you set a cap precisely because you
  // want to be told when you're near it). Customers still control
  // which CHANNELS fire (in-app / email / webhook); they just can't
  // accidentally mute the alert entirely.
  await emitInferenceEvent({
    orgId: org_id,
    event: "org.spend_threshold_reached",
    resourceId: `spend-${month}-${threshold}`,
    title,
    summary,
    details: [
      { label: "Period", value: month },
      { label: kindLabel, value: `$${(cap_cents / 100).toFixed(2)}` },
      { label: "Spent so far", value: `$${(current_cents / 100).toFixed(2)}` },
      {
        label: "Utilization",
        value: `${((current_cents / cap_cents) * 100).toFixed(1)}%`,
      },
    ],
    dashboardPath: "/dashboard/services/inference/usage",
    actionLabel: "Open usage",
    bypassSubscriptionFilter: true,
  });

  return NextResponse.json({ success: true });
}
