import { describe, it, expect, vi } from "vitest";
import { isOnBehalfOf, isValidUuid, lookupOrgBilling, onBehalfOfKeyId } from "../on-behalf-of.ts";

// Doc: 20260706000001_agent_on_behalf_of_billing.sql · found by the 2026-07-06
// audit: agent-runner's single static platform key meant every agent run's
// model/tool cost attributed to whichever org owns that key, never the
// customer running the agent.

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

describe("onBehalfOfKeyId / isOnBehalfOf", () => {
  it("is unique per org (so rate-limiting stays per-org, not one shared bucket)", () => {
    expect(onBehalfOfKeyId("org_a")).not.toBe(onBehalfOfKeyId("org_b"));
  });

  it("round-trips through isOnBehalfOf", () => {
    expect(isOnBehalfOf(onBehalfOfKeyId("org_a"))).toBe(true);
  });

  it("a real customer key id never matches", () => {
    expect(isOnBehalfOf("11111111-1111-1111-1111-111111111111")).toBe(false);
  });
});

describe("isValidUuid", () => {
  it("accepts a well-formed UUID", () => {
    expect(isValidUuid("11111111-1111-1111-1111-111111111111")).toBe(true);
  });

  it("rejects a header-injection-style or arbitrary string", () => {
    expect(isValidUuid("not-a-uuid")).toBe(false);
    expect(isValidUuid("' OR 1=1 --")).toBe(false);
    expect(isValidUuid("")).toBe(false);
  });
});

describe("lookupOrgBilling", () => {
  const fakeEnv = { SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "k" } as never;

  it("returns null (fail closed) for an unknown org", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      schema: () => ({
        rpc: () => ({ single: async () => ({ data: null, error: { message: "no rows" } }) }),
      }),
    });

    const result = await lookupOrgBilling(fakeEnv, "11111111-1111-1111-1111-111111111111");
    expect(result).toBeNull();
  });

  it("coerces the NUMERIC threshold string PostgREST returns into a number", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      schema: () => ({
        rpc: () => ({
          single: async () => ({
            data: {
              org_id: "org_1",
              zdr_enabled: false,
              org_monthly_budget_cents: 10_000,
              org_hard_cap_cents: 20_000,
              org_semantic_cache_threshold: "0.85",
            },
            error: null,
          }),
        }),
      }),
    });

    const result = await lookupOrgBilling(fakeEnv, "org_1");
    expect(result).toEqual({
      orgId: "org_1",
      zdrEnabled: false,
      orgMonthlyBudgetCents: 10_000,
      orgHardCapCents: 20_000,
      orgSemanticCacheThreshold: 0.85,
    });
  });
});
