import { describe, it, expect, vi } from "vitest";
import { originCheckMiddleware } from "../origin-check.ts";
import type { AuthContext } from "../../types.ts";

// Doc: manager ask 2026-07-08 — public-tier keys must only be usable from an
// origin the customer explicitly allowlisted. CORS itself is wide open in
// this gateway (see origin-check.ts's own comment) so this server-side check
// is the real boundary, not a formality alongside it.

function fakeContext(opts: { keyTier: "private" | "public"; allowedOrigins: string[] | null; origin?: string }) {
  const jsonCalls: Array<{ body: unknown; status: number }> = [];
  const auth: AuthContext = {
    keyId: "key_1",
    usageApiKeyId: "key_1",
    orgId: "org_1",
    agentId: "agent_1",
    keyTier: opts.keyTier,
    allowedOrigins: opts.allowedOrigins,
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
    req: { header: (name: string) => (name === "Origin" ? opts.origin : undefined) },
    json: (body: unknown, status: number) => {
      jsonCalls.push({ body, status });
      return { body, status };
    },
  };
  return { c, jsonCalls };
}

describe("originCheckMiddleware", () => {
  it("is a no-op for a private key regardless of Origin", async () => {
    const { c, jsonCalls } = fakeContext({ keyTier: "private", allowedOrigins: null, origin: "https://evil.com" });
    const next = vi.fn(async () => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await originCheckMiddleware(c as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(jsonCalls).toHaveLength(0);
  });

  it("allows a public key when Origin matches the allowlist", async () => {
    const { c, jsonCalls } = fakeContext({
      keyTier: "public",
      allowedOrigins: ["https://example.com"],
      origin: "https://example.com",
    });
    const next = vi.fn(async () => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await originCheckMiddleware(c as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(jsonCalls).toHaveLength(0);
  });

  it("blocks a public key when Origin doesn't match", async () => {
    const { c, jsonCalls } = fakeContext({
      keyTier: "public",
      allowedOrigins: ["https://example.com"],
      origin: "https://evil.com",
    });
    const next = vi.fn(async () => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await originCheckMiddleware(c as any, next);
    expect(next).not.toHaveBeenCalled();
    expect(jsonCalls[0]?.status).toBe(403);
    expect((jsonCalls[0]?.body as { error: { code: string } }).error.code).toBe("origin_not_allowed");
  });

  it("blocks a public key when Origin is missing entirely", async () => {
    const { c, jsonCalls } = fakeContext({ keyTier: "public", allowedOrigins: ["https://example.com"] });
    const next = vi.fn(async () => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await originCheckMiddleware(c as any, next);
    expect(next).not.toHaveBeenCalled();
    expect(jsonCalls[0]?.status).toBe(403);
  });

  it("fails closed if a public key somehow has no allowed_origins (defensive, DB CHECK should prevent this)", async () => {
    const { c, jsonCalls } = fakeContext({ keyTier: "public", allowedOrigins: null, origin: "https://example.com" });
    const next = vi.fn(async () => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await originCheckMiddleware(c as any, next);
    expect(next).not.toHaveBeenCalled();
    expect(jsonCalls[0]?.status).toBe(403);
  });
});
