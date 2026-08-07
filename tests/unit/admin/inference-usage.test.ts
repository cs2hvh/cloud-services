import { describe, it, expect } from "vitest";
import {
  byDay,
  errorBreakdown,
  groupBy,
  hasMeasuredCost,
  summarize,
  withinDays,
  type UsageRow,
} from "@/lib/admin/inference-usage";

// Doc: nextstespsAI/21-admin-platform.md (§4, A3). The load-bearing rule is
// margin coverage — see the file header in lib/admin/inference-usage.ts.

const NOW = Date.parse("2026-07-29T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

function row(p: Partial<UsageRow> = {}): UsageRow {
  return {
    org_id: "org-1",
    model_id: "openai/gpt-4o-mini",
    modality: "chat",
    status: "success",
    error_code: null,
    cost_cents: 100,
    upstream_cost_cents: 50,
    input_tokens: 1000,
    output_tokens: 500,
    cached_tokens: 0,
    latency_ms: 800,
    billed_to: "platform",
    created_at: daysAgo(1),
    ...p,
  };
}

describe("hasMeasuredCost — the fallback guard", () => {
  it("is true only when upstream cost differs from what we charged", () => {
    expect(hasMeasuredCost(row({ cost_cents: 100, upstream_cost_cents: 50 }))).toBe(true);
  });

  it("is FALSE when upstream echoes cost — that is the unmeasured fallback", () => {
    // Every historical row looks like this: the consumer copies cost_cents when
    // a model has no synced upstream price. Treating it as 0% margin would
    // state "we make nothing" as fact.
    expect(hasMeasuredCost(row({ cost_cents: 100, upstream_cost_cents: 100 }))).toBe(false);
  });

  it("is false for free rows", () => {
    expect(hasMeasuredCost(row({ cost_cents: 0, upstream_cost_cents: 0 }))).toBe(false);
  });
});

describe("summarize", () => {
  it("counts requests, errors and the error rate", () => {
    const s = summarize([row(), row(), row({ status: "error_upstream", error_code: "upstream_404" })]);
    expect(s.requests).toBe(3);
    expect(s.successes).toBe(2);
    expect(s.errors).toBe(1);
    expect(s.error_rate_pct).toBeCloseTo(33.33, 1);
  });

  it("computes margin ONLY over measured rows, and reports coverage", () => {
    const rows = [
      row({ cost_cents: 100, upstream_cost_cents: 50 }), // measured, 50%
      row({ cost_cents: 300, upstream_cost_cents: 300 }), // fallback — excluded
    ];
    const s = summarize(rows);
    expect(s.revenue_cents).toBe(400);
    expect(s.measured_revenue_cents).toBe(100);
    expect(s.margin_pct).toBe(50); // NOT 12.5% — the fallback row is not evidence
    expect(s.margin_coverage_pct).toBe(25); // 100 of 400 revenue is measured
  });

  it("returns a NULL margin when nothing is measured — never 0%", () => {
    // The real state of the platform today: 1,538 priced rows, none measured.
    const s = summarize([row({ cost_cents: 100, upstream_cost_cents: 100 })]);
    expect(s.margin_pct).toBeNull();
    expect(s.margin_coverage_pct).toBe(0);
  });

  it("sums tokens and averages latency over rows that reported it", () => {
    const s = summarize([row({ latency_ms: 100 }), row({ latency_ms: 300 }), row({ latency_ms: null })]);
    expect(s.avg_latency_ms).toBe(200);
    expect(s.input_tokens).toBe(3000);
    expect(s.output_tokens).toBe(1500);
  });

  it("handles an empty set without dividing by zero", () => {
    const s = summarize([]);
    expect(s.requests).toBe(0);
    expect(s.error_rate_pct).toBeNull();
    expect(s.margin_pct).toBeNull();
    expect(s.avg_latency_ms).toBeNull();
  });
});

describe("groupBy", () => {
  const rows = [
    row({ model_id: "openai/gpt-4o", cost_cents: 500 }),
    row({ model_id: "openai/gpt-4o", cost_cents: 300 }),
    row({ model_id: "openai/gpt-4o-mini", cost_cents: 100 }),
    row({ model_id: null, cost_cents: 10 }),
  ];

  it("ranks by revenue — where the money is, first", () => {
    const buckets = groupBy(rows, (r) => r.model_id);
    expect(buckets[0].key).toBe("openai/gpt-4o");
    expect(buckets[0].revenue_cents).toBe(800);
    expect(buckets[0].requests).toBe(2);
  });

  it("labels missing keys rather than dropping the rows", () => {
    expect(groupBy(rows, (r) => r.model_id).some((b) => b.key === "(unknown)")).toBe(true);
  });

  it("carries per-bucket error rate and margin", () => {
    const buckets = groupBy(
      [row({ model_id: "m", status: "error_auth", cost_cents: 0, upstream_cost_cents: 0 }), row({ model_id: "m" })],
      (r) => r.model_id
    );
    expect(buckets[0].error_rate_pct).toBe(50);
    expect(buckets[0].margin_pct).toBe(50);
  });
});

describe("byDay", () => {
  it("returns oldest first so a chart reads left to right", () => {
    const series = byDay([row({ created_at: daysAgo(1) }), row({ created_at: daysAgo(5) }), row({ created_at: daysAgo(3) })]);
    expect(series.map((b) => b.key)).toEqual([daysAgo(5).slice(0, 10), daysAgo(3).slice(0, 10), daysAgo(1).slice(0, 10)]);
  });
});

describe("errorBreakdown", () => {
  it("ranks failures by code and names the models they hit", () => {
    const errors = errorBreakdown([
      row(),
      row({ status: "error_upstream", error_code: "upstream_400", model_id: "a" }),
      row({ status: "error_upstream", error_code: "upstream_400", model_id: "b" }),
      row({ status: "error_auth", error_code: "bad_key", model_id: "a" }),
    ]);
    expect(errors[0].code).toBe("upstream_400");
    expect(errors[0].count).toBe(2);
    expect(errors[0].models).toEqual(["a", "b"]);
    expect(errors[0].share_pct).toBeCloseTo(66.67, 1);
  });

  it("falls back to status when a failure carries no code", () => {
    expect(errorBreakdown([row({ status: "error_validation", error_code: null })])[0].code).toBe("error_validation");
  });

  it("is empty when everything succeeded", () => {
    expect(errorBreakdown([row(), row()])).toEqual([]);
  });
});

describe("withinDays", () => {
  it("keeps only rows inside the trailing window", () => {
    const rows = [row({ created_at: daysAgo(1) }), row({ created_at: daysAgo(10) })];
    expect(withinDays(rows, 7, NOW)).toHaveLength(1);
    expect(withinDays(rows, 30, NOW)).toHaveLength(2);
  });

  it("drops rows with an unparseable timestamp rather than guessing", () => {
    expect(withinDays([row({ created_at: "not-a-date" })], 7, NOW)).toHaveLength(0);
  });
});
