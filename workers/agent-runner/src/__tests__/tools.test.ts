import { describe, it, expect, vi, afterEach } from "vitest";
import { functionTool } from "../tools/function.js";
import { webSearchTool, scrubUpstream } from "../tools/web-search.js";
import { fileSearchTool, reRank } from "../tools/file-search.js";
import { buildDispatcher } from "../tools/dispatch.js";
import { codeTool } from "../tools/code.js";
import { MockSandboxPool } from "../tools/sandbox/pool.js";
import { isPrivateAddress, assertSafeWebhookUrl, SsrfBlockedError } from "../tools/ssrf.js";
import { createHmac } from "node:crypto";
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
// allowPrivateWebhooks:true keeps these fetch-behavior tests off real DNS — SSRF
// blocking itself is covered by the dedicated ssrf describe block below.
const env = { webSearchApiKey: "key", webSearchProvider: "brave", toolTimeoutMs: 5000, allowPrivateWebhooks: true } as RunnerEnv;

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

  const opts = { timeoutMs: 5000, allowPrivateWebhooks: true };

  it("returns the webhook JSON as output + meters one call", async () => {
    global.fetch = mockFetch({ tempC: 21 });
    const r = await functionTool(decl, opts).run({ city: "Pune" }, ctx);
    expect(r.output).toEqual({ tempC: 21 });
    expect(r.metering).toEqual({ units: 1, unitLabel: "function_call" });
    expect(r.detail).toMatchObject({ ok: true });
  });

  it("surfaces a non-2xx as tool output (not a throw)", async () => {
    global.fetch = mockFetch("boom", false, 500, "text/plain");
    const r = await functionTool(decl, opts).run({}, ctx);
    expect((r.output as { error: string }).error).toMatch(/HTTP 500/);
    expect(r.detail).toMatchObject({ ok: false });
  });

  it("handles a timeout/abort as output", async () => {
    global.fetch = vi.fn(async () => { throw new Error("The operation was aborted"); }) as unknown as typeof fetch;
    const r = await functionTool(decl, { timeoutMs: 5, allowPrivateWebhooks: true }).run({}, ctx);
    expect((r.output as { error: string }).error).toMatch(/timed out/);
  });

  it("does NOT sign when no secret is configured", async () => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({}), text: async () => "" }));
    global.fetch = spy as unknown as typeof fetch;
    await functionTool(decl, opts).run({ a: 1 }, ctx);
    const headers = ((spy.mock.calls[0] as unknown[])[1] as { headers: Record<string, string> }).headers;
    expect(headers["X-Ahura-Signature"]).toBeUndefined();
    expect(headers["X-Ahura-Timestamp"]).toBeUndefined();
  });

  it("HMAC-signs the exact body when a secret is set (verifiable + replay-bound)", async () => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({}), text: async () => "" }));
    global.fetch = spy as unknown as typeof fetch;
    const secret = "whsec_test";
    const signed = { ...decl, secret };
    await functionTool(signed, opts).run({ a: 1 }, ctx);
    const init = (spy.mock.calls[0] as unknown[])[1] as { body: string; headers: Record<string, string> };
    const ts = init.headers["X-Ahura-Timestamp"];
    expect(ts).toMatch(/^\d+$/);
    const expected = "sha256=" + createHmac("sha256", secret).update(`${ts}.${init.body}`).digest("hex");
    expect(init.headers["X-Ahura-Signature"]).toBe(expected);
  });

  it("never leaks the secret into the trace detail or output", async () => {
    global.fetch = mockFetch({ ok: 1 });
    const r = await functionTool({ ...decl, secret: "whsec_topsecret" }, opts).run({}, ctx);
    expect(JSON.stringify(r)).not.toMatch(/whsec_topsecret/);
  });

  it("blocks an SSRF target BEFORE any network call", async () => {
    const spy = vi.fn();
    global.fetch = spy as unknown as typeof fetch;
    const evil = { type: "function" as const, name: "x", parameters: {}, webhook_url: "http://169.254.169.254/latest/meta-data/" };
    const r = await functionTool(evil, { timeoutMs: 5000 }).run({}, ctx);
    expect((r.output as { error: string }).error).toMatch(/blocked/i);
    expect(r.detail).toMatchObject({ blocked: true });
    expect(spy).not.toHaveBeenCalled(); // never reached the network
  });
});

// ── SSRF guard (§11 egress boundary) ─────────────────────────────────────────
describe("ssrf guard", () => {
  it("flags loopback / private / link-local / metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "fc00::1", "fe80::1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });

  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:2800:220:1::1"]) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });

  it("rejects non-http(s) schemes, credentials, and IP-literal internal targets", async () => {
    await expect(assertSafeWebhookUrl("file:///etc/passwd")).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(assertSafeWebhookUrl("http://user:pass@example.com")).rejects.toThrow(/credentials/i);
    await expect(assertSafeWebhookUrl("http://127.0.0.1:8080/admin")).rejects.toThrow(/internal/i);
    await expect(assertSafeWebhookUrl("http://[::1]/")).rejects.toThrow(/internal/i);
  });

  it("allows a private target when the dev override is set", async () => {
    await expect(assertSafeWebhookUrl("http://127.0.0.1/", { allowPrivate: true })).resolves.toBeUndefined();
  });
});

// ── code interpreter (S3.2a — GATED) ─────────────────────────────────────────
describe("codeTool (S3 gate)", () => {
  const enabled = { toolTimeoutMs: 5000, sandboxEnabled: true } as RunnerEnv;
  const disabled = { toolTimeoutMs: 5000, sandboxEnabled: false } as RunnerEnv;

  it("is unavailable when SANDBOX_ENABLED is off (default gate)", async () => {
    const r = await codeTool(disabled, new MockSandboxPool()).run({ code: "print(1)" }, ctx);
    expect((r.output as { error: string }).error).toMatch(/not available.*disabled/i);
    expect(r.metering.units).toBe(0);
  });

  it("is unavailable when enabled but no pool is wired (belt & suspenders)", async () => {
    const r = await codeTool(enabled).run({ code: "print(1)" }, ctx);
    expect((r.output as { error: string }).error).toMatch(/no sandbox pool/i);
  });

  it("runs via the pool and meters CPU-seconds when enabled + pool present", async () => {
    const r = await codeTool(enabled, new MockSandboxPool(0.07)).run({ code: "print(2+2)" }, ctx);
    const out = r.output as { stdout: string; exit_code: number };
    expect(out.exit_code).toBe(0);
    expect(out.stdout).toMatch(/mock-sandbox/);
    expect(r.metering).toEqual({ units: 0.07, unitLabel: "cpu_second" });
    // Trace preview carries the code that ran + its output (the #1 gap fix).
    const d = r.detail as { input: string; stdout: string; exit_code: number };
    expect(d.input).toContain("print(2+2)");
    expect(d.stdout).toMatch(/mock-sandbox/);
    expect(d.exit_code).toBe(0);
  });

  it("rejects an empty code string", async () => {
    const r = await codeTool(enabled, new MockSandboxPool()).run({ code: "  " }, ctx);
    expect((r.output as { error: string }).error).toMatch(/non-empty/i);
  });

  it("MockSandboxPool accumulates cpu_seconds across execs until stop", async () => {
    const s = await new MockSandboxPool(0.05).start({ runId: "r", orgId: "o" });
    await s.exec("a");
    await s.exec("b");
    expect((await s.stop()).cpu_seconds).toBeCloseTo(0.1);
  });
});

// ── code session (S3): the pool hands out one stateful session per run ─────────
describe("MockSandboxPool (session reuse + dispose)", () => {
  it("returns the same session across start() calls (state persists per run)", async () => {
    const pool = new MockSandboxPool(0.05);
    const a = await pool.start({ runId: "r1", orgId: "o" });
    const b = await pool.start({ runId: "r1", orgId: "o" });
    expect(a).toBe(b); // same session → variables/files persist across code steps
    await a.exec("x = 1");
    await b.exec("x + 1");
    expect((await pool.dispose()).cpu_seconds).toBeCloseTo(0.1);
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
    // Trace preview carries the query + result refs, still brand-scrubbed.
    const d = r.detail as { query: string; results: { title: string; url: string }[] };
    expect(d.query).toBe("speed");
    expect(d.results[0].url).toBe("https://x");
    expect(JSON.stringify(d)).not.toMatch(/brave/i);
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

  it("does NOT advertise `code` when the sandbox is disabled (S3 gate)", () => {
    const d = buildDispatcher([{ type: "code" }], { ...env, sandboxEnabled: false } as RunnerEnv, supa);
    expect(d.modelTools.some((t) => t.function.name === "code")).toBe(false);
  });

  it("advertises `code` once the sandbox is enabled", () => {
    const d = buildDispatcher([{ type: "code" }], { ...env, sandboxEnabled: true } as RunnerEnv, supa);
    expect(d.modelTools.some((t) => t.function.name === "code")).toBe(true);
    expect(d.resolveType("code")).toBe("code");
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

// ── hybrid re-rank (S2.1a, ported from lib/ai/rag.ts) ─────────────────────────
describe("reRank", () => {
  it("boosts a keyword-matching passage above a marginally-closer vector neighbour", () => {
    const rows = [
      { content: "An unrelated passage about weather patterns.", external_id: "a", metadata: null, similarity: 0.82 },
      { content: "The Falcon rocket engine specs and thrust of the Falcon booster.", external_id: "b", metadata: null, similarity: 0.79 },
    ];
    // Query strongly matches row b (two "falcon" hits) despite lower vector score.
    const ranked = reRank(rows, "falcon booster thrust");
    expect(ranked[0].external_id).toBe("b");
  });

  it("ignores short (<=2 char) query terms and is stable when no terms match", () => {
    const rows = [
      { content: "alpha content", external_id: "a", metadata: null, similarity: 0.9 },
      { content: "beta content", external_id: "b", metadata: null, similarity: 0.5 },
    ];
    const ranked = reRank(rows, "of is to"); // all terms <=2 chars → filtered out
    expect(ranked.map((r) => r.external_id)).toEqual(["a", "b"]); // pure similarity order
  });

  it("is regex-injection safe (a term with regex metachars doesn't throw)", () => {
    const rows = [{ content: "a+b (c)", external_id: "a", metadata: null, similarity: 0.5 }];
    expect(() => reRank(rows, "a+b (c)")).not.toThrow();
  });
});
