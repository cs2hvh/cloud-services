import { describe, it, expect } from "vitest";
import {
  agentScopeMismatch,
  agentScopeRestrictedRefusal,
  billableActionRefusal,
  isApiKeyToken,
  modelScopeRefusal,
  orgManagementRefusal,
  publicKeyOriginRefusal,
  type ApiKeyContext,
} from "@/lib/inference/api-key-auth";

// The control plane now accepts an `ahu_` key as well as a browser session, so
// that an API customer can create a knowledge base without opening a browser.
// These are the rules that decide what a key is allowed to do once it is in.

const key = (p: Partial<ApiKeyContext> = {}): ApiKeyContext => ({
  keyId: "key-1",
  orgId: "org-1",
  agentId: null,
  keyTier: "private",
  allowedOrigins: null,
  allowedModels: null,
  isInternalService: false,
  ...p,
});

describe("which bearer tokens are ours", () => {
  it("recognises an ahu_ key", () => {
    expect(isApiKeyToken("ahu_live_abc123")).toBe(true);
  });

  it("does NOT claim a Supabase JWT", () => {
    // Getting this wrong would send every dashboard request down the API-key
    // path and answer a valid session with "invalid API key".
    expect(isApiKeyToken("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def")).toBe(false);
  });

  it("handles absence without throwing", () => {
    expect(isApiKeyToken(null)).toBe(false);
    expect(isApiKeyToken(undefined)).toBe(false);
    expect(isApiKeyToken("")).toBe(false);
  });

  it("is prefix-anchored, not a substring match", () => {
    // A token that merely CONTAINS the prefix is not ours.
    expect(isApiKeyToken("not_ahu_live_abc")).toBe(false);
  });
});

describe("which keys may start a meter", () => {
  it("an ordinary private org key may", () => {
    expect(billableActionRefusal(key())).toBeNull();
  });

  it("a PUBLIC-tier key may not, and is told why", () => {
    // Public keys are designed to be embedded in a browser — they are the only
    // tier allowed to travel in a query string. Anything they can reach is
    // reachable by anyone who views source, so they must never start a charge.
    const refusal = billableActionRefusal(key({ keyTier: "public" }));
    expect(refusal).toBeTruthy();
    expect(refusal).toMatch(/public/i);
    expect(refusal).toMatch(/private key/i); // tells them what to use instead
  });

  it("an AGENT-SCOPED key may not, and is told why", () => {
    // Minted from one agent's Access Keys tab and confined to that agent's own
    // runs at the edge. It must not provision org-wide infrastructure.
    const refusal = billableActionRefusal(key({ agentId: "agent-9" }));
    expect(refusal).toBeTruthy();
    expect(refusal).toMatch(/agent-scoped/i);
    expect(refusal).toMatch(/org-level private key/i);
  });

  it("a REAL public key — always agent-scoped — reports the public reason", () => {
    // `chk_public_key_is_agent_scoped` (20260708000002) makes
    //     key_tier = 'private' OR agent_id IS NOT NULL
    // a database invariant, so a public key ALWAYS carries an agent_id. This is
    // the only public shape that can exist; the { public, no agent } case tested
    // above is impossible in the database and is covered only to pin the
    // ordering. Public is reported because for an embeddable key that is the
    // more useful thing to say.
    expect(billableActionRefusal(key({ keyTier: "public", agentId: "agent-9" }))).toMatch(/public/i);
  });

  it("gives a REASON rather than a bare boolean", () => {
    // "Your key is not allowed to do this", with no why, is the kind of error
    // that becomes a support ticket.
    for (const ctx of [key({ keyTier: "public" }), key({ agentId: "a" })]) {
      expect(billableActionRefusal(ctx)!.length).toBeGreaterThan(60);
    }
  });

  it("an internal-service key is still bound by tier and scope", () => {
    // `is_internal_service` decides who gets BILLED, not what is permitted —
    // conflating the two would let an internal public key provision freely.
    expect(billableActionRefusal(key({ isInternalService: true, keyTier: "public" }))).toBeTruthy();
    expect(billableActionRefusal(key({ isInternalService: true }))).toBeNull();
  });
});

describe("which keys may touch org-wide configuration", () => {
  // Prompts, files, datasets, deployments, members, other keys. Money is not
  // the only reason to refuse here — for a public key the READ is the leak.
  it("an ordinary private org key may", () => {
    expect(orgManagementRefusal(key())).toBeNull();
  });

  it("a public key may not — it is embeddable, so its reads are world-readable", () => {
    const refusal = orgManagementRefusal(key({ keyTier: "public", agentId: "a" }));
    expect(refusal).toMatch(/public/i);
    expect(refusal).toMatch(/org-level private key/i);
  });

  it("an agent-scoped key may not — it speaks for one agent, not the org", () => {
    const refusal = orgManagementRefusal(key({ agentId: "agent-9" }));
    expect(refusal).toMatch(/agent-scoped/i);
    expect(refusal).toMatch(/org-level private key/i);
  });

  it("is stricter than the billing rule: it also refuses READS", () => {
    // billableActionRefusal only guards create/delete. If the two ever
    // collapsed into one check, listing members with a public key would
    // silently become legal.
    const pub = key({ keyTier: "public", agentId: "a" });
    expect(billableActionRefusal(pub)).toBeTruthy();
    expect(orgManagementRefusal(pub)).toBeTruthy();
    expect(orgManagementRefusal(key())).toBeNull();
  });
});

describe("agent-scoped keys cannot reach another agent", () => {
  const scoped = { apiKey: key({ agentId: "agent-A" }) };

  it("its own agent is fine", () => {
    expect(agentScopeMismatch(scoped, "agent-A")).toBe(false);
  });

  it("another agent is refused", () => {
    expect(agentScopeMismatch(scoped, "agent-B")).toBe(true);
  });

  it("a resource with NO agent is refused too", () => {
    // A run not tied to any agent is an org-level resource. Treating null as
    // "no restriction" would hand every ad-hoc run to any agent-scoped key.
    expect(agentScopeMismatch(scoped, null)).toBe(true);
  });

  it("a session is never scope-limited", () => {
    expect(agentScopeMismatch({ apiKey: null }, "agent-B")).toBe(false);
  });

  it("an org-level key is never scope-limited", () => {
    expect(agentScopeMismatch({ apiKey: key() }, "agent-B")).toBe(false);
  });
});

describe("public-key origin enforcement (mirrors the gateway middleware)", () => {
  // workers/inference/src/middleware/origin-check.ts runs on EVERY /v1 route.
  // Without the same rule here, the control plane would be the soft way around
  // it: a leaked public key refused at the edge would still work on /api.
  const pub = (origins: string[] | null) => key({ keyTier: "public", agentId: "a", allowedOrigins: origins });

  it("allows an approved origin", () => {
    expect(publicKeyOriginRefusal(pub(["https://shop.example"]), "https://shop.example")).toBeNull();
  });

  it("refuses an origin that is not on the list", () => {
    expect(publicKeyOriginRefusal(pub(["https://shop.example"]), "https://evil.example")).toBeTruthy();
  });

  it("refuses a MISSING Origin header — fails closed", () => {
    // A non-browser client simply omits Origin. Treating absent as allowed
    // would mean curl bypasses the entire restriction.
    expect(publicKeyOriginRefusal(pub(["https://shop.example"]), null)).toBeTruthy();
  });

  it("refuses when the allow-list is empty, even though the DB forbids that", () => {
    expect(publicKeyOriginRefusal(pub([]), "https://shop.example")).toBeTruthy();
    expect(publicKeyOriginRefusal(pub(null), "https://shop.example")).toBeTruthy();
  });

  it("never restricts a private key, with or without an Origin", () => {
    expect(publicKeyOriginRefusal(key(), null)).toBeNull();
    expect(publicKeyOriginRefusal(key({ agentId: "a" }), "https://anywhere.example")).toBeNull();
  });

  it("matches exactly — no prefix or suffix games", () => {
    const k = pub(["https://shop.example"]);
    expect(publicKeyOriginRefusal(k, "https://shop.example.evil.com")).toBeTruthy();
    expect(publicKeyOriginRefusal(k, "https://evil.com?x=https://shop.example")).toBeTruthy();
  });
});

describe("model allow-list (mirrors checkModelScope at the gateway)", () => {
  it("no list means no restriction", () => {
    expect(modelScopeRefusal(key(), "openai/gpt-5-nano")).toBeNull();
    expect(modelScopeRefusal(key({ allowedModels: [] }), "openai/gpt-5-nano")).toBeNull();
  });

  it("allows a listed model", () => {
    expect(modelScopeRefusal(key({ allowedModels: ["openai/gpt-5-nano"] }), "openai/gpt-5-nano")).toBeNull();
  });

  it("refuses an unlisted model and names it", () => {
    const refusal = modelScopeRefusal(key({ allowedModels: ["openai/gpt-5-nano"] }), "anthropic/expensive");
    expect(refusal).toMatch(/anthropic\/expensive/);
    expect(refusal).toMatch(/not allowed/i);
  });

  it("no model named means nothing to check", () => {
    expect(modelScopeRefusal(key({ allowedModels: ["a"] }), null)).toBeNull();
    expect(modelScopeRefusal(key({ allowedModels: ["a"] }), undefined)).toBeNull();
  });
});

describe("agent-scoped keys are denied by default (gateway allow-list)", () => {
  // agentScopeMiddleware answers 403 agent_scope_restricted for everything
  // except one agent's own run lifecycle. The control plane must not be the
  // looser of the two doors, so it denies unless a route opts in.
  it("an org-level key is never restricted", () => {
    expect(agentScopeRestrictedRefusal(key())).toBeNull();
  });

  it("an agent-scoped key is restricted", () => {
    const refusal = agentScopeRestrictedRefusal(key({ agentId: "agent-9" }));
    expect(refusal).toMatch(/only run and read its assigned agent/i);
    expect(refusal).toMatch(/org-level private key/i);
  });

  it("a public key is restricted too — every public key is agent-scoped", () => {
    expect(agentScopeRestrictedRefusal(key({ keyTier: "public", agentId: "a" }))).toBeTruthy();
  });

  it("keys on the org-management path are caught by EITHER rule", () => {
    // Two independent guards reach the same verdict. If one is later relaxed
    // by mistake, the other still refuses.
    const scoped = key({ agentId: "a" });
    expect(agentScopeRestrictedRefusal(scoped)).toBeTruthy();
    expect(orgManagementRefusal(scoped)).toBeTruthy();
  });
});
