import { test } from "node:test";
import assert from "node:assert/strict";
import { summariseHealth, healthVerdict, humanDuration, type UsageSample } from "./health.ts";

const sample = (over: Partial<UsageSample> = {}): UsageSample => ({
  sampled_at: "2026-08-27T09:00:00Z",
  pod_seconds: 900,
  warm_seconds: 900,
  peak_pods: 1,
  restarts: 0,
  unobserved_seconds: 0,
  period_seconds: 900,
  ...over,
});

test("an empty window is unknown, never healthy and never down", () => {
  const h = summariseHealth([]);
  assert.equal(h.samples, 0);
  assert.equal(h.uptimePct, null);
  assert.equal(healthVerdict(h).state, "unknown");
});

test("a fully warm window is 100%", () => {
  const h = summariseHealth([sample(), sample({ sampled_at: "2026-08-27T09:15:00Z" })]);
  assert.equal(h.uptimePct, 100);
  assert.equal(healthVerdict(h).state, "healthy");
});

test("UNOBSERVED TIME IS EXCLUDED FROM THE DENOMINATOR", () => {
  // The trap this module exists for. A sampler that was down for half the
  // window must not make the customer's app look 50% down — they would go
  // hunting for a fault in their code that is actually a fault in ours.
  const h = summariseHealth([
    sample({ period_seconds: 900, unobserved_seconds: 450, warm_seconds: 450 }),
  ]);
  assert.equal(h.observedSeconds, 450);
  assert.equal(h.uptimePct, 100, "warm for all of the time we could actually see");
  assert.equal(h.unobservedSeconds, 450);
});

test("NOTHING OBSERVED IS NULL, NOT ZERO", () => {
  // Zero means "we watched and it was down". Null means "we cannot say". They
  // are opposite messages and a dashboard that confuses them stops being
  // trusted the first time somebody checks.
  const h = summariseHealth([sample({ period_seconds: 900, unobserved_seconds: 900, warm_seconds: 0 })]);
  assert.equal(h.observedSeconds, 0);
  assert.equal(h.uptimePct, null);
  assert.equal(healthVerdict(h).state, "unknown");
});

test("a genuinely down app reports down", () => {
  // The paired proof: the check must be capable of saying down, or excluding
  // unobserved time would just make everything look fine.
  const h = summariseHealth([sample({ warm_seconds: 0 })]);
  assert.equal(h.uptimePct, 0);
  assert.equal(healthVerdict(h).state, "down");
});

test("partial serving is degraded, not healthy and not down", () => {
  const h = summariseHealth([sample({ warm_seconds: 630 })]); // 70%
  assert.equal(h.uptimePct, 70);
  assert.equal(healthVerdict(h).state, "degraded");
});

test("a corrupt sample cannot produce an uptime above 100%", () => {
  // unobserved > period is impossible, and a negative denominator would report
  // something like 400%, which reads as a bug in the app rather than the data.
  const h = summariseHealth([sample({ period_seconds: 900, unobserved_seconds: 5000, warm_seconds: 900 })]);
  assert.equal(h.observedSeconds, 0);
  assert.equal(h.uptimePct, null);
});

test("PostgREST numerics arrive as strings and must still add up", () => {
  const h = summariseHealth([
    sample({ warm_seconds: "450", period_seconds: "900", restarts: "2", peak_pods: "3" }),
  ]);
  assert.equal(h.warmSeconds, 450);
  assert.equal(h.uptimePct, 50);
  assert.equal(h.restarts, 2);
  assert.equal(h.peakPods, 3);
});

test("an unreadable number contributes nothing rather than NaN", () => {
  // NaN propagates through every total it touches and serialises to JSON null,
  // so one bad row would blank the whole panel.
  const h = summariseHealth([sample({ warm_seconds: "abc", restarts: null, peak_pods: undefined as never })]);
  assert.ok(Number.isFinite(h.warmSeconds));
  assert.ok(Number.isFinite(h.restarts));
  assert.equal(h.warmSeconds, 0);
});

test("restarts accumulate and peak is a maximum, not a sum", () => {
  const h = summariseHealth([
    sample({ restarts: 1, peak_pods: 2 }),
    sample({ restarts: 2, peak_pods: 5 }),
    sample({ restarts: 0, peak_pods: 3 }),
  ]);
  assert.equal(h.restarts, 3, "restarts add up across the window");
  assert.equal(h.peakPods, 5, "peak is the highest single value, not the total");
});

test("the window reports its own bounds, ignoring unparseable stamps", () => {
  const h = summariseHealth([
    sample({ sampled_at: "2026-08-27T09:00:00Z" }),
    sample({ sampled_at: "not-a-date" }),
    sample({ sampled_at: "2026-08-27T11:00:00Z" }),
  ]);
  assert.equal(h.from, "2026-08-27T09:00:00Z");
  assert.equal(h.to, "2026-08-27T11:00:00Z");
});

test("durations read like durations", () => {
  assert.equal(humanDuration(0), "0m");
  assert.equal(humanDuration(-5), "0m");
  assert.equal(humanDuration(600), "10m");
  assert.equal(humanDuration(3600), "1h");
  assert.equal(humanDuration(5400), "1h 30m");
  assert.equal(humanDuration(86400 * 3), "3d");
});
