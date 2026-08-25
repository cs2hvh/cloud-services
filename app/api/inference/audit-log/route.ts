/**
 * GET /api/inference/audit-log
 *
 * Returns the most recent audit-log entries for the caller's active inference org.
 * Append-only; entries come from the AUDIT_EVENTS queue consumer in the gateway.
 *
 * Query params:
 *   ?limit=N        — page size (default 50, max 200)
 *   ?before=TS      — ISO timestamp; return rows older than this (keyset pagination)
 *   ?action=...     — filter by audit_action enum value
 *   ?target_type=.. — filter by target type
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { limitByUser } from "@/lib/cooldown/userbased";

interface AuditRow {
  id: string;
  actor_user_id: string | null;
  actor_api_key_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export async function GET(request: NextRequest) {
  const authResult = await controlPlaneAuth(request, { session: "cookie", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-audit",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const org = { org_id: auth.orgId, role: auth.orgRole, org_name: auth.orgName, org_slug: auth.orgSlug };

  const params = request.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number.parseInt(params.get("limit") ?? "50", 10) || 50, 1), 200);
  const before = params.get("before");
  const actionFilter = params.get("action");
  const targetFilter = params.get("target_type");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  let q = supabase
    .schema("inference")
    .from("audit_log")
    .select(
      "id, actor_user_id, actor_api_key_id, action, target_type, target_id, metadata, ip_address, user_agent, created_at"
    )
    .eq("org_id", org.org_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) q = q.lt("created_at", before);
  if (actionFilter) q = q.eq("action", actionFilter);
  if (targetFilter) q = q.eq("target_type", targetFilter);

  const { data, error } = await q.returns<AuditRow[]>();

  if (error) {
    console.error("[Inference Audit] fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch audit log" }, { status: 500 });
  }

  // ── Aggregations for the page's stat strip ─────────────────────
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const rows = data ?? [];

  let last24h = 0;
  let last7d = 0;
  const actionCounts = new Map<string, number>();
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    if (t >= oneDayAgo) last24h += 1;
    if (t >= oneWeekAgo) last7d += 1;
    actionCounts.set(r.action, (actionCounts.get(r.action) ?? 0) + 1);
  }
  const topAction =
    [...actionCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  return NextResponse.json({
    success: true,
    org: { id: org.org_id, slug: org.org_slug, name: org.org_name },
    summary: {
      shown: rows.length,
      last_24h: last24h,
      last_7d: last7d,
      top_action: topAction ? { action: topAction[0], count: topAction[1] } : null,
    },
    data: rows,
    next_before: rows.length === limit ? rows[rows.length - 1]?.created_at ?? null : null,
  });
}
