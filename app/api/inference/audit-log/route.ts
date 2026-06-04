/**
 * GET /api/inference/audit-log
 * ?limit=N ?before=TS ?action=... ?target_type=...
 */
import { NextRequest, NextResponse } from "next/server";
import { withInferenceAuth } from "@/lib/api/inference-middleware";
import { createServiceClient } from "@/lib/supabase/server";

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

export const GET = withInferenceAuth("audit", { limit: 60 }, async (req: NextRequest, ctx) => {
  const params = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number.parseInt(params.get("limit") ?? "50", 10) || 50, 1), 200);
  const before = params.get("before");
  const actionFilter = params.get("action");
  const targetFilter = params.get("target_type");

  const supabase = await createServiceClient();

  let q = supabase.schema("inference").from("audit_log")
    .select("id, actor_user_id, actor_api_key_id, action, target_type, target_id, metadata, ip_address, user_agent, created_at")
    .eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(limit);

  if (before) q = q.lt("created_at", before);
  if (actionFilter) q = q.eq("action", actionFilter);
  if (targetFilter) q = q.eq("target_type", targetFilter);

  const { data, error } = await q.returns<AuditRow[]>();
  if (error) return NextResponse.json({ error: "Failed to fetch audit log" }, { status: 500 });

  const now = Date.now();
  const rows = data ?? [];
  let last24h = 0; let last7d = 0;
  const actionCounts = new Map<string, number>();
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    if (t >= now - 86_400_000) last24h++;
    if (t >= now - 604_800_000) last7d++;
    actionCounts.set(r.action, (actionCounts.get(r.action) ?? 0) + 1);
  }
  const topAction = [...actionCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  return NextResponse.json({
    success: true,
    org: { id: ctx.orgId, slug: ctx.orgSlug, name: ctx.orgName },
    summary: {
      shown: rows.length,
      last_24h: last24h,
      last_7d: last7d,
      top_action: topAction ? { action: topAction[0], count: topAction[1] } : null,
    },
    data: rows,
    next_before: rows.length === limit ? rows[rows.length - 1]?.created_at ?? null : null,
  });
});
