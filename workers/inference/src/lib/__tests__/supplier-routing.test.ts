import { describe, it, expect, vi, beforeEach } from "vitest";

// One mutable fixture the fake Supabase client reads from, so each test states
// only the condition it is about.
const state = {
  preferred: "wokey" as string | null,
  route: { upstream_model_id: "claude-sonnet-4-6", enabled: true, catalog_present: true, catalog_available: true } as Record<string, unknown> | null,
  routeError: false,
  org: { allow_marketplace_supply: true, zdr_default: false } as Record<string, unknown> | null,
  orgError: false,
  switchValue: true as unknown,
  switchAbsent: false,
  modelError: false,
  throwOnConnect: false,
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => {
    if (state.throwOnConnect) throw new Error("unreachable");
    const build = (table: string, schema?: string) => ({
      select: () => build(table, schema),
      eq: () => build(table, schema),
      maybeSingle: async () => {
        if (schema === "inference" && table === "models") {
          return state.modelError
            ? { data: null, error: new Error("boom") }
            : { data: { preferred_provider: state.preferred }, error: null };
        }
        if (schema === "inference" && table === "model_routes") {
          return state.routeError ? { data: null, error: new Error("boom") } : { data: state.route, error: null };
        }
        if (schema === "inference" && table === "orgs") {
          return state.orgError ? { data: null, error: new Error("boom") } : { data: state.org, error: null };
        }
        if (table === "platform_settings") {
          return state.switchAbsent
            ? { data: null, error: null }
            : { data: { value: state.switchValue }, error: null };
        }
        return { data: null, error: null };
      },
    });
    return {
      schema: (s: string) => ({ from: (t: string) => build(t, s) }),
      from: (t: string) => build(t),
    };
  },
}));

const { resolveSupplierRoute, markSupplierFailed } = await import("../supplier-routing.ts");
import type { Env } from "../../types.ts";

const kv = new Map<string, string>();
const env = {
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "svc",
  OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
  OPENROUTER_PLATFORM_KEY: "sk-or",
  WOKEY_PLATFORM_KEY: "wk-test",
  API_KEYS: {
    get: async (k: string) => kv.get(k) ?? null,
    put: async (k: string, v: string) => void kv.set(k, v),
  },
} as unknown as Env;

const call = (over: Partial<Parameters<typeof resolveSupplierRoute>[0]> = {}) =>
  resolveSupplierRoute({
    env,
    modelId: "anthropic/claude-sonnet-4.6",
    catalogUpstreamModelId: "anthropic/claude-sonnet-4.6",
    orgId: "org-1",
    path: "/chat/completions",
    billing: "platform",
    hasPreset: false,
    ...over,
  });

beforeEach(() => {
  kv.clear();
  Object.assign(state, {
    preferred: "wokey",
    route: { upstream_model_id: "claude-sonnet-4-6", enabled: true, catalog_present: true, catalog_available: true },
    routeError: false,
    org: { allow_marketplace_supply: true, zdr_default: false },
    orgError: false,
    switchValue: true,
    switchAbsent: false,
    modelError: false,
    throwOnConnect: false,
  });
});

describe("supplier routing — the happy path", () => {
  it("uses the preferred supplier when every condition is affirmatively true", async () => {
    const r = await call();
    expect(r.supplier.id).toBe("wokey");
    expect(r.upstreamModelId).toBe("claude-sonnet-4-6"); // THEIR id, not ours
    expect(r.reason).toBe("preferred");
  });

  it("uses OpenRouter when no preference is recorded", async () => {
    state.preferred = null;
    const r = await call();
    expect(r.supplier.id).toBe("openrouter");
    expect(r.upstreamModelId).toBe("anthropic/claude-sonnet-4.6"); // OUR catalog id
  });
});

describe("supplier routing — every check fails CLOSED to OpenRouter", () => {
  const expectFallback = async (reason: string, over = {}) => {
    const r = await call(over);
    expect(r.supplier.id).toBe("openrouter");
    expect(r.reason).toBe(reason);
  };

  it("route row missing", async () => { state.route = null; await expectFallback("no_route_row"); });
  it("route row unreadable", async () => { state.routeError = true; await expectFallback("no_route_row"); });
  it("operator disabled the route", async () => { state.route!.enabled = false; await expectFallback("route_disabled"); });
  it("supplier delisted the model", async () => { state.route!.catalog_present = false; await expectFallback("catalog_unavailable"); });
  it("supplier marked it unavailable", async () => { state.route!.catalog_available = false; await expectFallback("catalog_unavailable"); });

  it("kill switch off", async () => { state.switchValue = false; await expectFallback("switch_off"); });
  it("kill switch row ABSENT — absent is off, not on", async () => { state.switchAbsent = true; await expectFallback("switch_off"); });

  it("org not allowed", async () => { state.org = { allow_marketplace_supply: false, zdr_default: false }; await expectFallback("org_not_allowed"); });
  it("org flag NULL — only an explicit true counts", async () => { state.org = { allow_marketplace_supply: null, zdr_default: false }; await expectFallback("org_not_allowed"); });
  it("org row missing", async () => { state.org = null; await expectFallback("org_not_allowed"); });
  it("org row unreadable", async () => { state.orgError = true; await expectFallback("org_not_allowed"); });

  it("model lookup failed", async () => { state.modelError = true; await expectFallback("lookup_failed"); });
  it("database unreachable entirely", async () => { state.throwOnConnect = true; await expectFallback("lookup_failed"); });

  it("no key configured for the supplier", async () => {
    const noKey = { ...env, WOKEY_PLATFORM_KEY: "" } as unknown as Env;
    const r = await resolveSupplierRoute({
      env: noKey, modelId: "m", catalogUpstreamModelId: "m", orgId: "o",
      path: "/chat/completions", billing: "platform", hasPreset: false,
    });
    expect(r.reason).toBe("no_key");
  });

  it("supplier does not serve this path at all", async () => {
    // Wokey has no /embeddings endpoint — it 404s. RAG can never route there.
    await expectFallback("path_unsupported", { path: "/embeddings" as const });
  });

  it("customer BYOK — never spend a customer's key at a marketplace", async () => {
    await expectFallback("default", { billing: "byok" as const });
  });

  it("a preset pins to OpenRouter — the knobs are vendor-specific", async () => {
    await expectFallback("default", { hasPreset: true });
  });
});

describe("cooldown", () => {
  it("skips a route that just failed, then tries it again once the key expires", async () => {
    expect((await call()).supplier.id).toBe("wokey");

    await markSupplierFailed(env, "wokey", "anthropic/claude-sonnet-4.6");
    const cooled = await call();
    expect(cooled.supplier.id).toBe("openrouter");
    expect(cooled.reason).toBe("cooling_down");

    kv.clear(); // stand-in for the TTL expiring
    expect((await call()).supplier.id).toBe("wokey");
  });

  it("treats unreadable cooldown state as cooling down, not as healthy", async () => {
    const broken = { ...env, API_KEYS: { get: async () => { throw new Error("kv down"); }, put: async () => {} } } as unknown as Env;
    const r = await resolveSupplierRoute({
      env: broken, modelId: "anthropic/claude-sonnet-4.6", catalogUpstreamModelId: "anthropic/claude-sonnet-4.6",
      orgId: "org-1", path: "/chat/completions", billing: "platform", hasPreset: false,
    });
    expect(r.reason).toBe("cooling_down");
  });
});

describe("the two rules that protect money and promises", () => {
  it("a ZDR org is refused even when someone set the permission flag", async () => {
    // The admin API refuses to set both, but that is one write path among
    // several. The routing decision is the last line, and it holds.
    state.org = { allow_marketplace_supply: true, zdr_default: true };
    const r = await call();
    expect(r.supplier.id).toBe("openrouter");
    expect(r.reason).toBe("org_zdr");
  });

  it("NEVER hands back a key for a fallback route", async () => {
    // route.key is consumed as `route.key ?? callerKey`. If a fallback
    // manufactured the platform key here, a customer-BYOK request would be
    // billed to OUR account instead of theirs — silently, on every request.
    for (const over of [
      { billing: "byok" as const },
      { hasPreset: true },
      {},
    ]) {
      if (Object.keys(over).length === 0) state.org = { allow_marketplace_supply: false, zdr_default: false };
      const r = await call(over);
      if (r.reason !== "preferred") {
        expect(r.key, `fallback via ${r.reason} manufactured a key`).toBeNull();
      }
    }
  });

  it("carries a key only when a non-default supplier was actually chosen", async () => {
    const r = await call();
    expect(r.reason).toBe("preferred");
    expect(r.key).toBe("wk-test");
  });

  it("skips its own model lookup when the caller already read the row", async () => {
    state.modelError = true; // would force lookup_failed IF it queried
    const r = await call({ preferredProvider: "wokey" });
    expect(r.reason).toBe("preferred");
  });
});
