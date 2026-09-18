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
const info = (pricing: object, upstream: object | null) =>
  ({ pricing, upstream_pricing: upstream, off_peak: null }) as Parameters<typeof computeCost>[1];

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
