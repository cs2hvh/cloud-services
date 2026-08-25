import { describe, it, expect, vi } from "vitest";
import { agentManagementAuthMiddleware } from "../agent-management-auth.ts";
import type { AuthContext } from "../../types.ts";

// Doc: Phase-0 API-completeness review (2026-07-17) — agent management must
// stay narrower than run-execution: only an unrestricted PRIVATE key may
// create/delete agents or mint/rotate keys.

const baseAuth: AuthContext = {
  keyId: "key_1",
  usageApiKeyId: "key_1",
  orgId: "org_1",
  agentId: null,
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

function makeContext(auth: AuthContext) {
  let jsonResult: { body: unknown; status: number } | undefined;
  const c = {
    get: (key: string) => (key === "auth" ? auth : key === "requestId" ? "req_1" : undefined),
    json: (payload: unknown, status = 200) => {
      jsonResult = { body: payload, status };
      return jsonResult;
    },
  };
  return { c, getResult: () => jsonResult };
}

describe("agentManagementAuthMiddleware", () => {
  it("lets an unrestricted private key through", async () => {
    const { c, getResult } = makeContext(baseAuth);
    const next = vi.fn(async () => undefined);
    await agentManagementAuthMiddleware(c as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect(getResult()).toBeUndefined();
  });

  it("rejects an agent-scoped key", async () => {
    const { c, getResult } = makeContext({ ...baseAuth, agentId: "agent_1" });
    const next = vi.fn(async () => undefined);
    await agentManagementAuthMiddleware(c as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(getResult()?.status).toBe(403);
    expect(JSON.stringify(getResult()?.body)).toContain("agent_scope_restricted");
  });

  it("rejects a public-tier key", async () => {
    const { c, getResult } = makeContext({ ...baseAuth, keyTier: "public", allowedOrigins: ["https://example.com"] });
    const next = vi.fn(async () => undefined);
    await agentManagementAuthMiddleware(c as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(getResult()?.status).toBe(403);
    expect(JSON.stringify(getResult()?.body)).toContain("public_key_restricted");
  });
});
