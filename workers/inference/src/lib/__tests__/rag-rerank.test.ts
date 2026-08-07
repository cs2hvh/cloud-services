import { describe, it, expect, vi, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { rerankCandidates } from "../rag-rerank.ts";
import type { AuthContext, Env } from "../../types.ts";

// Doc: nextstespsAI/04-rag-data-platform.md — shared rerank helper used by
// both queryCollection's rerank:true option and the /answer endpoint.

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

const auth = { orgId: "org_1", usageApiKeyId: "key_1", billing: "platform", allowedModels: null } as unknown as AuthContext;
const env = { OPENROUTER_BASE_URL: "https://openrouter.test", OPENROUTER_PLATFORM_KEY: "pk_test", USAGE_EVENTS: { send: vi.fn() } } as unknown as Env;

const candidateA = { id: "a", content: "Refunds are issued within 5 days of request." };
const candidateB = { id: "b", content: "Shipping normally takes 3 business days." };
const candidateC = { id: "c", content: "Our data centers are in Frankfurt and Singapore." };
const candidates = [candidateA, candidateB, candidateC];

/** lookupModelRouting goes straight to Supabase (not KV) — stub createClient
 *  to resolve a routable `ahura/rerank-m3` row. */
function mockModelRouting() {
  vi.mocked(createClient).mockReturnValue({
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { serving_type: "proxy", serving_url: null, upstream_model_id: "cohere/rerank-v3.5", is_active: true, capabilities: null },
            }),
          }),
        }),
      }),
    }),
  } as never);
}

afterEach(() => vi.restoreAllMocks());

describe("rerankCandidates", () => {
  it("returns candidates unchanged when fewer than 2 have content", async () => {
    const r = await rerankCandidates(env, auth, "req_1", "refund policy", [candidateA]);
    expect(r).toEqual([candidateA]);
  });

  it("falls back to original order on any upstream failure (never throws, never fails the caller)", async () => {
    mockModelRouting();
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500, text: async () => "boom" })) as unknown as typeof fetch;
    const r = await rerankCandidates(env, auth, "req_1", "refund policy", candidates);
    expect(r).toEqual(candidates);
  });

  it("falls back cleanly when model routing itself is unavailable (no KV/DB row)", async () => {
    vi.mocked(createClient).mockReturnValue({
      schema: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
    } as never);
    const r = await rerankCandidates(env, auth, "req_1", "refund policy", candidates);
    expect(r).toEqual(candidates);
  });

  it("reorders candidates by real relevance score, and bills a rerank usage event", async () => {
    mockModelRouting();
    const send = vi.fn();
    const rerankEnv = { ...env, USAGE_EVENTS: { send } } as unknown as Env;
    // Query is about data centers — candidate "c" should win, despite being last in input order.
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ results: [{ index: 2, relevance_score: 0.95 }, { index: 0, relevance_score: 0.2 }, { index: 1, relevance_score: 0.05 }] }),
    })) as unknown as typeof fetch;

    const r = await rerankCandidates(rerankEnv, auth, "req_1", "where are your data centers", candidates);
    expect(r.map((c) => c.id)).toEqual(["c", "a", "b"]);
    expect(send).toHaveBeenCalledTimes(1);
    const billed = send.mock.calls[0]?.[0];
    expect(billed).toMatchObject({ modality: "rerank", unitLabel: "rerank_unit", numUnits: 3 });
  });

  it("pushes rows with no content to the end, unscored, without breaking the reorder", async () => {
    mockModelRouting();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ results: [{ index: 1, relevance_score: 0.9 }, { index: 0, relevance_score: 0.1 }] }),
    })) as unknown as typeof fetch;

    const withEmpty = [candidateA, candidateB, { id: "empty", content: null }];
    const r = await rerankCandidates(env, auth, "req_1", "shipping", withEmpty);
    expect(r.map((c) => c.id)).toEqual(["b", "a", "empty"]);
  });
});
