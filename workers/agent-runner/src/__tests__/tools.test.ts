import { describe, it, expect, vi, afterEach } from "vitest";
import { functionTool } from "../tools/function.js";
import { webSearchTool, scrubUpstream } from "../tools/web-search.js";
import { fileSearchTool } from "../tools/file-search.js";
import { buildDispatcher } from "../tools/dispatch.js";
import type { RunnerEnv } from "../env.js";
import type { RunCtx } from "@ahura/agent-core";
import type { SupabaseClient } from "@supabase/supabase-js";

// Minimal supabase stub for dispatcher tests that don't exercise file_search.
const supa = {} as unknown as SupabaseClient;

/** Chainable supabase mock for file_search: collection load + search_vectors rpc. */
function mockSupabase(collection: unknown, rows: unknown[], rpcError: string | null = null): SupabaseClient {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: collection }),
  };
  return {
    schema: () => ({
      from: () => chain,
      rpc: async () => ({ data: rows, error: rpcError ? { message: rpcError } : null }),
    }),
  } as unknown as SupabaseClient;
}

// Doc: nextstespsAI/12-agent-execution-stages.md (S2.2 / S2.3 + plumbing)

const ctx: RunCtx = { runId: "run_1", orgId: "org_1", billingUserId: "user_1" };
const env = { webSearchApiKey: "key", webSearchProvider: "brave", toolTimeoutMs: 5000 } as RunnerEnv;

function mockFetch(body: unknown, ok = true, status = 200, ct = "application/json") {
  return vi.fn(async () => ({
    ok, status,
    headers: { get: () => ct },
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  })) as unknown as typeof fetch;
}
afterEach(() => vi.restoreAllMocks());

// ── function webhook (S2.3) ─────────────────────────────────────────────────
describe("functionTool", () => {
  const decl = { type: "function" as const, name: "get_weather", parameters: {}, webhook_url: "https://hook.test/wx" };

  it("returns the webhook JSON as output + meters one call", async () => {
    global.fetch = mockFetch({ tempC: 21 });
    const r = await functionTool(decl, { timeoutMs: 5000 }).run({ city: "Pune" }, ctx);
    expect(r.output).toEqual({ tempC: 21 });
    expect(r.metering).toEqual({ units: 1, unitLabel: "function_call" });
    expect(r.detail).toMatchObject({ ok: true });
  });

  it("surfaces a non-2xx as tool output (not a throw)", async () => {
    global.fetch = mockFetch("boom", false, 500, "text/plain");
    const r = await functionTool(decl, { timeoutMs: 5000 }).run({}, ctx);
    expect((r.output as { error: string }).error).toMatch(/HTTP 500/);
    expect(r.detail).toMatchObject({ ok: false });
  });

  it("handles a timeout/abort as output", async () => {
    global.fetch = vi.fn(async () => { throw new Error("The operation was aborted"); }) as unknown as typeof fetch;
    const r = await functionTool(decl, { timeoutMs: 5 }).run({}, ctx);
    expect((r.output as { error: string }).error).toMatch(/timed out/);
  });
});

// ── web_search (S2.2) ────────────────────────────────────────────────────────
describe("web_search", () => {
  it("scrubUpstream removes provider identifiers", () => {
    expect(scrubUpstream("Powered by Brave Search")).not.toMatch(/brave/i);
    expect(scrubUpstream("the brave dog")).not.toMatch(/\bbrave\b/i);
  });

  it("returns a numbered, brand-scrubbed citation envelope", async () => {
    const provider = { search: async () => [{ title: "Brave is fast", url: "https://x", snippet: "via Brave Search" }] };
    const r = await webSearchTool(env, provider).run({ query: "speed", max_results: 3 }, ctx);
    const out = r.output as { results: { index: number; title: string; snippet: string; url: string }[] };
    expect(out.results[0].index).toBe(1);
    expect(out.results[0].url).toBe("https://x");
    expect(JSON.stringify(out)).not.toMatch(/brave/i); // no upstream leak
    expect(r.metering).toEqual({ units: 1, unitLabel: "web_search" });
  });

  it("errors gracefully when not configured (no key, no override)", async () => {
    const noKey = { webSearchApiKey: null, toolTimeoutMs: 5000 } as unknown as RunnerEnv;
    const r = await webSearchTool(noKey).run({ query: "x" }, ctx);
    expect((r.output as { error: string }).error).toMatch(/not configured/);
    expect(r.metering.units).toBe(0);
  });

  it("rejects an empty query", async () => {
    const provider = { search: async () => [] };
    const r = await webSearchTool(env, provider).run({ query: "   " }, ctx);
    expect((r.output as { error: string }).error).toMatch(/non-empty/);
  });
});

// ── dispatcher plumbing ──────────────────────────────────────────────────────
describe("buildDispatcher", () => {
  it("advertises + routes web_search", async () => {
    const d = buildDispatcher([{ type: "web_search" }], env, supa);
    expect(d.modelTools.some((t) => t.function.name === "web_search")).toBe(true);
    expect(d.resolveType("web_search")).toBe("web_search");
  });

  it("advertises + routes file_search", () => {
    const d = buildDispatcher([{ type: "file_search", collection_id: "col_1" }], env, supa);
    expect(d.modelTools.some((t) => t.function.name === "file_search")).toBe(true);
    expect(d.resolveType("file_search")).toBe("file_search");
  });

  it("advertises + routes an inline function, and posts to its webhook", async () => {
    global.fetch = mockFetch({ ok: 1 });
    const decl = { type: "function", name: "lookup", parameters: { type: "object" }, webhook_url: "https://h/x" } as const;
    const d = buildDispatcher([decl], env, supa);
    expect(d.modelTools.some((t) => t.function.name === "lookup")).toBe(true);
    expect(d.resolveType("lookup")).toBe("function");
    const r = await d.dispatch({ id: "c1", type: "function", name: "lookup", arguments: '{"q":1}' }, ctx);
    expect(r.output).toEqual({ ok: 1 });
  });

  it("skips a malformed inline function (no webhook_url)", () => {
    const d = buildDispatcher([{ type: "function", name: "bad", parameters: {} } as never], env, supa);
    expect(d.modelTools.length).toBe(0);
  });

  it("throws on an unknown tool name", async () => {
    const d = buildDispatcher([], env, supa);
    await expect(d.dispatch({ id: "c", type: "function", name: "nope", arguments: "{}" }, ctx)).rejects.toThrow(/No adapter/);
  });
});

// ── file_search (S2.1) ───────────────────────────────────────────────────────
describe("fileSearchTool", () => {
  const collection = { id: "col_1", org_id: "org_1", dimensions: 3, distance_metric: "cosine", embedding_model_id: "openai/text-embedding-3-small" };
  const rows = [
    { content: "Pune is in Maharashtra.", external_id: "doc1", metadata: { source: "geo.md" }, similarity: 0.91 },
    { content: "It has a large tech sector.", external_id: "doc2", metadata: null, similarity: 0.78 },
  ];
  // gateway /embeddings mock returning a 3-dim vector
  const embedFetch = () => (global.fetch = vi.fn(async () => ({
    ok: true, status: 200, headers: { get: () => "application/json" },
    json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }], usage: { prompt_tokens: 5 } }),
    text: async () => "",
  })) as unknown as typeof fetch);

  it("returns a numbered citation envelope from the vector search", async () => {
    embedFetch();
    const r = await fileSearchTool({ type: "file_search", collection_id: "col_1" }, env, mockSupabase(collection, rows)).run({ query: "where is pune" }, ctx);
    const out = r.output as { results: { index: number; content: string; source: string | null; score: number }[] };
    expect(out.results).toHaveLength(2);
    expect(out.results[0]).toMatchObject({ index: 1, source: "geo.md", score: 0.91 });
    expect(out.results[1].source).toBe("doc2"); // falls back to external_id when no metadata.source
    expect(r.metering).toEqual({ units: 1, unitLabel: "file_search" });
    expect(r.detail).toMatchObject({ count: 2, embed_tokens: 5 });
  });

  it("errors when no collection is configured", async () => {
    const r = await fileSearchTool({ type: "file_search" }, env, mockSupabase(null, [])).run({ query: "x" }, ctx);
    expect((r.output as { error: string }).error).toMatch(/no knowledge base/i);
    expect(r.metering.units).toBe(0);
  });

  it("errors when the collection is not in this org (404)", async () => {
    embedFetch();
    const r = await fileSearchTool({ type: "file_search", collection_id: "col_x" }, env, mockSupabase(null, [])).run({ query: "x" }, ctx);
    expect((r.output as { error: string }).error).toMatch(/not found/i);
  });

  it("errors on an empty query", async () => {
    const r = await fileSearchTool({ type: "file_search", collection_id: "col_1" }, env, mockSupabase(collection, [])).run({ query: "  " }, ctx);
    expect((r.output as { error: string }).error).toMatch(/non-empty/i);
  });
});
