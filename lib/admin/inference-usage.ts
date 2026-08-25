/**
 * Usage analytics for the admin — pure, DB-free, UI-free.
 *
 * The question this answers is "where is the money and what is failing", per
 * org, model and day. Doc: nextstespsAI/21-admin-platform.md (§4, section A3).
 *
 * ONE RULE DOMINATES THIS FILE — margin coverage.
 * `inference.usage.upstream_cost_cents` falls back to `cost_cents` whenever a
 * model has no synced upstream price (see workers/inference/src/consumers/
 * usage.ts: "reporting upstream_cost_cents=0 ... would show 100% margin, a
 * worse lie than 0%"). Because `upstream_pricing` was empty platform-wide until
 * 2026-07-28, EVERY historical row echoes cost and therefore reports 0% margin.
 *
 * Averaging that would state "we make nothing" as a fact, when the truth is "we
 * did not measure". So margin here is computed ONLY over rows where the two
 * numbers actually differ, and the share of spend that is measured is reported
 * alongside it. A margin figure without its coverage is not a number worth
 * showing.
 */

export interface UsageRow {
  org_id: string | null;
  model_id: string | null;
  modality: string | null;
  status: string | null;
  error_code: string | null;
  cost_cents: number | null;
  upstream_cost_cents: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_tokens: number | null;
  latency_ms: number | null;
  billed_to: string | null;
  created_at: string;
}

function n(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** A row carries real margin information only when the two costs differ. */
export function hasMeasuredCost(row: UsageRow): boolean {
  const charged = n(row.cost_cents);
  if (charged <= 0) return false;
  return n(row.upstream_cost_cents) !== charged;
}

export function isSuccess(row: UsageRow): boolean {
  return row.status === "success";
}

// ── Headline summary ─────────────────────────────────────────────────────────

export interface UsageSummary {
  requests: number;
  successes: number;
  errors: number;
  error_rate_pct: number | null;
  revenue_cents: number;
  /** Upstream cost across rows we can actually measure. */
  measured_cost_cents: number;
  /** Revenue across those same rows — the denominator for margin. */
  measured_revenue_cents: number;
  margin_pct: number | null;
  /** Share of paid revenue whose cost basis is real, 0–100. */
  margin_coverage_pct: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  avg_latency_ms: number | null;
}

export function summarize(rows: UsageRow[]): UsageSummary {
  let revenue = 0;
  let measuredRevenue = 0;
  let measuredCost = 0;
  let successes = 0;
  let latencySum = 0;
  let latencyCount = 0;
  let input = 0;
  let output = 0;
  let cached = 0;

  for (const row of rows) {
    revenue += n(row.cost_cents);
    if (isSuccess(row)) successes++;
    if (hasMeasuredCost(row)) {
      measuredRevenue += n(row.cost_cents);
      measuredCost += n(row.upstream_cost_cents);
    }
    if (n(row.latency_ms) > 0) {
      latencySum += n(row.latency_ms);
      latencyCount++;
    }
    input += n(row.input_tokens);
    output += n(row.output_tokens);
    cached += n(row.cached_tokens);
  }

  const errors = rows.length - successes;
  return {
    requests: rows.length,
    successes,
    errors,
    error_rate_pct: rows.length === 0 ? null : (errors / rows.length) * 100,
    revenue_cents: revenue,
    measured_cost_cents: measuredCost,
    measured_revenue_cents: measuredRevenue,
    margin_pct: measuredRevenue === 0 ? null : ((measuredRevenue - measuredCost) / measuredRevenue) * 100,
    margin_coverage_pct: revenue === 0 ? 0 : (measuredRevenue / revenue) * 100,
    input_tokens: input,
    output_tokens: output,
    cached_tokens: cached,
    avg_latency_ms: latencyCount === 0 ? null : Math.round(latencySum / latencyCount),
  };
}

// ── Grouped breakdowns ───────────────────────────────────────────────────────

export interface UsageBucket {
  key: string;
  requests: number;
  errors: number;
  error_rate_pct: number;
  revenue_cents: number;
  measured_revenue_cents: number;
  measured_cost_cents: number;
  margin_pct: number | null;
  avg_latency_ms: number | null;
}

function bucketOf(rows: UsageRow[], key: string): UsageBucket {
  const s = summarize(rows);
  return {
    key,
    requests: s.requests,
    errors: s.errors,
    error_rate_pct: s.error_rate_pct ?? 0,
    revenue_cents: s.revenue_cents,
    measured_revenue_cents: s.measured_revenue_cents,
    measured_cost_cents: s.measured_cost_cents,
    margin_pct: s.margin_pct,
    avg_latency_ms: s.avg_latency_ms,
  };
}

/** Group by any field, ranked by revenue — "where is the money" first. */
export function groupBy(
  rows: UsageRow[],
  pick: (row: UsageRow) => string | null | undefined,
  fallback = "(unknown)"
): UsageBucket[] {
  const groups = new Map<string, UsageRow[]>();
  for (const row of rows) {
    const key = pick(row) || fallback;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.entries()]
    .map(([key, list]) => bucketOf(list, key))
    .sort((a, b) => b.revenue_cents - a.revenue_cents || b.requests - a.requests);
}

/** Daily series, oldest first, with empty days omitted (not zero-filled). */
export function byDay(rows: UsageRow[]): UsageBucket[] {
  return groupBy(rows, (r) => r.created_at.slice(0, 10)).sort((a, b) => a.key.localeCompare(b.key));
}

export interface ErrorBucket {
  code: string;
  count: number;
  share_pct: number;
  models: string[];
}

/**
 * Failures grouped by code, with the models they hit. `upstream_404` pointing
 * at one model is a catalog problem; spread across many is an outage.
 */
export function errorBreakdown(rows: UsageRow[]): ErrorBucket[] {
  const failures = rows.filter((r) => !isSuccess(r));
  const groups = new Map<string, { count: number; models: Set<string> }>();
  for (const row of failures) {
    const code = row.error_code || row.status || "unknown";
    const entry = groups.get(code) ?? { count: 0, models: new Set<string>() };
    entry.count++;
    if (row.model_id) entry.models.add(row.model_id);
    groups.set(code, entry);
  }
  return [...groups.entries()]
    .map(([code, e]) => ({
      code,
      count: e.count,
      share_pct: failures.length === 0 ? 0 : (e.count / failures.length) * 100,
      models: [...e.models].sort(),
    }))
    .sort((a, b) => b.count - a.count);
}

/** Filter to a trailing window, e.g. the last 7 days. */
export function withinDays(rows: UsageRow[], days: number, now: number): UsageRow[] {
  const cutoff = now - days * 86_400_000;
  return rows.filter((row) => {
    const t = Date.parse(row.created_at);
    return !Number.isNaN(t) && t >= cutoff;
  });
}
