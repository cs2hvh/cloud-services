import { describe, it, expect } from "vitest";
import { computeUnitCost, normalizeNumUnits, computeCost, type PricingInfo } from "../usage.ts";
import type { UsageEvent } from "../../types.ts";

// Doc: nextstespsAI/12-agent-execution-stages.md (T0.4)
// Proves agentcore hosted-tool steps price through the SAME usage pipeline as
// every other per-unit modality — no parallel queue (doc 09 §2.B).

function agentEvent(unitLabel: string, numUnits: number): UsageEvent {
  return {
    orgId: "org_1",
    apiKeyId: "key_1",
    userId: "user_1",
    modelId: "agent/web-search",
    modality: "chat", // irrelevant to computeUnitCost; it switches on unitLabel
    requestId: "req_1",
    billedTo: "platform",
    provider: "openrouter",
    inputTokens: null,
    outputTokens: null,
    cachedTokens: null,
    cacheWriteTokens: null,
    reportedUpstreamCostCents: null,
    numUnits,
    unitLabel,
    costCents: 0,
    upstreamCostCents: 0,
    isOffPeak: false,
    latencyMs: 0,
    ttftMs: null,
    status: "success",
    errorCode: null,
    cacheKind: "none",
    occurredAt: new Date().toISOString(),
  };
}

function chatEvent(opts: {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  reportedUpstreamCostCents?: number | null;
}): UsageEvent {
  return {
    orgId: "org_1",
    apiKeyId: "key_1",
    userId: "user_1",
    modelId: "anthropic/claude-haiku-4.5",
    modality: "chat",
    requestId: "req_1",
    billedTo: "platform",
    provider: "openrouter",
    inputTokens: opts.inputTokens,
    outputTokens: opts.outputTokens,
    cachedTokens: opts.cachedTokens ?? 0,
    cacheWriteTokens: opts.cacheWriteTokens ?? null,
    reportedUpstreamCostCents: opts.reportedUpstreamCostCents ?? null,
    numUnits: null,
    unitLabel: null,
    costCents: 0,
    upstreamCostCents: 0,
    isOffPeak: false,
    latencyMs: 0,
    ttftMs: null,
    status: "success",
    errorCode: null,
    cacheKind: "none",
    occurredAt: new Date().toISOString(),
  };
}

// Regression (found live, 2026-07-15, Phase-0 billing audit): upstream_cost_cents
// used to unconditionally equal cost_cents, so margin (cost_cents -
// upstream_cost_cents) read exactly $0 on every request, forever — a broken
// metric that would silently hide an underpriced/loss-making model.
describe("computeCost — upstream margin", () => {
  const pricing = { input_cents_per_mtok: 300, output_cents_per_mtok: 1500 };

  it("computes a real margin once upstream_pricing is synced", () => {
    const info: PricingInfo = {
      pricing,
      off_peak: null,
      upstreamPricing: { input_cents_per_mtok: 100, output_cents_per_mtok: 500 },
    };
    const event = chatEvent({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
    const r = computeCost(event, info);
    expect(r.costCents).toBe(300 + 1500); // customer rate
    expect(r.upstreamCostCents).toBe(100 + 500); // upstream rate — genuinely different
    expect(r.upstreamCostCents).toBeLessThan(r.costCents); // real margin exists now
  });

  it("falls back to costCents (not 0) when upstream_pricing hasn't synced yet", () => {
    const info: PricingInfo = { pricing, off_peak: null, upstreamPricing: null };
    const event = chatEvent({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
    const r = computeCost(event, info);
    expect(r.upstreamCostCents).toBe(r.costCents); // unmeasured, not "free"
  });

  it("falls back to costCents for an agent/* pseudo-catalog row with no upstream_pricing", () => {
    const info: PricingInfo = { pricing: { cents_per_web_search: 1 }, off_peak: null, upstreamPricing: null };
    const event = agentEvent("web_search", 3);
    const r = computeCost(event, info);
    expect(r.costCents).toBe(3);
    expect(r.upstreamCostCents).toBe(3);
  });

  it("never applies the customer-facing off-peak discount to the upstream figure", () => {
    const info: PricingInfo = {
      pricing,
      off_peak: { window_utc: "00:00-23:59", discount_pct: 50 }, // always on, for the test
      upstreamPricing: { input_cents_per_mtok: 100, output_cents_per_mtok: 500 },
    };
    const event = chatEvent({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
    const r = computeCost(event, info);
    expect(r.isOffPeak).toBe(true);
    expect(r.costCents).toBe((300 + 1500) * 0.5); // customer gets the discount
    expect(r.upstreamCostCents).toBe(100 + 500); // upstream bill is unaffected by OUR promotion
  });

  it("returns 0/0 for a non-success event regardless of pricing", () => {
    const info: PricingInfo = {
      pricing,
      off_peak: null,
      upstreamPricing: { input_cents_per_mtok: 100, output_cents_per_mtok: 500 },
    };
    const event = { ...chatEvent({ inputTokens: 1000, outputTokens: 1000 }), status: "error_upstream" as const };
    const r = computeCost(event, info);
    expect(r.costCents).toBe(0);
    expect(r.upstreamCostCents).toBe(0);
  });
});

describe("computeUnitCost — agentcore tool labels", () => {
  it("prices web_search per search", () => {
    // 3 searches × 1 cent = 3
    expect(computeUnitCost(agentEvent("web_search", 3), { cents_per_web_search: 1 })).toBe(3);
  });

  it("prices cpu_second per CPU-second (rounded up)", () => {
    // 4.2 cpu-sec × 0.06 = 0.252 → ceil → 1
    expect(computeUnitCost(agentEvent("cpu_second", 4.2), { cents_per_cpu_second: 0.06 })).toBe(1);
    // 100 cpu-sec × 0.06 = 6
    expect(computeUnitCost(agentEvent("cpu_second", 100), { cents_per_cpu_second: 0.06 })).toBe(6);
  });

  it("prices function_call per call (rounded up so it never undercounts)", () => {
    // 1 call × 0.02 = 0.02 → ceil → 1 (micro-amounts round up, per computeCost contract)
    expect(computeUnitCost(agentEvent("function_call", 1), { cents_per_function_call: 0.02 })).toBe(1);
  });

  it("prices file_search per query", () => {
    expect(computeUnitCost(agentEvent("file_search", 2), { cents_per_file_search: 1 })).toBe(2);
  });

  it("prices memory_write per write", () => {
    // 1 write × 0.02 = 0.02 → ceil → 1
    expect(computeUnitCost(agentEvent("memory_write", 1), { cents_per_memory_write: 0.02 })).toBe(1);
  });

  it("prices memory_search per search (covers both the explicit tool and auto-recall)", () => {
    expect(computeUnitCost(agentEvent("memory_search", 5), { cents_per_memory_search: 0.02 })).toBe(1);
  });

  it("prices mcp_call per call (doc 14 M2, agent/mcp)", () => {
    expect(computeUnitCost(agentEvent("mcp_call", 1), { cents_per_mcp_call: 0.2 })).toBe(1);
  });

  it("returns 0 when the matching rate is absent", () => {
    expect(computeUnitCost(agentEvent("web_search", 3), {})).toBe(0);
  });

  it("returns 0 for zero/negative units", () => {
    expect(computeUnitCost(agentEvent("web_search", 0), { cents_per_web_search: 1 })).toBe(0);
  });
});

// Regression (found live, 2026-07-06): inference.usage.num_units is INTEGER.
// A real code-interpreter execution reported cpu_seconds=0.0002 — the raw
// fractional value failed the row INSERT ("invalid input syntax for type
// integer") and the queue DROPPED the message after 4 retries. No fake-backed
// test had ever exercised this real Postgres column constraint.
describe("normalizeNumUnits", () => {
  it("ceils a fractional numUnits (a fast code-interpreter run) up to a whole unit", () => {
    const event = agentEvent("cpu_second", 0.0002);
    expect(normalizeNumUnits(event).numUnits).toBe(1);
  });

  it("ceils a fractional value greater than 1 up to the next whole unit", () => {
    const event = agentEvent("cpu_second", 4.2);
    expect(normalizeNumUnits(event).numUnits).toBe(5);
  });

  it("leaves an already-integer numUnits untouched", () => {
    const event = agentEvent("web_search", 3);
    expect(normalizeNumUnits(event).numUnits).toBe(3);
  });

  it("leaves a null numUnits untouched", () => {
    const event = { ...agentEvent("chat", 0), numUnits: null };
    expect(normalizeNumUnits(event).numUnits).toBeNull();
  });

  it("keeps cost computation consistent with the normalized (ceil'd) unit count", () => {
    const event = agentEvent("cpu_second", 0.0002);
    const normalized = normalizeNumUnits(event);
    // 1 (ceil'd) cpu-second × 0.06 = 0.06 → ceil → 1 cent — computed from the
    // SAME normalized event, not the raw fractional one.
    expect(computeUnitCost(normalized, { cents_per_cpu_second: 0.06 })).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cache writes. Regression guard for a live under-billing bug: the cost model
// knew about cache READS only, so the expensive half of prompt caching was
// invisible. A write is 1.25x input at a 5-minute TTL and 2x at an hour — i.e.
// caching a prompt once and never reusing it costs MORE than not caching.
// ─────────────────────────────────────────────────────────────────────────────

describe("computeCost — cache write tokens", () => {
  // 100 in / 10 out per Mtok-cents: input 100, output 500, read 10, write 125.
  const info: PricingInfo = {
    pricing: {
      input_cents_per_mtok: 100,
      output_cents_per_mtok: 500,
      cached_cents_per_mtok: 10,
      cache_write_cents_per_mtok: 125,
    },
    upstreamPricing: null,
    off_peak: null,
  };

  it("prices a cache write ABOVE fresh input, not at zero", () => {
    const written = computeCost(
      chatEvent({ inputTokens: 1_000_000, outputTokens: 0, cacheWriteTokens: 1_000_000 }),
      info,
    ).costCents;
    const fresh = computeCost(
      chatEvent({ inputTokens: 1_000_000, outputTokens: 0 }),
      info,
    ).costCents;

    expect(written).toBe(125);
    expect(fresh).toBe(100);
    // The whole point: writing the cache is the expensive path.
    expect(written).toBeGreaterThan(fresh);
  });

  it("does not double-charge — a written token is not also billed as input", () => {
    // 1M input of which 400k written, 100k read, 500k fresh.
    const cost = computeCost(
      chatEvent({
        inputTokens: 1_000_000,
        outputTokens: 0,
        cachedTokens: 100_000,
        cacheWriteTokens: 400_000,
      }),
      info,
    ).costCents;
    // 500k*100 + 100k*10 + 400k*125, all per Mtok = 50 + 1 + 50 = 101
    expect(cost).toBe(101);
  });

  it("treats an unsynced write rate as input-priced, never as free", () => {
    const cost = computeCost(
      chatEvent({ inputTokens: 1_000_000, outputTokens: 0, cacheWriteTokens: 1_000_000 }),
      { pricing: { input_cents_per_mtok: 100, output_cents_per_mtok: 500 }, upstreamPricing: null, off_peak: null },
    ).costCents;
    expect(cost).toBe(100);
  });

  it("costs nothing extra when the upstream reports no write", () => {
    const cost = computeCost(chatEvent({ inputTokens: 1_000_000, outputTokens: 0 }), info).costCents;
    expect(cost).toBe(100);
  });
});

describe("computeCost — cache writes must not change what customers pay", () => {
  // The safety property behind shipping this at all. Before the write leg
  // existed, cache-write tokens were counted as plain input and charged at the
  // input rate. They are now a separate leg, but with no customer-facing write
  // price set they fall back to the input rate — so the total is identical.
  //
  // Only the UPSTREAM number moves, because upstream_pricing gets a real write
  // rate from the sync. That is what makes margin correct without repricing
  // anybody.
  const customerPricing = { input_cents_per_mtok: 100, output_cents_per_mtok: 500, cached_cents_per_mtok: 10 };

  it("bills the same with and without the write breakdown", () => {
    const withBreakdown = computeCost(
      chatEvent({ inputTokens: 1_000_000, outputTokens: 0, cacheWriteTokens: 300_000 }),
      { pricing: customerPricing, upstreamPricing: null, off_peak: null },
    ).costCents;

    // The same request as the old code saw it: no write field at all.
    const asBefore = computeCost(
      chatEvent({ inputTokens: 1_000_000, outputTokens: 0 }),
      { pricing: customerPricing, upstreamPricing: null, off_peak: null },
    ).costCents;

    expect(withBreakdown).toBe(asBefore);
    expect(withBreakdown).toBe(100);
  });

  it("moves the UPSTREAM figure once a real write rate is synced", () => {
    const { costCents, upstreamCostCents } = computeCost(
      chatEvent({ inputTokens: 1_000_000, outputTokens: 0, cacheWriteTokens: 1_000_000 }),
      {
        pricing: customerPricing,
        // What the supplier actually charges: a write is 1.25x input.
        upstreamPricing: { input_cents_per_mtok: 80, output_cents_per_mtok: 400, cache_write_cents_per_mtok: 100 },
        off_peak: null,
      },
    );
    expect(costCents).toBe(100);          // customer unchanged
    expect(upstreamCostCents).toBe(100);  // cost is the write rate, not the input rate
    // Margin is now honestly zero on this request rather than a phantom 20%.
    expect(upstreamCostCents).toBeGreaterThan(80);
  });
});

describe("computeCost — a cost the supplier reported beats one we derived", () => {
  // OpenRouter returns `usage.cost` on every response, streaming included. It is
  // authoritative, per-request, and works for modalities our rate table has no
  // row for at all — embeddings, rerank and audio are absent from the upstream
  // catalog endpoint, which lists chat models only.
  const info: PricingInfo = {
    pricing: { input_cents_per_mtok: 100, output_cents_per_mtok: 500 },
    upstreamPricing: { input_cents_per_mtok: 80, output_cents_per_mtok: 400 },
    off_peak: null,
  };

  it("uses the reported cost instead of the rate table", () => {
    const { costCents, upstreamCostCents } = computeCost(
      chatEvent({ inputTokens: 1_000_000, outputTokens: 0, reportedUpstreamCostCents: 73 }),
      info,
    );
    expect(costCents).toBe(100);         // what we charge is ours to decide
    expect(upstreamCostCents).toBe(73);  // what it cost is theirs to report
  });

  it("falls back to the rate table when nothing was reported", () => {
    const { upstreamCostCents } = computeCost(
      chatEvent({ inputTokens: 1_000_000, outputTokens: 0 }),
      info,
    );
    expect(upstreamCostCents).toBe(80);
  });

  it("prices a modality the rate table cannot, when the supplier reports it", () => {
    // upstreamPricing null = "we have no cost basis for this row" — the exact
    // state every embedding, rerank and audio model is in today.
    const { upstreamCostCents } = computeCost(
      chatEvent({ inputTokens: 1_000_000, outputTokens: 0, reportedUpstreamCostCents: 12 }),
      { pricing: { input_cents_per_mtok: 100, output_cents_per_mtok: 500 }, upstreamPricing: null, off_peak: null },
    );
    expect(upstreamCostCents).toBe(12);
  });

  it("ignores a nonsense report rather than trusting it", () => {
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      const { upstreamCostCents } = computeCost(
        chatEvent({ inputTokens: 1_000_000, outputTokens: 0, reportedUpstreamCostCents: bad }),
        info,
      );
      expect(upstreamCostCents).toBe(80); // fell back to the rate table
    }
  });
});
