// GET /api/admin/inference/traces — latency, failures and guardrail outcomes.
//
// §4 A6 of nextstespsAI/21-admin-platform.md: the audit trail has a surface,
// `inference.trace_spans` does not. This is that surface.
//
// PAGED, NOT LIMITED. Percentiles are only meaningful over the whole window, and
// PostgREST caps a response at 1,000 rows without erroring — a `.limit(50000)`
// would quietly return 1,000 and every percentile computed from it would be wrong
// while looking plausible. So: page, ask for an exact count, and report if the
// ceiling was hit.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { inferenceAdminClient } from "@/lib/admin/inference-client";
import {
  errorBreakdown,
  groupBy,
  guardrailBreakdown,
  slowest,
  sortByConcern,
  summarize,
  type SpanRow,
} from "@/lib/admin/traces-ops";

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;
const PAGE_SIZE = 1_000;
const MAX_PAGES = 30;
const SLOWEST_LIMIT = 20;

const COLUMNS =
  "id, trace_id, parent_span_id, name, status, latency_ms, ttft_ms, org_id, model_id, " +
  "guardrail_action, prompt_id, arm, experiment_id, cost_cents, input_tokens, output_tokens, created_at";

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days")) || DEFAULT_DAYS, 1), MAX_DAYS);
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();
  const orgFilter = req.nextUrl.searchParams.get("org");

  const supabase = inferenceAdminClient();
  const inf = () => supabase.schema("inference");

  const spans: SpanRow[] = [];
  let total: number | null = null;
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    let q = inf()
      .from("trace_spans")
      .select(COLUMNS, { count: "exact" })
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (orgFilter) q = q.eq("org_id", orgFilter);

    const { data, error, count } = await q.returns<SpanRow[]>();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (typeof count === "number") total = count;
    const batch = data ?? [];
    spans.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }

  // Org names, so the by-customer table is not a wall of uuids.
  const { data: orgRows } = await inf()
    .from("orgs")
    .select("id, name")
    .returns<Array<{ id: string; name: string | null }>>();
  const orgNames: Record<string, string> = {};
  for (const o of orgRows ?? []) orgNames[o.id] = o.name ?? "(unnamed)";

  const summary = summarize(spans);

  return NextResponse.json({
    window: {
      days,
      org: orgFilter,
      spans: spans.length,
      total,
      /** True means percentiles below cover only part of the window. */
      truncated: truncated || (total !== null && spans.length < total),
    },
    /**
     * Instrumentation caveats, measured per request rather than assumed, so they
     * self-correct if the platform starts recording these.
     */
    caveats: {
      /** ~0.1% live. A TTFT percentile over that would be one sample as a statistic. */
      ttft_coverage_pct: summary.ttft_coverage_pct,
      ttft_usable: summary.ttft_coverage_pct >= 50,
      /** Every span is a root span live — these are per-request records, not call trees. */
      spans_are_flat: summary.flat,
      /** The A/B columns exist but nothing writes them. */
      experiments_unused: summary.experiments_unused,
    },
    summary,
    by_modality: sortByConcern(groupBy(spans, (s) => s.name, (k) => k.replace(/^gen_ai\./, ""))),
    by_model: sortByConcern(groupBy(spans, (s) => s.model_id)),
    by_org: groupBy(spans, (s) => s.org_id, (k) => orgNames[k] ?? k.slice(0, 8)),
    errors: errorBreakdown(spans),
    guardrails: guardrailBreakdown(spans),
    slowest: slowest(spans, SLOWEST_LIMIT).map((s) => ({
      id: s.id,
      trace_id: s.trace_id,
      name: s.name,
      model_id: s.model_id,
      org: s.org_id ? orgNames[s.org_id] ?? s.org_id.slice(0, 8) : null,
      status: s.status,
      latency_ms: s.latency_ms,
      guardrail_action: s.guardrail_action,
      created_at: s.created_at,
    })),
  });
}
