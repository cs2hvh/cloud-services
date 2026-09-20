/**
 * Per-unit pricing: what GET /v1/models publishes for a media model and what
 * the consumer charges for one. Both read the same catalog shape.
 */
import { describe, expect, it } from "vitest";
import { publicPrices, unitRate, type PublicUnitPrices } from "./pricing.ts";
import { computeCost } from "../consumers/usage.ts";
import type { UsageEvent } from "../types.ts";

const video = { cents_per_media_second: 25, tiers: { "480p": 8, "720p": 14, "1080p": 25 } };
const videoCost = { cents_per_media_second: 1.75, tiers: { "480p": 0.56, "720p": 0.98, "1080p": 1.75 } };
const image = { cents_per_image: 2, tiers: { "1K": 2, "2K": 2 } };

describe("unitRate", () => {
  it("uses the tier when known and the flat rate otherwise", () => {
    expect(unitRate(video, "480p")).toBe(8);
    expect(unitRate(video, "9000p")).toBe(25);
    expect(unitRate(video, null)).toBe(25);
    expect(unitRate({ input_cents_per_mtok: 100 }, null)).toBeNull();
  });
});

describe("publicPrices for media", () => {
  it("publishes dollars per second with tiers", () => {
    const p = publicPrices(video, null) as PublicUnitPrices;
    expect(p.unit).toBe("per_second");
    expect(p.price).toBe(0.25);
    expect(p.tiers).toEqual({ "480p": 0.08, "720p": 0.14, "1080p": 0.25 });
    expect(p.discount).toBeNull();
    expect(p.effective_price).toBe(0.25);
  });
  it("publishes dollars per image", () => {
    const p = publicPrices(image, null) as PublicUnitPrices;
    expect(p.unit).toBe("per_image");
    expect(p.price).toBe(0.02);
  });
  it("applies a discount window to the unit price", () => {
    const p = publicPrices(image, { window_utc: "00:00-23:59", discount_pct: 50 }, new Date("2026-09-18T12:00:00Z")) as PublicUnitPrices;
    expect(p.discount?.active_now).toBe(true);
    expect(p.effective_price).toBe(0.01);
  });
});

describe("publicPrices publishes the list price and the standing discount", () => {
  const charged = { input_cents_per_mtok: 4500, cached_cents_per_mtok: 450, output_cents_per_mtok: 4500 };
  const list = { input_cents_per_mtok: 5000, cached_cents_per_mtok: 500, output_cents_per_mtok: 5000 };

  it("shows list, discount_percent, and the charged price as the headline numbers", () => {
    const p = publicPrices(charged, null, new Date(), list, 10) as import("./pricing.ts").PublicPrices;
    expect(p.list).toEqual({ input: 50, cached_input: 5, output: 50 });
    expect(p.discount_percent).toBe(10);
    expect(p.input).toBe(45);
    expect(p.output).toBe(45);
    expect(p.effective_output).toBe(45);
  });

  it("is null list and zero discount when nothing is set, so nothing implies a markdown", () => {
    const p = publicPrices(charged, null) as import("./pricing.ts").PublicPrices;
    expect(p.list).toBeNull();
    expect(p.discount_percent).toBe(0);
  });

  it("ignores a nonsense discount", () => {
    expect((publicPrices(charged, null, new Date(), list, -5) as import("./pricing.ts").PublicPrices).discount_percent).toBe(0);
    expect((publicPrices(charged, null, new Date(), list, Number.NaN) as import("./pricing.ts").PublicPrices).discount_percent).toBe(0);
  });

  it("carries a list price for media too", () => {
    const p = publicPrices(image, null, new Date(), { cents_per_image: 4 }, 50) as PublicUnitPrices;
    expect(p.list_price).toBe(0.04);
    expect(p.discount_percent).toBe(50);
    expect(p.price).toBe(0.02);
  });
});

function ev(over: Partial<UsageEvent>): UsageEvent {
  return {
    orgId: "o",
    apiKeyId: "k",
    userId: null,
    modelId: "x-ai/grok-imagine-video-1.5",
    modality: "video",
    requestId: "r",
    billedTo: "platform",
    inputTokens: null,
    outputTokens: null,
    cachedTokens: null,
    numUnits: null,
    unitLabel: null,
    costCents: 0,
    upstreamCostCents: 0,
    isOffPeak: false,
    latencyMs: 1,
    ttftMs: null,
    status: "success",
    errorCode: null,
    cacheKind: "none",
    occurredAt: "2026-09-18T12:00:00.000Z",
    ...over,
  } as UsageEvent;
}
const info = (pricing: object, upstream: object | null, providerPricing: object | null = null) =>
  ({ pricing, upstream_pricing: upstream, provider_pricing: providerPricing, off_peak: null }) as Parameters<typeof computeCost>[1];

describe("computeCost costs by the partner that served", () => {
  const sell = { input_cents_per_mtok: 800, cached_cents_per_mtok: 25, output_cents_per_mtok: 3000 };
  const wokey = { input_cents_per_mtok: 230, cached_cents_per_mtok: 5.75, output_cents_per_mtok: 1150 };
  const byProvider = { starimg: { input_cents_per_mtok: 36, cached_cents_per_mtok: 36, output_cents_per_mtok: 36 } };
  const tokens = { modality: "chat" as const, inputTokens: 1_000_000, outputTokens: 1_000_000, cachedTokens: 0 };

  it("uses the serving partner's rates when it has an entry", () => {
    const r = computeCost(ev({ ...tokens, upstreamProvider: "starimg" }), info(sell, wokey, byProvider));
    expect(r.costCents).toBe(3800);
    expect(r.upstreamCostCents).toBe(72);
  });
  it("falls back to upstream_pricing for a partner without an entry, and for no partner", () => {
    expect(computeCost(ev({ ...tokens, upstreamProvider: "wokey" }), info(sell, wokey, byProvider)).upstreamCostCents).toBe(1380);
    expect(computeCost(ev({ ...tokens, upstreamProvider: null }), info(sell, wokey, byProvider)).upstreamCostCents).toBe(1380);
  });
  it("is unaffected for a model with no per-provider entries", () => {
    expect(computeCost(ev({ ...tokens, upstreamProvider: "starimg" }), info(sell, wokey, {})).upstreamCostCents).toBe(1380);
  });
});

describe("computeCost for media", () => {
  it("charges seconds times the resolution's rate, and costs the partner's rate", () => {
    const r = computeCost(ev({ numUnits: 5, unitLabel: "second", unitTier: "720p" }), info(video, videoCost));
    expect(r.costCents).toBe(70);
    expect(r.upstreamCostCents).toBe(Math.ceil(5 * 0.98));
  });
  it("falls back to the flat rate for an unknown tier", () => {
    const r = computeCost(ev({ numUnits: 2, unitLabel: "second", unitTier: "2160p" }), info(video, videoCost));
    expect(r.costCents).toBe(50);
  });
  it("charges one image at its tier", () => {
    const r = computeCost(ev({ modality: "image", numUnits: 1, unitLabel: "image", unitTier: "2K" }), info(image, { cents_per_image: 1 }));
    expect(r.costCents).toBe(2);
    expect(r.upstreamCostCents).toBe(1);
  });
  it("charges nothing for a failed job", () => {
    const r = computeCost(ev({ numUnits: 5, unitTier: "720p", status: "error_upstream" }), info(video, videoCost));
    expect(r.costCents).toBe(0);
  });
});
