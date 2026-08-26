/**
 * Cost/margin arithmetic in the usage consumer.
 *
 * `upstream_cost_cents` was a literal copy of `cost_cents` for the platform's
 * whole history — 2,074 of 2,083 rows identical — so every margin figure ever
 * derived from it was exactly zero. These tests pin the corrected behaviour so
 * it cannot silently regress to a copy again.
 *
 * Rates below are the real ones for `anthropic/claude-opus-5` as of the Wokey
 * migration: we sell at vendor list (500/2500/50 cents per Mtok) and Wokey
 * charges us 110/550/11.
 */
import { describe, expect, it } from "vitest";
import { computeCost } from "./usage.ts";
import type { UsageEvent } from "../types.ts";

const SELL = {
  input_cents_per_mtok: 500,
  output_cents_per_mtok: 2500,
  cached_cents_per_mtok: 50,
};
const COST = {
  input_cents_per_mtok: 110,
  output_cents_per_mtok: 550,
  cached_cents_per_mtok: 11,
};

function event(over: Partial<UsageEvent> = {}): UsageEvent {
  return {
    orgId: "org_1",
    apiKeyId: "key_1",
    userId: null,
    modelId: "anthropic/claude-opus-5",
    modality: "chat",
    requestId: "req_1",
    billedTo: "platform",
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cachedTokens: 0,
    numUnits: null,
    unitLabel: null,
    latencyMs: 100,
    ttftMs: null,
    status: "success",
    errorCode: null,
    occurredAt: "2026-08-26T12:00:00.000Z",
    ...over,
  } as UsageEvent;
}

const info = (over: Record<string, unknown> = {}) => ({
  pricing: SELL,
  upstream_pricing: COST,
  off_peak: null,
  ...over,
}) as Parameters<typeof computeCost>[1];

describe("computeCost — upstream cost is real, not a copy", () => {
  it("prices sell and cost from their own rate tables", () => {
    // 1M in + 1M out: sell = 500 + 2500 = 3000c; cost = 110 + 550 = 660c
    const r = computeCost(event(), info());
    expect(r.costCents).toBe(3000);
    expect(r.upstreamCostCents).toBe(660);
  });

  it("produces a margin — the regression that motivated this", () => {
    const r = computeCost(event(), info());
    expect(r.upstreamCostCents).toBeLessThan(r.costCents);
    // ~4.5x, matching the vendor-list-over-Wokey-cost spread
    expect(r.costCents / r.upstreamCostCents).toBeCloseTo(4.55, 1);
  });

  it("falls back to the billed amount when no cost basis is recorded", () => {
    // Honest degradation: report zero margin rather than invent one.
    const r = computeCost(event(), info({ upstream_pricing: null }));
    expect(r.upstreamCostCents).toBe(r.costCents);
  });

  it("charges cached tokens at the cached rate on BOTH sides", () => {
    // 1M input of which 400k cached, no output.
    // sell: 600k*500/1M + 400k*50/1M   = 300 + 20  = 320
    // cost: 600k*110/1M + 400k*11/1M   = 66  + 4.4 = 70.4 -> ceil 71
    const r = computeCost(
      event({ inputTokens: 1_000_000, cachedTokens: 400_000, outputTokens: 0 }),
      info()
    );
    expect(r.costCents).toBe(320);
    expect(r.upstreamCostCents).toBe(71);
  });

  it("does NOT apply the off-peak discount to upstream cost", () => {
    // The single most important case. An off-peak window is a concession WE
    // make to the customer; the upstream still bills us full rate. Discounting
    // both sides would overstate margin during precisely the hours it is
    // thinnest.
    const offPeak = info({
      off_peak: { window_utc: "00:00-23:59", discount_pct: 50 },
    });
    const r = computeCost(event(), offPeak);
    expect(r.isOffPeak).toBe(true);
    expect(r.costCents).toBe(1500);        // 3000 halved
    expect(r.upstreamCostCents).toBe(660); // unchanged
  });

  it("bills nothing, and books no cost, for a failed request", () => {
    // A phantom upstream cost on an error would show as negative margin.
    const r = computeCost(event({ status: "error_upstream" }), info());
    expect(r.costCents).toBe(0);
    expect(r.upstreamCostCents).toBe(0);
  });

  it("books nothing for a model missing from the catalog", () => {
    const r = computeCost(event(), undefined);
    expect(r.costCents).toBe(0);
    expect(r.upstreamCostCents).toBe(0);
  });

  it("rounds each side up independently", () => {
    // Tiny request: both sides are sub-cent and must each ceil to 1, not 0.
    const r = computeCost(
      event({ inputTokens: 10, outputTokens: 10, cachedTokens: 0 }),
      info()
    );
    expect(r.costCents).toBe(1);
    expect(r.upstreamCostCents).toBe(1);
  });
});
