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
import { readAllPaged } from "@/lib/admin/paged-read";

export const dynamic = "force-dynamic";

/** Bounded read — usage grows without limit and this page must stay fast.
 *  Reached by PAGING to this number, not by asking the server for it. */
const ROW_LIMIT = 20000;

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days") ?? 30) || 30, 1), 365);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const supabase = inferenceAdminClient();

  // PAGED, NOT LIMITED. `.limit(20000)` did not fail and did not warn — PostgREST
  // simply returned 1,000 rows. Measured 2026-08-04 against a window holding
  // 1,572: every figure below (spend, margin, by-model, by-org, by-day) was
  // computed from 1,000 of them and under-stated platform spend by 34%, while
  // `truncated` reported false because the check was `length >= 20000`.
  const { rows, truncated, error } = await readAllPaged<UsageRow>(
    (from, to) =>
      supabase
        .schema("inference")
        .from("usage")
        .select(
          "org_id, model_id, modality, status, error_code, cost_cents, upstream_cost_cents, input_tokens, output_tokens, cached_tokens, latency_ms, billed_to, created_at"
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .range(from, to)
        .returns<UsageRow[]>(),
    { maxRows: ROW_LIMIT }
  );

  if (error) return NextResponse.json({ error }, { status: 500 });

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
    // `truncated` now means "the deliberate ROW_LIMIT was reached", which is a
    // real bound. It can no longer be quietly satisfied by the server's cap.
    window: { days, rows: rows.length, limit: ROW_LIMIT, truncated },
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
