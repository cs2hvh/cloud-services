// GET /api/admin/inference/orgs — every org with its members, keys and spend
// PUT /api/admin/inference/orgs — set an org's spend caps / ZDR default
//
// Section A2 of nextstespsAI/21-admin-platform.md. Org-scoped by the decision in
// §5.1: every AI resource hangs off `org_id`, so an org is the only unit that
// can carry a quota, a cap or a bill. People are resolved through org_members →
// user_profiles for display only.
//
// Thin by design: every derivation lives in lib/admin/inference-orgs.ts.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { inferenceAdminClient } from "@/lib/admin/inference-client";
import { actorContext, diffFields, orgLimitsEntry, recordAdminAudit } from "@/lib/admin/audit";
import { readAllPaged } from "@/lib/admin/paged-read";
import {
  keyIdleDays,
  keyRisks,
  keyState,
  overview,
  rollupOrg,
  type ApiKeyRow,
  type ByokKeyRow,
  type OrgMemberRow,
  type OrgRow,
  type UsageRow,
} from "@/lib/admin/inference-orgs";

export const dynamic = "force-dynamic";

/** Usage is unbounded; cap the read so this page stays fast as it grows. */
const USAGE_LIMIT = 20000;

export async function GET() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = inferenceAdminClient();
  const inf = () => supabase.schema("inference");

  const [orgsRes, membersRes, keysRes, byokRes, usageRes] = await Promise.all([
    inf().from("orgs").select("id, name, slug, owner_user_id, billing_user_id, hard_cap_cents, monthly_budget_cents, vector_quota, zdr_default, region_pin, deleted_at, created_at").returns<OrgRow[]>(),
    inf().from("org_members").select("org_id, user_id, role, status, joined_at, invited_at").returns<OrgMemberRow[]>(),
    inf().from("api_keys").select("id, org_id, name, key_prefix, key_last_four, key_tier, is_internal_service, rate_limit_rpm, hard_cap_cents, monthly_budget_cents, allowed_models, revoked_at, expires_at, last_used_at, created_at").returns<ApiKeyRow[]>(),
    inf().from("byok_keys").select("id, org_id, provider, name, key_last_four, is_valid, last_verified_at, last_verify_error").returns<ByokKeyRow[]>(),
    // NOT `.limit(USAGE_LIMIT)` — PostgREST caps a response at 1,000 without
    // erroring, so every org's spend roll-up was computed from the newest 1,000
    // rows platform-wide. See lib/admin/paged-read.ts.
    readAllPaged<UsageRow>(
      (from, to) =>
        inf()
          .from("usage")
          .select("org_id, cost_cents, created_at")
          .order("created_at", { ascending: false })
          .range(from, to)
          .returns<UsageRow[]>(),
      { maxRows: USAGE_LIMIT }
    ),
  ]);

  // The paged read reports its error as a plain string; the rest are
  // PostgrestErrors. Normalise so one failing read reports the same way as any
  // other rather than surfacing "undefined".
  const firstError =
    orgsRes.error?.message ||
    membersRes.error?.message ||
    keysRes.error?.message ||
    byokRes.error?.message ||
    usageRes.error;
  if (firstError) return NextResponse.json({ error: firstError }, { status: 500 });

  const orgs = orgsRes.data ?? [];
  const members = membersRes.data ?? [];
  const keys = keysRes.data ?? [];
  const byok = byokRes.data ?? [];
  const usage = usageRes.rows;

  // Resolve people for display. A missing profile is normal (invited but never
  // signed in), so it must render as the raw id rather than breaking the row.
  const userIds = [...new Set(members.map((m) => m.user_id).filter(Boolean))];
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, username")
    .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"])
    .returns<Array<{ id: string; username: string | null }>>();
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  const now = Date.now();

  return NextResponse.json({
    overview: overview(orgs, members, keys),
    usage_window: { rows: usage.length, limit: USAGE_LIMIT, truncated: usageRes.truncated },
    orgs: orgs.map((org) => ({
      ...org,
      summary: rollupOrg(org, members, keys, byok, usage, now),
      members: members
        .filter((m) => m.org_id === org.id)
        .map((m) => ({ ...m, username: nameById.get(m.user_id) ?? null })),
      keys: keys
        .filter((k) => k.org_id === org.id)
        .map((k) => ({ ...k, state: keyState(k, now), idle_days: keyIdleDays(k, now), risks: keyRisks(k, now) })),
      byok_keys: byok.filter((b) => b.org_id === org.id),
    })),
  });
}

export async function PUT(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const orgId = body?.org_id;
  if (!orgId || typeof orgId !== "string") {
    return NextResponse.json({ error: "org_id is required" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  // `vector_quota` joined these on 2026-08-04: it was a module constant, so the
  // Vector Storage admin could see a customer at their ceiling and had no way to
  // raise it (doc 21 §5.5). NULL clears the override back to the platform default.
  for (const field of ["hard_cap_cents", "monthly_budget_cents", "vector_quota"] as const) {
    if (!(field in (body ?? {}))) continue;
    const raw = body[field];
    if (raw === null) {
      update[field] = null;
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      return NextResponse.json({ error: `${field} must be a number ≥ 0, or null to remove the cap` }, { status: 400 });
    }
    update[field] = Math.round(value);
  }
  if (typeof body?.zdr_default === "boolean") update.zdr_default = body.zdr_default;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = inferenceAdminClient();
  const { data: before } = await supabase
    .schema("inference")
    .from("orgs")
    .select("hard_cap_cents, monthly_budget_cents, zdr_default, vector_quota")
    .eq("id", orgId)
    .maybeSingle<Record<string, unknown>>();

  const { data, error } = await supabase
    .schema("inference")
    .from("orgs")
    .update(update)
    .eq("id", orgId)
    .select("id, hard_cap_cents, monthly_budget_cents, zdr_default, vector_quota")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Org not found" }, { status: 404 });

  const changes = diffFields(before ?? {}, data as Record<string, unknown>, [
    "hard_cap_cents",
    "monthly_budget_cents",
    "zdr_default",
    "vector_quota",
  ]);
  if (changes.length > 0) {
    void recordAdminAudit(
      orgLimitsEntry(orgId, changes),
      { userId: adminCheck.userId, email: adminCheck.email },
      actorContext(req)
    );
  }

  return NextResponse.json(data);
}
