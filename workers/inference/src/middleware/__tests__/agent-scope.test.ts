import { describe, it, expect, vi } from "vitest";
import { agentScopeMiddleware } from "../agent-scope.ts";
import type { AuthContext } from "../../types.ts";

// Doc: manager ask 2026-07-08 — per-agent access keys. A key minted from an
// agent's own "Access Keys" tab (auth.agentId set) must only ever reach that
// one agent's run-create route + the run-read routes (which enforce the
// agent_id match themselves, since a run id alone doesn't reveal its agent).

function fakeContext(opts: { agentId: string | null; method: string; path: string }) {
  const jsonCalls: Array<{ body: unknown; status: number }> = [];
  const auth: AuthContext = {
    keyId: "key_1",
    usageApiKeyId: "key_1",
    orgId: "org_1",
    agentId: opts.agentId,
    keyTier: "private",
    allowedOrigins: null,
    allowedModels: null,
    allowedIpCidrs: null,
    zdrEnabled: false,
    monthlyBudgetCents: null,
    hardCapCents: null,
    orgMonthlyBudgetCents: null,
    orgHardCapCents: null,
    semanticCacheEnabled: false,
    orgSemanticCacheThreshold: null,
    rateLimitRpm: null,
    billing: "platform",
  };
  const c = {
    get: (key: string) => (key === "auth" ? auth : "req_1"),
    req: { url: `https://api.example.com${opts.path}`, method: opts.method },
    json: (body: unknown, status: number) => {
      jsonCalls.push({ body, status });
      return { body, status };
    },
  };
  return { c, jsonCalls };
}

describe("agentScopeMiddleware", () => {
  it("is a no-op for an unrestricted key (agentId null)", async () => {
    const { c, jsonCalls } = fakeContext({ agentId: null, method: "POST", path: "/v1/chat/completions" });
    const next = vi.fn(async () => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await agentScopeMiddleware(c as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(jsonCalls).toHaveLength(0);
  });

  it("allows a scoped key to POST /agents/:id/runs for its OWN agent", async () => {
    const { c, jsonCalls } = fakeContext({ agentId: "agent_1", method: "POST", path: "/v1/agents/agent_1/runs" });
    const next = vi.fn(async () => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await agentScopeMiddleware(c as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(jsonCalls).toHaveLength(0);
  });

  it("blocks a scoped key POSTing runs for a DIFFERENT agent", async () => {
    const { c, jsonCalls } = fakeContext({ agentId: "agent_1", method: "POST", path: "/v1/agents/agent_2/runs" });
    const next = vi.fn(async () => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await agentScopeMiddleware(c as any, next);
    expect(next).not.toHaveBeenCalled();
    expect(jsonCalls[0]?.status).toBe(403);
    expect((jsonCalls[0]?.body as { error: { code: string } }).error.code).toBe("agent_scope_mismatch");
  });

  it("lets a scoped key reach the run-read routes (handler enforces agent_id match)", async () => {
    for (const path of ["/v1/agents/runs/run_1", "/v1/agents/runs/run_1/stream", "/v1/agents/runs/run_1/cancel"]) {
      const { c, jsonCalls } = fakeContext({ agentId: "agent_1", method: "GET", path });
      const next = vi.fn(async () => undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await agentScopeMiddleware(c as any, next);
      expect(next).toHaveBeenCalledOnce();
      expect(jsonCalls).toHaveLength(0);
    }
  });

  it("blocks a scoped key from every other route (chat completions, images, ...)", async () => {
    for (const path of ["/v1/chat/completions", "/v1/embeddings", "/v1/images/generations", "/v1/responses"]) {
      const { c, jsonCalls } = fakeContext({ agentId: "agent_1", method: "POST", path });
      const next = vi.fn(async () => undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await agentScopeMiddleware(c as any, next);
      expect(next).not.toHaveBeenCalled();
      expect(jsonCalls[0]?.status).toBe(403);
      expect((jsonCalls[0]?.body as { error: { code: string } }).error.code).toBe("agent_scope_restricted");
    }
  });
});
