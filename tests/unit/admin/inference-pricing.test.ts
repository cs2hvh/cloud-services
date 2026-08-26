import { describe, it, expect } from "vitest";
import {
  TOKEN_FIELDS,
  readPrice,
  marginPct,
  hasCostBasis,
  isTokenBilled,
  perUnitRates,
  unitLabel,
  pricingBasis,
  priceForMargin,
  priceTone,
  planPriceUpdate,
  planReprice,
  summarize,
  type ModelPricingRow,
} from "@/lib/admin/inference-pricing";

// Doc: nextstespsAI/21-admin-platform.md (§4, A1). These rules decide what a
// customer is charged, so they're tested as pure functions — no DB, no session.

describe("readPrice", () => {
  it("reads a numeric price and rejects everything else", () => {
    expect(readPrice({ output_cents_per_mtok: 500 }, "output_cents_per_mtok")).toBe(500);
    expect(readPrice({ output_cents_per_mtok: "500" }, "output_cents_per_mtok")).toBeNull();
    expect(readPrice({ output_cents_per_mtok: NaN }, "output_cents_per_mtok")).toBeNull();
    expect(readPrice(null, "output_cents_per_mtok")).toBeNull();
    expect(readPrice({}, "output_cents_per_mtok")).toBeNull();
  });
});

describe("marginPct", () => {
  it("computes margin on the output price", () => {
    expect(marginPct({ output_cents_per_mtok: 7500 }, { output_cents_per_mtok: 2500 })).toBeCloseTo(66.67, 1);
    expect(marginPct({ output_cents_per_mtok: 1000 }, { output_cents_per_mtok: 1000 })).toBe(0);
  });

  it("goes negative when we sell below cost (the gpt-oss-20b case)", () => {
    expect(marginPct({ output_cents_per_mtok: 5 }, { output_cents_per_mtok: 13 })).toBeCloseTo(-160, 0);
  });

  it("is null — never 0 — when either side is unknown", () => {
    expect(marginPct({ output_cents_per_mtok: 500 }, null)).toBeNull();
    expect(marginPct(null, { output_cents_per_mtok: 500 })).toBeNull();
    expect(marginPct({ output_cents_per_mtok: 0 }, { output_cents_per_mtok: 5 })).toBeNull();
  });
});

describe("priceForMargin", () => {
  it("prices to the target margin", () => {
    expect(priceForMargin(60, 50)).toBe(120); // double the cost = 50% margin
    expect(priceForMargin(2500, 0)).toBe(2500); // 0% margin = at cost
  });

  it("rounds UP so rounding never lands below target", () => {
    expect(priceForMargin(13, 50)).toBe(26);
    expect(priceForMargin(10, 30)).toBe(15); // 14.28 -> 15
  });

  it("rejects impossible inputs", () => {
    expect(() => priceForMargin(0, 50)).toThrow();
    expect(() => priceForMargin(100, 100)).toThrow(); // would divide by zero
    expect(() => priceForMargin(100, -1)).toThrow();
  });
});

describe("priceTone", () => {
  it("classifies consistently for badge, row and summary", () => {
    expect(priceTone(-160, true)).toBe("loss");
    expect(priceTone(0, true)).toBe("loss");
    expect(priceTone(10, true)).toBe("thin");
    expect(priceTone(67, true)).toBe("healthy");
    expect(priceTone(null, false)).toBe("unknown");
    expect(priceTone(50, false)).toBe("unknown"); // no cost basis wins
  });
});

describe("planPriceUpdate — merge and floor", () => {
  const upstream = { input_cents_per_mtok: 100, output_cents_per_mtok: 500 };

  it("MERGES into existing pricing, preserving per-unit SKU rates", () => {
    // Regression guard: `pricing` also holds image/OCR/audio rates. Replacing
    // the object instead of merging would silently unprice those SKUs.
    const existing = { output_cents_per_mtok: 900, cents_per_image: 4, cents_per_page: 2 };
    const plan = planPriceUpdate({ existing, upstream, patch: { output_cents_per_mtok: 1000 } });
    expect(plan.ok).toBe(true);
    expect(plan.next).toEqual({ output_cents_per_mtok: 1000, cents_per_image: 4, cents_per_page: 2 });
  });

  it("refuses a price below upstream cost", () => {
    const plan = planPriceUpdate({ existing: {}, upstream, patch: { output_cents_per_mtok: 400 } });
    expect(plan.ok).toBe(false);
    expect(plan.violations).toEqual([{ field: "output_cents_per_mtok", value: 400, cost: 500 }]);
  });

  it("allows below cost when force is set (deliberate loss-leader)", () => {
    const plan = planPriceUpdate({ existing: {}, upstream, patch: { output_cents_per_mtok: 400 }, force: true });
    expect(plan.ok).toBe(true);
    expect(plan.next.output_cents_per_mtok).toBe(400);
  });

  it("allows any price when the cost basis is unknown", () => {
    const plan = planPriceUpdate({ existing: {}, upstream: null, patch: { output_cents_per_mtok: 1 } });
    expect(plan.ok).toBe(true);
  });

  it("treats exactly-at-cost as allowed, one cent under as a violation", () => {
    expect(planPriceUpdate({ existing: {}, upstream, patch: { output_cents_per_mtok: 500 } }).ok).toBe(true);
    expect(planPriceUpdate({ existing: {}, upstream, patch: { output_cents_per_mtok: 499 } }).ok).toBe(false);
  });

  it("clears a field on null and rejects junk", () => {
    const cleared = planPriceUpdate({ existing: { output_cents_per_mtok: 900 }, upstream, patch: { output_cents_per_mtok: null } });
    expect("output_cents_per_mtok" in cleared.next).toBe(false);

    const bad = planPriceUpdate({ existing: {}, upstream, patch: { output_cents_per_mtok: Number.NaN } });
    expect(bad.ok).toBe(false);
    expect(bad.invalid).toContain("output_cents_per_mtok");
  });

  it("ignores fields absent from the patch", () => {
    const plan = planPriceUpdate({ existing: { input_cents_per_mtok: 7 }, upstream, patch: {} });
    expect(plan.next).toEqual({ input_cents_per_mtok: 7 });
  });
});

describe("planReprice — bulk", () => {
  const models: ModelPricingRow[] = [
    // underwater: sells output at 5, costs 13
    { model_id: "openai/gpt-oss-20b", is_active: true, pricing: { output_cents_per_mtok: 5 }, upstream_pricing: { output_cents_per_mtok: 13 } },
    // exactly at cost
    { model_id: "openai/gpt-4o-mini", is_active: true, pricing: { output_cents_per_mtok: 60 }, upstream_pricing: { output_cents_per_mtok: 60 } },
    // healthy — must be left alone by default
    { model_id: "anthropic/claude-opus-4.7", is_active: true, pricing: { output_cents_per_mtok: 7500 }, upstream_pricing: { output_cents_per_mtok: 2500 } },
    // no cost basis — must be skipped, not guessed
    { model_id: "openai/text-embedding-3-small", is_active: true, pricing: { output_cents_per_mtok: 2 }, upstream_pricing: null },
    // inactive — out of scope
    { model_id: "legacy/model", is_active: false, pricing: { output_cents_per_mtok: 1 }, upstream_pricing: { output_cents_per_mtok: 99 } },
  ];

  it("touches only the at-or-below-cost models by default", () => {
    const plan = planReprice(models, { targetMarginPct: 50 });
    expect(plan.updates.map((u) => u.model_id).sort()).toEqual(["openai/gpt-4o-mini", "openai/gpt-oss-20b"]);
  });

  it("prices them to the target margin", () => {
    const plan = planReprice(models, { targetMarginPct: 50 });
    const byModel = Object.fromEntries(plan.updates.map((u) => [u.model_id, u.pricing]));
    expect(byModel["openai/gpt-oss-20b"].output_cents_per_mtok).toBe(26); // 13 / 0.5
    expect(byModel["openai/gpt-4o-mini"].output_cents_per_mtok).toBe(120); // 60 / 0.5
  });

  it("reports models it could not price instead of dropping them", () => {
    const plan = planReprice(models, { targetMarginPct: 50 });
    expect(plan.skipped).toContainEqual({ model_id: "openai/text-embedding-3-small", reason: "no upstream cost basis" });
  });

  it("never touches inactive models", () => {
    const plan = planReprice(models, { targetMarginPct: 50 });
    expect(plan.updates.some((u) => u.model_id === "legacy/model")).toBe(false);
  });

  it("can include already-profitable models when asked", () => {
    const plan = planReprice(models, { targetMarginPct: 50, onlyUnderwater: false });
    expect(plan.updates.some((u) => u.model_id === "anthropic/claude-opus-4.7")).toBe(true);
  });

  it("honours an explicit model_ids restriction", () => {
    const plan = planReprice(models, { targetMarginPct: 50, modelIds: ["openai/gpt-oss-20b"] });
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].model_id).toBe("openai/gpt-oss-20b");
  });

  it("is idempotent — re-running produces no further changes", () => {
    const first = planReprice(models, { targetMarginPct: 50 });
    const repriced: ModelPricingRow[] = models.map((m) => {
      const u = first.updates.find((x) => x.model_id === m.model_id);
      return u ? { ...m, pricing: u.pricing } : m;
    });
    const second = planReprice(repriced, { targetMarginPct: 50 });
    expect(second.changes).toHaveLength(0);
    expect(second.updates).toHaveLength(0);
  });

  it("preserves per-unit SKU rates through a bulk reprice", () => {
    const withImage: ModelPricingRow[] = [
      { model_id: "m", is_active: true, pricing: { output_cents_per_mtok: 5, cents_per_image: 9 }, upstream_pricing: { output_cents_per_mtok: 13 } },
    ];
    const plan = planReprice(withImage, { targetMarginPct: 50 });
    expect(plan.updates[0].pricing.cents_per_image).toBe(9);
  });
});

describe("isTokenBilled — the two pricing shapes", () => {
  it("treats models with a token price as token-billed", () => {
    expect(isTokenBilled({ pricing: { output_cents_per_mtok: 500 } })).toBe(true);
    expect(isTokenBilled({ pricing: { input_cents_per_mtok: 2 } })).toBe(true);
  });

  it("treats per-unit SKUs as NOT token-billed", () => {
    expect(isTokenBilled({ pricing: { cents_per_image: 3 } })).toBe(false);
    expect(isTokenBilled({ pricing: { cents_per_page: 2 } })).toBe(false);
    expect(isTokenBilled({ pricing: { cents_per_1k_chars: 12 } })).toBe(false);
    expect(isTokenBilled({ pricing: { cents_per_media_second: 10 } })).toBe(false);
    expect(isTokenBilled({ pricing: { cents_per_1k_rerank: 1 } })).toBe(false);
  });

  it("treats an unpriced model as token-billed (nothing says otherwise)", () => {
    expect(isTokenBilled({ pricing: {} })).toBe(true);
    expect(isTokenBilled({ pricing: null })).toBe(true);
  });
});

describe("planReprice — must never token-price a per-unit SKU", () => {
  // Live regression, 2026-07-28: the sync writes token-shaped upstream costs
  // onto per-unit models (ahura/image-gen carries output_cents_per_mtok: 250
  // while actually charging 3c per image). Since its token price is null, the
  // "already profitable" skip never fired and a bulk reprice would have
  // invented a per-token price for a model not sold by the token.
  const perUnit: ModelPricingRow[] = [
    {
      model_id: "ahura/image-gen",
      is_active: true,
      pricing: { cents_per_image: 3 },
      upstream_pricing: { cents_per_image: 0, input_cents_per_mtok: 30, output_cents_per_mtok: 250 },
    },
    {
      model_id: "ahura/ocr-doc",
      is_active: true,
      pricing: { cents_per_page: 2 },
      upstream_pricing: { input_cents_per_mtok: 30, output_cents_per_mtok: 250 },
    },
  ];

  it("leaves per-unit models untouched", () => {
    const plan = planReprice(perUnit, { targetMarginPct: 50 });
    expect(plan.updates).toHaveLength(0);
    expect(plan.changes).toHaveLength(0);
  });

  it("says why it skipped them", () => {
    const plan = planReprice(perUnit, { targetMarginPct: 50 });
    expect(plan.skipped).toEqual([
      { model_id: "ahura/image-gen", reason: "priced per unit, not per token" },
      { model_id: "ahura/ocr-doc", reason: "priced per unit, not per token" },
    ]);
  });

  it("still skips them when explicitly selected by id", () => {
    const plan = planReprice(perUnit, { targetMarginPct: 50, modelIds: ["ahura/image-gen"] });
    expect(plan.updates).toHaveLength(0);
  });

  it("never destroys the per-unit price it cannot manage", () => {
    const plan = planReprice(perUnit, { targetMarginPct: 50, onlyUnderwater: false });
    expect(plan.updates).toHaveLength(0);
  });
});

describe("per-unit rate editing", () => {
  const existing = { cents_per_image: 3, cents_per_page: 2 };

  it("updates a rate the model already has", () => {
    const plan = planPriceUpdate({ existing, upstream: null, patch: {}, unitPatch: { cents_per_image: 5 } });
    expect(plan.ok).toBe(true);
    expect(plan.next).toEqual({ cents_per_image: 5, cents_per_page: 2 });
  });

  it("refuses to invent a SKU rate the model does not carry", () => {
    // This screen edits rates; adding a brand-new billable unit is a product
    // decision, not a pricing tweak.
    const plan = planPriceUpdate({ existing, upstream: null, patch: {}, unitPatch: { cents_per_media_second: 9 } });
    expect(plan.next).toEqual(existing);
  });

  it("clears a rate on null and ignores junk", () => {
    const cleared = planPriceUpdate({ existing, upstream: null, patch: {}, unitPatch: { cents_per_page: null } });
    expect("cents_per_page" in cleared.next).toBe(false);

    const junk = planPriceUpdate({ existing, upstream: null, patch: {}, unitPatch: { cents_per_image: Number.NaN } });
    expect(junk.next.cents_per_image).toBe(3);
  });

  it("never lets a unit patch clobber token prices", () => {
    const mixed = { output_cents_per_mtok: 900, cents_per_image: 3 };
    const plan = planPriceUpdate({ existing: mixed, upstream: null, patch: {}, unitPatch: { cents_per_image: 4 } });
    expect(plan.next).toEqual({ output_cents_per_mtok: 900, cents_per_image: 4 });
  });
});

describe("perUnitRates / unitLabel", () => {
  it("lists only numeric per-unit rates, sorted", () => {
    expect(perUnitRates({ cents_per_page: 2, cents_per_image: 3, output_cents_per_mtok: 9, junk: "x" })).toEqual([
      { key: "cents_per_image", value: 3 },
      { key: "cents_per_page", value: 2 },
    ]);
    expect(perUnitRates(null)).toEqual([]);
  });

  it("renders a readable label", () => {
    expect(unitLabel("cents_per_1k_chars")).toBe("1k chars");
    expect(unitLabel("cents_per_image")).toBe("image");
  });
});

describe("pricingBasis — chat vs embedding vs per-unit", () => {
  it("judges chat models on output", () => {
    expect(pricingBasis({ input_cents_per_mtok: 100, output_cents_per_mtok: 500 })).toBe("output");
  });

  it("judges EMBEDDING models on input", () => {
    // Live shape: {input: 2, cached: 0, output: 0}. Embeddings produce no
    // output tokens, so an output-based margin is permanently unreadable.
    expect(pricingBasis({ input_cents_per_mtok: 2, cached_cents_per_mtok: 0, output_cents_per_mtok: 0 })).toBe("input");
  });

  it("marks per-unit SKUs as their own basis", () => {
    expect(pricingBasis({ cents_per_image: 3 })).toBe("unit");
  });

  it("is none when nothing is priced", () => {
    expect(pricingBasis({})).toBe("none");
    expect(pricingBasis({ output_cents_per_mtok: 0, input_cents_per_mtok: 0 })).toBe("none");
  });
});

describe("marginPct on an input-billed model", () => {
  it("computes margin from input once a cost basis exists", () => {
    const embedding = { input_cents_per_mtok: 4, cached_cents_per_mtok: 0, output_cents_per_mtok: 0 };
    expect(marginPct(embedding, { input_cents_per_mtok: 2 })).toBe(50);
  });

  it("stays null while the embedding cost source is missing", () => {
    // Today's real state: no upstream price for any embedding model.
    expect(marginPct({ input_cents_per_mtok: 2, output_cents_per_mtok: 0 }, null)).toBeNull();
  });

  it("does not read an output cost for an input-billed model", () => {
    // A stray upstream output price must not manufacture a margin.
    expect(marginPct({ input_cents_per_mtok: 2, output_cents_per_mtok: 0 }, { output_cents_per_mtok: 250 })).toBeNull();
  });

  it("hasCostBasis follows the same basis", () => {
    const embedding = { input_cents_per_mtok: 2, output_cents_per_mtok: 0 };
    expect(hasCostBasis({ pricing: embedding, upstream_pricing: { output_cents_per_mtok: 250 } })).toBe(false);
    expect(hasCostBasis({ pricing: embedding, upstream_pricing: { input_cents_per_mtok: 1 } })).toBe(true);
  });
});

describe("summarize", () => {
  it("counts what the operator needs to see at a glance", () => {
    const s = summarize([
      { model_id: "a", is_active: true, pricing: { output_cents_per_mtok: 5 }, upstream_pricing: { output_cents_per_mtok: 13 } }, // loss
      { model_id: "b", is_active: true, pricing: { output_cents_per_mtok: 100 }, upstream_pricing: { output_cents_per_mtok: 95 } }, // thin
      { model_id: "c", is_active: true, pricing: { output_cents_per_mtok: 7500 }, upstream_pricing: { output_cents_per_mtok: 2500 } }, // healthy
      { model_id: "d", is_active: true, pricing: { output_cents_per_mtok: 2 }, upstream_pricing: null }, // unknown
      { model_id: "e", is_active: false, pricing: {}, upstream_pricing: null }, // inactive
    ]);
    expect(s).toEqual({ total: 5, active: 4, cost_unknown: 1, per_unit: 0, at_or_below_cost: 1, thin_margin: 1 });
  });

  it("counts per-unit SKUs separately from genuinely unjudgeable models", () => {
    // The live catalog reported 22 "margin unknowable" when only 8 were: the
    // other 14 were priced per unit, just not token-comparable.
    const s = summarize([
      { model_id: "image", is_active: true, pricing: { cents_per_image: 3 }, upstream_pricing: null },
      { model_id: "ocr", is_active: true, pricing: { cents_per_page: 2 }, upstream_pricing: null },
      { model_id: "embed", is_active: true, pricing: { input_cents_per_mtok: 2, output_cents_per_mtok: 0 }, upstream_pricing: null },
    ]);
    expect(s.per_unit).toBe(2);
    expect(s.cost_unknown).toBe(1); // only the embedding is genuinely dark
  });
});

describe("TOKEN_FIELDS", () => {
  it("matches the jsonb keys the biller reads", () => {
    // Kept in lockstep with rawTokenCostCents() in
    // workers/inference/src/consumers/usage.ts. A rate this screen cannot edit
    // is a rate nobody notices going wrong: cache_write was missing from both
    // for months, and a cache write costs MORE than fresh input.
    expect(TOKEN_FIELDS).toEqual([
      "input_cents_per_mtok",
      "cached_cents_per_mtok",
      "cache_write_cents_per_mtok",
      "output_cents_per_mtok",
    ]);
  });
});
