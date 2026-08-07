import { describe, it, expect } from "vitest";
import {
  blendedCost,
  isAutoModel,
  requirementsFromRequest,
  satisfies,
  scoreCandidates,
  curationRank,
  type CandidateModel,
} from "../../lib/router.ts";

// Doc: nextstespsAI/07-inference-completeness.md Slice 2 — smart routing.
// Pure-logic tests only (the catalog read is a thin Supabase select), same
// convention as the rest of this route family.

const model = (
  id: string,
  input: number | null,
  output: number | null,
  sortOrder: number | null,
  caps: Record<string, unknown> = {},
  isFeatured = true
): CandidateModel => ({
  model_id: id,
  pricing: input === null || output === null ? null : { input_cents_per_mtok: input, output_cents_per_mtok: output },
  capabilities: caps,
  sort_order: sortOrder,
  is_featured: isFeatured,
});

const FULL = { tools: true, vision: true, json_mode: true, streaming: true, context_window: 200_000 };

describe("isAutoModel", () => {
  it("recognises the virtual ids and nothing else", () => {
    expect(isAutoModel("ahura/auto")).toBe(true);
    expect(isAutoModel("ahura/auto-cheap")).toBe(true);
    expect(isAutoModel("anthropic/claude-haiku-4.5")).toBe(false);
    // Deliberately unimplemented — no latency telemetry yet.
    expect(isAutoModel("ahura/auto-fast")).toBe(false);
  });
});

describe("requirementsFromRequest", () => {
  it("detects tools, json mode and streaming", () => {
    const r = requirementsFromRequest({
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function" }],
      response_format: { type: "json_schema" },
      stream: true,
    });
    expect(r.tools).toBe(true);
    expect(r.jsonMode).toBe(true);
    expect(r.streaming).toBe(true);
    expect(r.vision).toBe(false);
  });

  it("detects vision from multipart content", () => {
    const r = requirementsFromRequest({
      messages: [{ role: "user", content: [{ type: "image_url" }, { type: "text", text: "what is this" }] }],
    });
    expect(r.vision).toBe(true);
  });

  it("treats legacy `functions` as a tools requirement", () => {
    expect(requirementsFromRequest({ functions: [{ name: "f" }] }).tools).toBe(true);
  });

  it("estimates a context requirement from prompt size", () => {
    const r = requirementsFromRequest({ messages: [{ role: "user", content: "x".repeat(40_000) }] });
    // 40k chars ≈ 10k tokens, +25% headroom
    expect(r.minContextWindow).toBeGreaterThan(10_000);
    expect(r.minContextWindow).toBeLessThan(20_000);
  });

  it("requires nothing for a plain text request", () => {
    const r = requirementsFromRequest({ messages: [{ role: "user", content: "hello" }] });
    expect(r).toMatchObject({ tools: false, vision: false, jsonMode: false, streaming: false });
  });
});

describe("satisfies — hard capability gates", () => {
  const req = { tools: true, vision: false, jsonMode: false, streaming: false, minContextWindow: 0 };

  it("rejects a model missing a required capability", () => {
    expect(satisfies(model("a", 1, 1, 1, { tools: false }), req)).toBe(false);
    expect(satisfies(model("b", 1, 1, 1, FULL), req)).toBe(true);
  });

  it("rejects a model whose context window is too small", () => {
    const big = { tools: false, vision: false, jsonMode: false, streaming: false, minContextWindow: 500_000 };
    expect(satisfies(model("small", 1, 1, 1, { context_window: 128_000 }), big)).toBe(false);
    expect(satisfies(model("big", 1, 1, 1, { context_window: 1_000_000 }), big)).toBe(true);
  });

  it("does not reject on an unknown context window", () => {
    const big = { tools: false, vision: false, jsonMode: false, streaming: false, minContextWindow: 500_000 };
    expect(satisfies(model("unknown", 1, 1, 1, {}), big)).toBe(true);
  });
});

describe("blendedCost", () => {
  it("weights input 3:1 against output", () => {
    // (300*3 + 1500*1) / 4 = 600
    expect(blendedCost(model("m", 300, 1500, 1))).toBe(600);
  });

  it("sorts an unpriced model last, never first", () => {
    expect(blendedCost(model("m", null, null, 1))).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("scoreCandidates", () => {
  // opus: premium + top-ranked. haiku: cheapest + lowest-ranked. sonnet: middle.
  const catalog = [
    model("anthropic/claude-opus-4.7", 1500, 7500, 10, FULL),
    model("anthropic/claude-sonnet-4.6", 300, 1500, 20, FULL),
    model("anthropic/claude-haiku-4.5", 80, 400, 30, FULL),
  ];

  it("auto-cheap picks the cheapest capable model", () => {
    const ranked = scoreCandidates(catalog, { costWeight: 0.85, qualityWeight: 0.15 });
    expect(ranked[0]?.model.model_id).toBe("anthropic/claude-haiku-4.5");
  });

  it("balanced auto does not simply pick the most expensive model", () => {
    const ranked = scoreCandidates(catalog, { costWeight: 0.5, qualityWeight: 0.5 });
    expect(ranked[0]?.model.model_id).not.toBe("anthropic/claude-opus-4.7");
  });

  it("is deterministic — same catalog, same winner", () => {
    const a = scoreCandidates(catalog, { costWeight: 0.5, qualityWeight: 0.5 })[0]?.model.model_id;
    const b = scoreCandidates([...catalog].reverse(), { costWeight: 0.5, qualityWeight: 0.5 })[0]?.model.model_id;
    expect(a).toBe(b);
  });

  it("breaks exact ties on model_id, not input order", () => {
    const tied = [model("zzz", 100, 100, 5, FULL), model("aaa", 100, 100, 5, FULL)];
    expect(scoreCandidates(tied, { costWeight: 0.5, qualityWeight: 0.5 })[0]?.model.model_id).toBe("aaa");
  });

  it("never puts an unpriced model first under a cost-weighted policy", () => {
    const withUnpriced = [...catalog, model("mystery/unpriced", null, null, 1, FULL)];
    const ranked = scoreCandidates(withUnpriced, { costWeight: 0.85, qualityWeight: 0.15 });
    expect(ranked[0]?.model.model_id).not.toBe("mystery/unpriced");
  });

  it("returns an empty list for an empty catalog", () => {
    expect(scoreCandidates([], { costWeight: 0.5, qualityWeight: 0.5 })).toEqual([]);
  });
});

// Regression: found against the LIVE catalog. sort_order defaults to 0, and
// four uncurated rows (gpt-4o / gpt-4.1 family) still carry it — ranking on
// sort_order alone put an uncurated model ahead of a featured flagship purely
// because nobody had ordered it.
describe("curationRank — uncurated models must not win the quality axis", () => {
  it("sorts a featured model ahead of an uncurated sort_order=0 model", () => {
    expect(curationRank(model("featured", 1, 1, 10, FULL, true))[0])
      .toBeLessThan(curationRank(model("uncurated", 1, 1, 0, FULL, false))[0]);
  });

  it("treats sort_order 0 as uncurated, not best-in-class", () => {
    const [, zero] = curationRank(model("z", 1, 1, 0, FULL, true));
    const [, ten] = curationRank(model("t", 1, 1, 10, FULL, true));
    expect(zero).toBeGreaterThan(ten);
  });

  it("a balanced auto prefers a featured flagship over an uncurated cheap model", () => {
    const cands = [
      model("openai/gpt-4o-mini", 15, 60, 0, FULL, false),      // uncurated, cheap
      model("anthropic/claude-sonnet-4.6", 300, 1500, 20, FULL, true), // featured
    ];
    const ranked = scoreCandidates(cands, { costWeight: 0.5, qualityWeight: 0.5 });
    expect(ranked[0]?.model.model_id).toBe("anthropic/claude-sonnet-4.6");
  });
});
