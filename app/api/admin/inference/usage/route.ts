// GET /api/admin/inference/usage?days=30 — the usage explorer.
//
// Answers the two questions an operator actually asks: "where is the money"
// (by org, by model, by day) and "what is failing" (by error code, with the
// models each hit). Section A3 of nextstespsAI/21-admin-platform.md.
//
// Margin is reported with its COVERAGE — see lib/admin/inference-usage.ts for
// why an uncovered margin figure would be a lie rather than a zero.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { inferenceAdminClient } from "@/lib/admin/inference-client";
import { byDay, errorBreakdown, groupBy, summarize, type UsageRow } from "@/lib/admin/inference-usage";

export const dynamic = "force-dynamic";

/** Bounded read — usage grows without limit and this page must stay fast. */
const ROW_LIMIT = 20000;

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days") ?? 30) || 30, 1), 365);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const supabase = inferenceAdminClient();
  const { data, error } = await supabase
    .schema("inference")
    .from("usage")
    .select(
      "org_id, model_id, modality, status, error_code, cost_cents, upstream_cost_cents, input_tokens, output_tokens, cached_tokens, latency_ms, billed_to, created_at"
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(ROW_LIMIT)
    .returns<UsageRow[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = data ?? [];

  // Org names, so the table doesn't make an operator resolve UUIDs by hand.
  const orgIds = [...new Set(rows.map((r) => r.org_id).filter(Boolean))] as string[];
  const { data: orgs } = await supabase
    .schema("inference")
    .from("orgs")
    .select("id, name, slug")
    .in("id", orgIds.length > 0 ? orgIds : ["00000000-0000-0000-0000-000000000000"])
    .returns<Array<{ id: string; name: string | null; slug: string | null }>>();
  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name ?? o.slug ?? o.id]));

  return NextResponse.json({
    window: { days, rows: rows.length, limit: ROW_LIMIT, truncated: rows.length >= ROW_LIMIT },
    summary: summarize(rows),
    by_day: byDay(rows),
    by_model: groupBy(rows, (r) => r.model_id).slice(0, 25),
    by_modality: groupBy(rows, (r) => r.modality),
    by_org: groupBy(rows, (r) => r.org_id)
      .slice(0, 25)
      .map((bucket) => ({ ...bucket, label: orgName.get(bucket.key) ?? bucket.key })),
    errors: errorBreakdown(rows),
  });
}
