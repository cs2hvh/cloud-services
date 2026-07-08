/**
 * MCP client adapter tests (M1 — doc 14 §9b L1: unit, fake client, no network).
 *
 * A fake McpClient is injected via connectMcpTools' `openClient` param, so
 * these tests never touch the real SDK, DNS, or a network socket — but they
 * DO exercise the real namespacing, scrubbing, allow-listing, error-as-output,
 * and SSRF logic, same discipline as tools.test.ts's functionTool suite.
 */
import { describe, it, expect, vi } from "vitest";
import type { McpToolDecl, RunCtx } from "@ahura/agent-core";
import { connectMcpTools, flattenMcpResult, resolveInlineMcpConfig } from "../tools/mcp.js";
import { attachMcpTools } from "../tools/mcp-attach.js";
import { buildDispatcher } from "../tools/dispatch.js";
import type { McpCallResult, McpClient, McpToolInfo } from "../tools/mcp-client.js";
import type { RunnerEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";

const ctx: RunCtx = { runId: "run_1", orgId: "org_1", billingUserId: "user_1" };
const env = { toolTimeoutMs: 5000 } as RunnerEnv;
const supa = {} as unknown as SupabaseClient;

/** Build a fake `openMcpClient`-shaped factory: no network, injectable behavior. */
function fakeOpenClient(opts: {
  tools?: McpToolInfo[];
  call?: (name: string, args: unknown) => McpCallResult;
  onClose?: () => void;
  throwOnConnect?: boolean;
}) {
  return vi.fn(async (): Promise<McpClient> => {
    if (opts.throwOnConnect) throw new Error("connect refused");
    return {
      async listTools() {
        return opts.tools ?? [];
      },
      async callTool(name, args) {
        return opts.call ? opts.call(name, args) : { content: [{ type: "text", text: "ok" }] };
      },
      async close() {
        opts.onClose?.();
      },
    };
  });
}

// ── resolveInlineMcpConfig ───────────────────────────────────────────────────
describe("resolveInlineMcpConfig", () => {
  it("returns null for registry-mode decls (no server_url) — M3 handles those", () => {
    expect(resolveInlineMcpConfig({ type: "mcp", server_slug: "github" })).toBeNull();
  });

  it("derives the label from the host when none is given", () => {
    const cfg = resolveInlineMcpConfig({ type: "mcp", server_url: "https://docs.example.com/mcp" });
    expect(cfg?.label).toBe("docs_example_com");
  });

  it("sanitizes an explicit label to a-z0-9_", () => {
    const cfg = resolveInlineMcpConfig({ type: "mcp", server_url: "https://x.test/mcp", label: "My Docs!!" });
    expect(cfg?.label).toBe("my_docs__");
  });

  it("returns null for a malformed URL", () => {
    expect(resolveInlineMcpConfig({ type: "mcp", server_url: "not a url" })).toBeNull();
  });
});

// ── flattenMcpResult ─────────────────────────────────────────────────────────
describe("flattenMcpResult", () => {
  it("joins text parts and reports isError", () => {
    const r = flattenMcpResult({ content: [{ type: "text", text: "hello" }, { type: "text", text: "world" }] });
    expect(r).toEqual({ text: "hello\nworld", isError: false });
  });

  it("replaces non-text parts with a placeholder — never raw bytes (§7 scenario 14)", () => {
    const r = flattenMcpResult({ content: [{ type: "image" }, { type: "text", text: "caption" }] });
    expect(r.text).toBe("[image omitted]\ncaption");
  });

  it("handles an empty/missing content array", () => {
    expect(flattenMcpResult({})).toEqual({ text: "", isError: false });
  });
});

// ── connectMcpTools ──────────────────────────────────────────────────────────
describe("connectMcpTools", () => {
  const opts = { timeoutMs: 1000, allowPrivate: true }; // dev override: skip SSRF+https for these fixture tests

  it("lists tools and namespaces them mcp__{label}__{tool}", async () => {
    const open = fakeOpenClient({ tools: [{ name: "search", description: "Search docs", inputSchema: { type: "object" } }] });
    const { tools, client } = await connectMcpTools({ url: "http://x.test/mcp", label: "docs" }, opts, open);
    expect(client).not.toBeNull();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("mcp__docs__search");
    expect(tools[0].description).toBe("Search docs");
  });

  it("honors allowed_tools (narrows what's advertised)", async () => {
    const open = fakeOpenClient({ tools: [{ name: "a" }, { name: "b" }, { name: "c" }] });
    const { tools } = await connectMcpTools({ url: "http://x.test/mcp", label: "s", allowedTools: ["b"] }, opts, open);
    expect(tools.map((t) => t.name)).toEqual(["mcp__s__b"]);
  });

  it("caps at 20 tools per server", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `t${i}` }));
    const open = fakeOpenClient({ tools: many });
    const { tools } = await connectMcpTools({ url: "http://x.test/mcp", label: "s" }, opts, open);
    expect(tools).toHaveLength(20);
  });

  it("falls back to a safe default schema when inputSchema is missing", async () => {
    const open = fakeOpenClient({ tools: [{ name: "t" }] });
    const { tools } = await connectMcpTools({ url: "http://x.test/mcp", label: "s" }, opts, open);
    expect(tools[0].parameters).toEqual({ type: "object", properties: {} });
  });

  it("is best-effort: a connect failure returns no tools, never throws (§7 scenario 3)", async () => {
    const open = fakeOpenClient({ throwOnConnect: true });
    await expect(connectMcpTools({ url: "http://x.test/mcp", label: "s" }, opts, open)).resolves.toEqual({ tools: [], client: null });
  });

  it("rejects an internal/SSRF-blocked server URL before connecting", async () => {
    const open = fakeOpenClient({ tools: [{ name: "t" }] });
    const { tools, client } = await connectMcpTools({ url: "http://169.254.169.254/mcp", label: "s" }, { timeoutMs: 1000 }, open);
    expect(tools).toEqual([]);
    expect(client).toBeNull();
    expect(open).not.toHaveBeenCalled(); // never reached "the network"
  });

  it("requires https unless the dev override is set (§10 decision #4)", async () => {
    const open = fakeOpenClient({ tools: [{ name: "t" }] });
    const { tools } = await connectMcpTools({ url: "http://public.example.com/mcp", label: "s" }, { timeoutMs: 1000 }, open);
    expect(tools).toEqual([]);
    expect(open).not.toHaveBeenCalled();
  });

  it("a bound tool's run(): success feeds back {result}, meters 1 mcp_call", async () => {
    const open = fakeOpenClient({ tools: [{ name: "search" }], call: () => ({ content: [{ type: "text", text: "3 hits" }] }) });
    const { tools } = await connectMcpTools({ url: "http://x.test/mcp", label: "s" }, opts, open);
    const r = await tools[0].tool.run({ q: "x" }, ctx);
    expect(r.output).toEqual({ result: "3 hits" });
    expect(r.metering).toEqual({ units: 1, unitLabel: "mcp_call" });
  });

  it("a bound tool's run(): isError feeds back as {error} output, still billed", async () => {
    const open = fakeOpenClient({ tools: [{ name: "search" }], call: () => ({ content: [{ type: "text", text: "boom" }], isError: true }) });
    const { tools } = await connectMcpTools({ url: "http://x.test/mcp", label: "s" }, opts, open);
    const r = await tools[0].tool.run({}, ctx);
    expect(r.output).toEqual({ error: "boom" });
    expect(r.metering).toEqual({ units: 1, unitLabel: "mcp_call" });
  });

  it("a bound tool's run(): a transport throw is caught as output, 0 units billed", async () => {
    const open = fakeOpenClient({
      tools: [{ name: "search" }],
      call: () => {
        throw new Error("socket hang up");
      },
    });
    const { tools } = await connectMcpTools({ url: "http://x.test/mcp", label: "s" }, opts, open);
    const r = await tools[0].tool.run({}, ctx);
    expect((r.output as { error: string }).error).toMatch(/mcp call failed/);
    expect(r.metering).toEqual({ units: 0, unitLabel: "mcp_call" });
  });

  it("never leaks the auth token into the trace detail or output", async () => {
    const open = fakeOpenClient({ tools: [{ name: "search" }], call: () => ({ content: [{ type: "text", text: "ok" }] }) });
    const { tools } = await connectMcpTools({ url: "http://x.test/mcp", label: "s", token: "shhh_secret_token" }, opts, open);
    const r = await tools[0].tool.run({}, ctx);
    expect(JSON.stringify(r)).not.toMatch(/shhh_secret_token/);
  });
});

// ── attachMcpTools (the decorator) ──────────────────────────────────────────
describe("attachMcpTools", () => {
  it("is a no-op (returns base unchanged) when there are no mcp decls", async () => {
    const base = buildDispatcher([{ type: "web_search" }], env, supa);
    const d = await attachMcpTools(base, [], { timeoutMs: 1000 });
    expect(d).toBe(base); // identity — zero MCP work when absent (§7 scenario 1)
  });

  it("advertises + routes an mcp tool alongside the base dispatcher's tools", async () => {
    const decl: McpToolDecl = { type: "mcp", server_url: "http://x.test/mcp", label: "docs" };
    const fakeConnect = vi.fn(async () => ({
      tools: [
        {
          name: "mcp__docs__search",
          description: "Search docs",
          parameters: { type: "object", properties: {} },
          tool: { type: "mcp" as const, run: async () => ({ output: { result: "found it" }, metering: { units: 1, unitLabel: "mcp_call" } }) },
        },
      ],
      client: { listTools: async () => [], callTool: async () => ({}), close: async () => undefined },
    }));
    const base = buildDispatcher([{ type: "web_search" }], env, supa);
    const d = await attachMcpTools(base, [decl], { timeoutMs: 1000 }, undefined, fakeConnect);

    expect(fakeConnect).toHaveBeenCalledTimes(1);
    expect(d.modelTools.some((t) => t.function.name === "web_search")).toBe(true);
    expect(d.modelTools.some((t) => t.function.name === "mcp__docs__search")).toBe(true);
    expect(d.resolveType("mcp__docs__search")).toBe("mcp");
    const r = await d.dispatch({ id: "c1", type: "mcp", name: "mcp__docs__search", arguments: '{"q":"x"}' }, ctx);
    expect(r.output).toEqual({ result: "found it" });
  });

  it("dispose() tears down the base dispatcher AND closes each connected mcp client", async () => {
    const closeSpy = vi.fn();
    const fakeConnect = vi.fn(async () => ({
      tools: [],
      client: { listTools: async () => [], callTool: async () => ({}), close: async () => closeSpy() },
    }));
    const decl: McpToolDecl = { type: "mcp", server_url: "http://x.test/mcp" };
    const base = buildDispatcher([{ type: "web_search" }], env, supa);
    const d = await attachMcpTools(base, [decl], { timeoutMs: 1000 }, undefined, fakeConnect);
    await d.dispose();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("one bad server is skipped without failing the run (§7 scenario 3) — a good server still works", async () => {
    const badDecl: McpToolDecl = { type: "mcp", server_url: "http://bad.test/mcp", label: "bad" };
    const goodDecl: McpToolDecl = { type: "mcp", server_url: "http://good.test/mcp", label: "good" };
    const fakeConnect = vi.fn(async (config: { label: string }) => {
      if (config.label === "bad") return { tools: [], client: null };
      return {
        tools: [{ name: "mcp__good__ping", description: "", parameters: {}, tool: { type: "mcp" as const, run: async () => ({ output: { result: "pong" }, metering: { units: 1, unitLabel: "mcp_call" } }) } }],
        client: { listTools: async () => [], callTool: async () => ({}), close: async () => undefined },
      };
    });
    const base = buildDispatcher([], env, supa);
    const d = await attachMcpTools(base, [badDecl, goodDecl], { timeoutMs: 1000 }, undefined, fakeConnect);
    expect(d.modelTools.map((t) => t.function.name)).toEqual(["mcp__good__ping"]);
  });

  it("throws on an unknown non-mcp tool name (falls through to base, which throws)", async () => {
    const base = buildDispatcher([], env, supa);
    const d = await attachMcpTools(base, [], { timeoutMs: 1000 });
    await expect(d.dispatch({ id: "c", type: "function", name: "nope", arguments: "{}" }, ctx)).rejects.toThrow(/No adapter/);
  });

  // ── registry mode (M3) ──────────────────────────────────────────────────
  it("registry mode: a server_slug decl resolves via the injected registry resolver, then connects", async () => {
    const decl: McpToolDecl = { type: "mcp", server_slug: "github" };
    const resolveRegistry = vi.fn(async () => ({ url: "https://gh.example.com/mcp", label: "github", allowedTools: undefined }));
    const fakeConnect = vi.fn(async () => ({
      tools: [{ name: "mcp__github__search", description: "", parameters: {}, tool: { type: "mcp" as const, run: async () => ({ output: { result: "ok" }, metering: { units: 1, unitLabel: "mcp_call" } }) } }],
      client: { listTools: async () => [], callTool: async () => ({}), close: async () => undefined },
    }));
    const base = buildDispatcher([], env, supa);
    const deps = { supabase: supa, orgId: "org_1", dek: null };
    const d = await attachMcpTools(base, [decl], { timeoutMs: 1000 }, deps, fakeConnect, resolveRegistry);

    expect(resolveRegistry).toHaveBeenCalledWith(supa, "org_1", "github", null, { label: undefined, allowedTools: undefined });
    expect(fakeConnect).toHaveBeenCalledTimes(1);
    expect(d.modelTools.some((t) => t.function.name === "mcp__github__search")).toBe(true);
  });

  it("registry mode: decl-level label/allowed_tools ride along as overrides (regression, found live 2026-07-07)", async () => {
    const decl: McpToolDecl = { type: "mcp", server_slug: "github", label: "gh", allowed_tools: ["search"] };
    const resolveRegistry = vi.fn(async () => ({ url: "https://gh.example.com/mcp", label: "gh", allowedTools: ["search"] }));
    const fakeConnect = vi.fn(async () => ({ tools: [], client: null }));
    const base = buildDispatcher([], env, supa);
    const deps = { supabase: supa, orgId: "org_1", dek: null };
    await attachMcpTools(base, [decl], { timeoutMs: 1000 }, deps, fakeConnect, resolveRegistry);

    expect(resolveRegistry).toHaveBeenCalledWith(supa, "org_1", "github", null, { label: "gh", allowedTools: ["search"] });
  });

  it("registry mode: no deps provided → skipped (best-effort), never throws", async () => {
    const decl: McpToolDecl = { type: "mcp", server_slug: "github" };
    const base = buildDispatcher([{ type: "web_search" }], env, supa);
    const d = await attachMcpTools(base, [decl], { timeoutMs: 1000 }); // no deps, no injected fns
    expect(d.modelTools.map((t) => t.function.name)).toEqual(["web_search"]);
  });

  it("registry mode: an unresolvable slug is skipped without failing the run", async () => {
    const decl: McpToolDecl = { type: "mcp", server_slug: "missing" };
    const resolveRegistry = vi.fn(async () => null);
    const base = buildDispatcher([], env, supa);
    const deps = { supabase: supa, orgId: "org_1", dek: null };
    const d = await attachMcpTools(base, [decl], { timeoutMs: 1000 }, deps, undefined, resolveRegistry);
    expect(d.modelTools).toEqual([]);
  });
});
