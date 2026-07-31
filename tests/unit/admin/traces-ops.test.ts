import { describe, it, expect } from "vitest";
import {
  errorBreakdown,
  groupBy,
  guardrailBreakdown,
  humanLatency,
  isError,
  latencyStats,
  percentile,
  slowest,
  sortByConcern,
  summarize,
  type SpanRow,
} from "@/lib/admin/traces-ops";

// Doc: nextstespsAI/21-admin-platform.md (§4 A6 — trace_spans had no surface).
// Verified against 1,527 live spans on 2026-07-30.

const span = (p: Partial<SpanRow> & Pick<SpanRow, "id">): SpanRow => ({
  trace_id: p.id,
  parent_span_id: null,
  name: "gen_ai.chat",
  status: "success",
  latency_ms: 100,
  ttft_ms: null,
  org_id: "o1",
  model_id: "openai/gpt-4o-mini",
  guardrail_action: "clean",
  prompt_id: null,
  arm: null,
  experiment_id: null,
  cost_cents: 1,
  input_tokens: 10,
  output_tokens: 20,
  created_at: "2026-07-30T00:00:00Z",
  ...p,
});

describe("percentile — nearest rank, never interpolated", () => {
  it("returns a value that actually occurred", () => {
    // An interpolated p95 reports a latency no request experienced, which is
    // useless when matching a number against a real slow request.
    const v = [10, 20, 30, 40, 50];
    expect(v).toContain(percentile(v, 0.5));
    expect(v).toContain(percentile(v, 0.95));
  });

  it("p50 of five values is the middle one", () => {
    expect(percentile([10, 20, 30, 40, 50], 0.5)).toBe(30);
  });

  it("p100 and p0 are the extremes", () => {
    expect(percentile([1, 2, 3], 1)).toBe(3);
    expect(percentile([1, 2, 3], 0)).toBe(1);
  });

  it("a single sample is its own percentile", () => {
    expect(percentile([42], 0.95)).toBe(42);
  });

  it("an empty set has no percentile — null, not zero", () => {
    // Zero would read as "instant", which is the opposite of "unknown".
    expect(percentile([], 0.5)).toBeNull();
  });

  it("clamps out-of-range p instead of indexing off the end", () => {
    expect(percentile([1, 2, 3], 5)).toBe(3);
    expect(percentile([1, 2, 3], -1)).toBe(1);
  });
});

describe("latencyStats", () => {
  it("reports the sample count, because every figure depends on it", () => {
    const s = latencyStats([10, 20, 30]);
    expect(s.samples).toBe(3);
    expect(s.mean).toBe(20);
    expect(s.max).toBe(30);
  });

  it("ignores nulls and non-finite values rather than treating them as zero", () => {
    const s = latencyStats([10, null, undefined, NaN, Infinity, 30]);
    expect(s.samples).toBe(2);
    expect(s.mean).toBe(20);
  });

  it("ignores negative latencies, which cannot be real", () => {
    expect(latencyStats([-5, 10]).samples).toBe(1);
  });

  it("all-null input yields nulls, not zeros", () => {
    const s = latencyStats([null, null]);
    expect(s.samples).toBe(0);
    expect(s.p50).toBeNull();
    expect(s.mean).toBeNull();
    expect(s.max).toBeNull();
  });
});

describe("isError", () => {
  it("treats the live error statuses as errors", () => {
    for (const s of ["error_validation", "error_upstream", "error_guardrail_blocked"]) {
      expect(isError(s), s).toBe(true);
    }
  });

  it("treats success and ok as fine, and an absent status as not an error", () => {
    expect(isError("success")).toBe(false);
    expect(isError("ok")).toBe(false);
    expect(isError(null)).toBe(false);
    expect(isError("")).toBe(false);
  });
});

describe("summarize — instrumentation gaps are reported, not hidden", () => {
  it("reports TTFT coverage so one sample is never dressed up as a statistic", () => {
    // Live: ttft_ms is set on 1 span in 1,527 (0.065%).
    const spans = [span({ id: "a", ttft_ms: 500 }), ...Array.from({ length: 99 }, (_, i) => span({ id: `b${i}` }))];
    const s = summarize(spans);
    expect(s.ttft.samples).toBe(1);
    expect(s.ttft_coverage_pct).toBeCloseTo(1, 5);
  });

  it("detects that spans are flat — there is no call tree to show", () => {
    const s = summarize([span({ id: "a" }), span({ id: "b" })]);
    expect(s.flat).toBe(true);
    expect(s.traces).toBe(2); // as many traces as spans
  });

  it("stops claiming flat as soon as anything nests", () => {
    const s = summarize([span({ id: "a" }), span({ id: "b", parent_span_id: "a" })]);
    expect(s.flat).toBe(false);
  });

  it("an empty window is not 'flat' — there is nothing to conclude", () => {
    expect(summarize([]).flat).toBe(false);
  });

  it("detects the unused A/B columns, and un-detects them if one is written", () => {
    expect(summarize([span({ id: "a" })]).experiments_unused).toBe(true);
    expect(summarize([span({ id: "a", experiment_id: "e1" })]).experiments_unused).toBe(false);
    expect(summarize([span({ id: "a", arm: "control" })]).experiments_unused).toBe(false);
  });

  it("counts guardrail hits but not clean traffic", () => {
    const s = summarize([
      span({ id: "a", guardrail_action: "clean" }),
      span({ id: "b", guardrail_action: "blocked" }),
      span({ id: "c", guardrail_action: "flagged" }),
      span({ id: "d", guardrail_action: "redacted" }),
    ]);
    expect(s.guardrail_hits).toBe(3);
    expect(s.guardrail_blocked).toBe(1);
  });

  it("treats a missing guardrail_action as clean", () => {
    expect(summarize([span({ id: "a", guardrail_action: null })]).guardrail_hits).toBe(0);
  });
});

describe("groupBy", () => {
  it("computes error rate and latency per group", () => {
    const spans = [
      span({ id: "a", model_id: "m1", latency_ms: 100 }),
      span({ id: "b", model_id: "m1", latency_ms: 300, status: "error_upstream" }),
      span({ id: "c", model_id: "m2", latency_ms: 50 }),
    ];
    const buckets = groupBy(spans, (s) => s.model_id);
    const m1 = buckets.find((b) => b.key === "m1")!;
    expect(m1.spans).toBe(2);
    expect(m1.errors).toBe(1);
    expect(m1.error_rate_pct).toBe(50);
    expect(m1.latency.max).toBe(300);
  });

  it("labels groups when a labeller is given, e.g. stripping the gen_ai prefix", () => {
    const buckets = groupBy([span({ id: "a", name: "gen_ai.chat" })], (s) => s.name, (k) => k.replace(/^gen_ai\./, ""));
    expect(buckets[0].label).toBe("chat");
  });

  it("buckets a null key as (none) rather than dropping the span", () => {
    const buckets = groupBy([span({ id: "a", model_id: null })], (s) => s.model_id);
    expect(buckets[0].key).toBe("(none)");
    expect(buckets[0].spans).toBe(1);
  });

  it("orders by volume", () => {
    const spans = [
      span({ id: "a", model_id: "small" }),
      span({ id: "b", model_id: "big" }),
      span({ id: "c", model_id: "big" }),
    ];
    expect(groupBy(spans, (s) => s.model_id).map((b) => b.key)).toEqual(["big", "small"]);
  });
});

describe("breakdowns", () => {
  it("errorBreakdown counts only failures, with shares over the failures", () => {
    const spans = [
      span({ id: "a" }),
      span({ id: "b", status: "error_validation" }),
      span({ id: "c", status: "error_validation" }),
      span({ id: "d", status: "error_upstream" }),
    ];
    const e = errorBreakdown(spans);
    expect(e[0]).toMatchObject({ key: "error_validation", count: 2 });
    expect(e.reduce((n, x) => n + x.count, 0)).toBe(3);
  });

  it("guardrailBreakdown includes clean traffic, so shares are over ALL spans", () => {
    const spans = [span({ id: "a" }), span({ id: "b", guardrail_action: "blocked" })];
    const g = guardrailBreakdown(spans);
    expect(g.find((x) => x.key === "clean")!.share_pct).toBe(50);
  });
});

describe("slowest", () => {
  it("returns the worst offenders, including slow failures", () => {
    const spans = [
      span({ id: "fast", latency_ms: 10 }),
      span({ id: "slow-fail", latency_ms: 9000, status: "error_upstream" }),
      span({ id: "mid", latency_ms: 500 }),
    ];
    expect(slowest(spans, 2).map((s) => s.id)).toEqual(["slow-fail", "mid"]);
  });

  it("skips spans with no latency rather than sorting them as zero", () => {
    const spans = [span({ id: "a", latency_ms: null }), span({ id: "b", latency_ms: 5 })];
    expect(slowest(spans).map((s) => s.id)).toEqual(["b"]);
  });
});

describe("sortByConcern", () => {
  it("puts failing groups ahead of merely slow ones", () => {
    // Live shape: chat has 15.8% errors at p95 5.7s; music is slower (13.2s) but
    // has no failures. The failing group is the one to look at first.
    const spans = [
      span({ id: "s1", name: "slow", latency_ms: 20_000 }),
      span({ id: "f1", name: "failing", latency_ms: 100, status: "error_validation" }),
      span({ id: "f2", name: "failing", latency_ms: 100 }),
    ];
    const sorted = sortByConcern(groupBy(spans, (s) => s.name));
    expect(sorted[0].key).toBe("failing");
  });
});

describe("humanLatency", () => {
  it("scales so a column of raw ms becomes readable", () => {
    expect(humanLatency(950)).toBe("950ms");
    expect(humanLatency(1377)).toBe("1.4s");
    expect(humanLatency(31210)).toBe("31s");
  });

  it("null is an em dash, not 0ms", () => {
    expect(humanLatency(null)).toBe("—");
  });
});
