// GET /api/admin/inference/audit — read the audit trail.
//
// Section A6 of nextstespsAI/21-admin-platform.md, and the answer to §3's
// complaint: the trail was written faithfully and nobody could read it outside
// SQL. Every derivation lives in lib/admin/audit-view.ts.
//
// Reads BOTH kinds of event: customer actions (key.created, …) and staff
// actions (admin.*, recorded with org_id NULL for catalog-wide changes by
// migration 20260729000001). Keeping them distinguishable is the point.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { inferenceAdminClient } from "@/lib/admin/inference-client";
import { readAllPaged } from "@/lib/admin/paged-read";
import { actionCounts, summarize, type AuditRow } from "@/lib/admin/audit-view";

export const dynamic = "force-dynamic";

/** audit_log is partitioned and grows forever — always read a bounded window. */
const ROW_LIMIT = 2000;

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days") ?? 30) || 30, 1), 365);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const supabase = inferenceAdminClient();
  const { rows, truncated, error } = await readAllPaged<AuditRow>(
    (from, to) =>
      supabase
        .schema("inference")
        .from("audit_log")
        .select("id, org_id, actor_user_id, actor_api_key_id, action, target_type, target_id, metadata, ip_address, user_agent, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .range(from, to)
        .returns<AuditRow[]>(),
    { maxRows: ROW_LIMIT }
  );

  if (error) return NextResponse.json({ error }, { status: 500 });
  

  // Resolve actors and orgs so the table reads as names, not UUIDs. Both are
  // best-effort: a deleted user or org must not blank out the row.
  const userIds = [...new Set(rows.map((r) => r.actor_user_id).filter(Boolean))] as string[];
  const orgIds = [...new Set(rows.map((r) => r.org_id).filter(Boolean))] as string[];
  const placeholder = ["00000000-0000-0000-0000-000000000000"];

  const [profilesRes, orgsRes] = await Promise.all([
    supabase.from("user_profiles").select("id, username").in("id", userIds.length ? userIds : placeholder).returns<Array<{ id: string; username: string | null }>>(),
    supabase.schema("inference").from("orgs").select("id, name, slug").in("id", orgIds.length ? orgIds : placeholder).returns<Array<{ id: string; name: string | null; slug: string | null }>>(),
  ]);

  const userName = new Map((profilesRes.data ?? []).map((p) => [p.id, p.username]));
  const orgName = new Map((orgsRes.data ?? []).map((o) => [o.id, o.name ?? o.slug]));

  return NextResponse.json({
    // `truncated` comes from the pager, which knows whether ROW_LIMIT was
    // genuinely reached. The old `rows.length >= ROW_LIMIT` could never fire:
    // PostgREST caps at 1,000, so the length never reached 2,000.
    window: { days, rows: rows.length, limit: ROW_LIMIT, truncated },
    summary: summarize(rows),
    actions: actionCounts(rows),
    rows: rows.map((row) => ({
      ...row,
      actor_name: row.actor_user_id ? userName.get(row.actor_user_id) ?? null : null,
      // metadata.actor_email is written by lib/admin/audit.ts for admin rows —
      // a user id alone is unreadable in an incident review.
      actor_email: (row.metadata?.actor_email as string | undefined) ?? null,
      org_name: row.org_id ? orgName.get(row.org_id) ?? null : null,
    })),
  });
}
