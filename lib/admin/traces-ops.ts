/**
 * Observability over `inference.trace_spans` — pure, DB-free, UI-free.
 *
 * §4 A6 of nextstespsAI/21-admin-platform.md: the audit trail got a surface, and
 * `trace_spans` did not. This is the latency-and-outcome half — it answers "which
 * model is slow", "what is failing and why", and "are guardrails blocking real
 * traffic", none of which the usage explorer can show (that has cost and margin).
 *
 * THREE THINGS THE LIVE DATA SAYS, measured over 1,000 spans on 2026-07-30, which
 * this module reports rather than papers over:
 *
 *  1. `ttft_ms` is populated on ~1 span in 1,000. Time-to-first-token is
 *     effectively NOT being recorded, so any TTFT figure would be one sample
 *     dressed up as a statistic. Coverage is reported alongside it.
 *  2. Every span is a root span — `parent_span_id` is null on all of them, and
 *     there are exactly as many traces as spans. There is no nesting, so this is
 *     a per-request record, not a call tree. Nothing here implies stage breakdown.
 *  3. `arm` and `experiment_id` are entirely unused (0 experiments). The A/B
 *     columns exist but nothing writes them.
 */

/** One row of `inference.trace_spans`, reduced to what an operator reads. */
export interface SpanRow {
  id: string;
  trace_id: string | null;
  parent_span_id: string | null;
  name: string | null;
  status: string | null;
  latency_ms: number | null;
  ttft_ms: number | null;
  org_id: string | null;
  model_id: string | null;
  guardrail_action: string | null;
  prompt_id: string | null;
  arm: string | null;
  experiment_id: string | null;
  cost_cents: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string | null;
}

/**
 * Nearest-rank percentile over a PRE-SORTED ascending array.
 *
 * Deliberately not interpolating: an interpolated p95 reports a latency no request
 * actually experienced, which is worse than useless when an operator is trying to
 * match a number against a real slow request.
 */
export function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const clamped = Math.min(Math.max(p, 0), 1);
  const rank = Math.ceil(clamped * sortedAsc.length);
  return sortedAsc[Math.min(Math.max(rank - 1, 0), sortedAsc.length - 1)];
}

export interface LatencyStats {
  /** How many spans carried a usable latency — the basis for every figure here. */
  samples: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
  mean: number | null;
}

export function latencyStats(values: Array<number | null | undefined>): LatencyStats {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0);
  nums.sort((a, b) => a - b);
  const sum = nums.reduce((n, v) => n + v, 0);
  return {
    samples: nums.length,
    p50: percentile(nums, 0.5),
    p95: percentile(nums, 0.95),
    p99: percentile(nums, 0.99),
    max: nums.length ? nums[nums.length - 1] : null,
    mean: nums.length ? Math.round(sum / nums.length) : null,
  };
}

/** A status is an error when it is not plain success. */
export function isError(status: string | null): boolean {
  const s = (status ?? "").toLowerCase();
  return s !== "" && s !== "success" && s !== "ok";
}

export interface Bucket {
  key: string;
  label: string;
  spans: number;
  errors: number;
  error_rate_pct: number;
  latency: LatencyStats;
  cost_cents: number;
  /** Guardrail outcomes other than 'clean'. */
  guardrail_hits: number;
}

/** Group spans by a key, with latency and error rate per group. */
export function groupBy(
  spans: SpanRow[],
  keyOf: (s: SpanRow) => string | null,
  labelOf?: (key: string) => string
): Bucket[] {
  const groups = new Map<string, SpanRow[]>();
  for (const s of spans) {
    const k = keyOf(s) ?? "(none)";
    const list = groups.get(k);
    if (list) list.push(s);
    else groups.set(k, [s]);
  }
  const out: Bucket[] = [];
  for (const [key, rows] of groups) {
    const errors = rows.filter((r) => isError(r.status)).length;
    out.push({
      key,
      label: labelOf ? labelOf(key) : key,
      spans: rows.length,
      errors,
      error_rate_pct: rows.length ? (errors / rows.length) * 100 : 0,
      latency: latencyStats(rows.map((r) => r.latency_ms)),
      cost_cents: rows.reduce((n, r) => n + (r.cost_cents ?? 0), 0),
      guardrail_hits: rows.filter((r) => (r.guardrail_action ?? "clean") !== "clean").length,
    });
  }
  return out.sort((a, b) => b.spans - a.spans);
}

export interface CountBucket {
  key: string;
  count: number;
  share_pct: number;
}

function countBy(spans: SpanRow[], keyOf: (s: SpanRow) => string | null): CountBucket[] {
  const counts = new Map<string, number>();
  for (const s of spans) {
    const k = keyOf(s) ?? "(none)";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const total = spans.length || 1;
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count, share_pct: (count / total) * 100 }))
    .sort((a, b) => b.count - a.count);
}

export function errorBreakdown(spans: SpanRow[]): CountBucket[] {
  return countBy(spans.filter((s) => isError(s.status)), (s) => s.status);
}

/**
 * Guardrail outcomes. Reported even when `guardrail_policies` is empty — live,
 * 17 of 1,000 spans were blocked, flagged or redacted with zero configured
 * policies, which is exactly the kind of thing an operator should be able to see.
 */
export function guardrailBreakdown(spans: SpanRow[]): CountBucket[] {
  return countBy(spans, (s) => s.guardrail_action ?? "clean");
}

export interface TraceSummary {
  spans: number;
  /** Distinct trace ids. Equal to `spans` when nothing nests — see the module note. */
  traces: number;
  /** True when no span has a parent, i.e. these are single-span traces. */
  flat: boolean;
  errors: number;
  error_rate_pct: number;
  latency: LatencyStats;
  ttft: LatencyStats;
  /** Share of spans carrying a ttft_ms at all. Low means TTFT is not instrumented. */
  ttft_coverage_pct: number;
  guardrail_hits: number;
  guardrail_blocked: number;
  cost_cents: number;
  orgs: number;
  models: number;
  /** True when A/B columns are entirely unused. */
  experiments_unused: boolean;
}

export function summarize(spans: SpanRow[]): TraceSummary {
  const errors = spans.filter((s) => isError(s.status)).length;
  const ttftValues = spans.map((s) => s.ttft_ms).filter((v): v is number => typeof v === "number");
  const guardrailHits = spans.filter((s) => (s.guardrail_action ?? "clean") !== "clean").length;
  return {
    spans: spans.length,
    traces: new Set(spans.map((s) => s.trace_id ?? s.id)).size,
    flat: spans.length > 0 && spans.every((s) => !s.parent_span_id),
    errors,
    error_rate_pct: spans.length ? (errors / spans.length) * 100 : 0,
    latency: latencyStats(spans.map((s) => s.latency_ms)),
    ttft: latencyStats(ttftValues),
    ttft_coverage_pct: spans.length ? (ttftValues.length / spans.length) * 100 : 0,
    guardrail_hits: guardrailHits,
    guardrail_blocked: spans.filter((s) => (s.guardrail_action ?? "") === "blocked").length,
    cost_cents: spans.reduce((n, s) => n + (s.cost_cents ?? 0), 0),
    orgs: new Set(spans.map((s) => s.org_id).filter(Boolean)).size,
    models: new Set(spans.map((s) => s.model_id).filter(Boolean)).size,
    experiments_unused: spans.every((s) => !s.experiment_id && !s.arm),
  };
}

/**
 * The slowest spans, for the "why is this customer complaining" question.
 * Errors are included — a slow failure is still a slow request.
 */
export function slowest(spans: SpanRow[], limit = 20): SpanRow[] {
  return [...spans]
    .filter((s) => typeof s.latency_ms === "number")
    .sort((a, b) => (b.latency_ms ?? 0) - (a.latency_ms ?? 0))
    .slice(0, limit);
}

/** Groups worth attention first: failing, then slow. */
export function sortByConcern(buckets: Bucket[]): Bucket[] {
  return [...buckets].sort((a, b) => {
    const aBad = a.error_rate_pct >= 5 ? 0 : 1;
    const bBad = b.error_rate_pct >= 5 ? 0 : 1;
    if (aBad !== bBad) return aBad - bBad;
    return (b.latency.p95 ?? 0) - (a.latency.p95 ?? 0);
  });
}

/** ms → a short human string, so a column of 31210 reads as 31.2s. */
export function humanLatency(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000)}s`;
}
