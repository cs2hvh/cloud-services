/**
 * Which supplier serves this request.
 *
 * The rule is a LOOKUP, not a decision. Nothing here compares prices, scores
 * providers or optimises anything — an operator chose a supplier per model in
 * the admin screen, and this checks whether that choice is currently allowed.
 *
 *     preferred = models.preferred_provider      (NULL -> OpenRouter, done)
 *
 *     use it ONLY IF EVERY ONE of these is affirmatively true:
 *         its model_routes row exists and enabled = true
 *         catalog_available = true
 *         the supplier's kill switch reads explicitly ON
 *         the org's allow_marketplace_supply reads explicitly TRUE
 *         no cooldown key is set
 *         the supplier serves this path at all
 *     anything false, missing, unreadable or uncertain -> OpenRouter
 *
 * FAIL CLOSED, and that is a deliberate departure from
 * middleware/feature-gate.ts, which fails OPEN on purpose. Those switches gate
 * whole capabilities, so closing one returns 503 to customers — a bigger outage
 * than the one the switch exists to contain. This gates only WHICH UPSTREAM
 * serves a request. Closed means OpenRouter, not an error. The cost of failing
 * closed is a slightly larger bill for a few minutes; the cost of failing open
 * is routing to a marketplace at the exact moment we could not verify the org
 * is allowed to use one.
 *
 * Do not "correct" this into consistency with the other five.
 *
 * Doc: docs/inference/supply-routing-plan.md §9.4.
 */
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_SUPPLIER, getSupplier, type Supplier, type UpstreamPath } from "./suppliers/index.ts";
import type { Env } from "../types.ts";

export interface SupplierRoute {
  supplier: Supplier;
  /** The id to put in the outgoing `model` field for THIS supplier. */
  upstreamModelId: string;
  /**
   * The key to authenticate with, or NULL meaning "use the one the caller
   * already resolved".
   *
   * Null is the important case. The caller resolved a key before this ran, and
   * for a customer-BYOK request that is the customer's own decrypted key. If a
   * fallback route manufactured the platform key here, `route.key || callerKey`
   * would silently prefer OURS and every BYOK request would be billed to the
   * platform account. A route only carries a key when it genuinely needs a
   * different one — i.e. when a non-default supplier was chosen.
   */
  key: string | null;
  /** Why we ended up here. Recorded on the trace span so a route that never
   *  fires is visible rather than silently absent. */
  reason:
    | "default"
    | "preferred"
    | "no_route_row"
    | "route_disabled"
    | "catalog_unavailable"
    | "switch_off"
    | "org_not_allowed"
    | "org_zdr"
    | "cooling_down"
    | "path_unsupported"
    | "no_key"
    | "lookup_failed";
}

/** How long a failed route is skipped. Short: a marketplace recovers on its own
 *  and we would rather retry sooner than route expensive traffic for longer. */
const COOLDOWN_SECONDS = 120;

const cooldownKey = (provider: string, modelId: string) => `cooldown:${provider}:${modelId}`;

/**
 * Mark a supplier as failed for a model.
 *
 * Deliberately NOT a half-open circuit breaker. Several requests can race
 * through the moment the key expires and all hit a still-broken supplier; that
 * is accepted. Guaranteeing exactly one probe needs an atomic lease, which is
 * more machinery than a fallback-protected route deserves.
 *
 * Never throws: a failure to record a failure must not fail the request.
 */
export async function markSupplierFailed(env: Env, provider: string, modelId: string): Promise<void> {
  try {
    await env.API_KEYS.put(cooldownKey(provider, modelId), "1", { expirationTtl: COOLDOWN_SECONDS });
  } catch {
    /* best effort */
  }
}

async function isCoolingDown(env: Env, provider: string, modelId: string): Promise<boolean> {
  try {
    return (await env.API_KEYS.get(cooldownKey(provider, modelId))) !== null;
  } catch {
    // Unreadable cooldown state is uncertainty, and uncertainty routes to
    // OpenRouter. Treating it as "not cooling down" would send traffic to a
    // supplier we just failed to check on.
    return true;
  }
}

function client(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "ahura-inference-edge/supplier-routing" } },
  });
}

/** The always-available answer. */
function fallback(_env: Env, catalogUpstreamModelId: string, reason: SupplierRoute["reason"]): SupplierRoute {
  return {
    supplier: DEFAULT_SUPPLIER,
    upstreamModelId: catalogUpstreamModelId,
    // Deliberately null — see the field doc. The caller's key is correct for
    // the default supplier, and for BYOK it is the ONLY correct key.
    key: null,
    reason,
  };
}

/**
 * Resolve the supplier for one request.
 *
 * `catalogUpstreamModelId` is what inference.models already resolved — the
 * OpenRouter id, and the value used for every fallback.
 */
export async function resolveSupplierRoute(opts: {
  env: Env;
  modelId: string;
  catalogUpstreamModelId: string;
  orgId: string;
  path: UpstreamPath;
  /** Customer-BYOK requests must never use marketplace supply: we would be
   *  spending the customer's key at a supplier they did not choose. */
  billing: "platform" | "byok";
  /** A preset compiles vendor-specific routing knobs that only OpenRouter
   *  understands, so a preset-carrying request pins there. */
  hasPreset: boolean;
  /** Already read by lookupModelRouting on the same request — passed in rather
   *  than re-queried. Undefined means "not supplied", and only then is the row
   *  fetched here. */
  preferredProvider?: string | null;
}): Promise<SupplierRoute> {
  const { env, modelId, catalogUpstreamModelId, orgId, path, billing, hasPreset } = opts;

  if (billing === "byok" || hasPreset) return fallback(env, catalogUpstreamModelId, "default");

  try {
    // The common case — no supplier preference — must not pay for a Supabase
    // client it never uses. With the model row now passed in by the caller,
    // that is almost every request.
    let preferred = opts.preferredProvider;
    if (preferred === undefined) {
      const { data: model, error: modelErr } = await client(env)
        .schema("inference")
        .from("models")
        .select("preferred_provider")
        .eq("model_id", modelId)
        .maybeSingle<{ preferred_provider: string | null }>();
      if (modelErr) return fallback(env, catalogUpstreamModelId, "lookup_failed");
      preferred = model?.preferred_provider ?? null;
    }
    if (!preferred || preferred === "openrouter") {
      return fallback(env, catalogUpstreamModelId, "default");
    }

    const supabase = client(env);
    const supplier = getSupplier(preferred);
    if (supplier.id === DEFAULT_SUPPLIER.id) return fallback(env, catalogUpstreamModelId, "default");
    if (!supplier.supports(path)) return fallback(env, catalogUpstreamModelId, "path_unsupported");

    const key = supplier.platformKey(env);
    if (!key) return fallback(env, catalogUpstreamModelId, "no_key");

    const [routeRes, orgRes, switchOn, cooling] = await Promise.all([
      supabase
        .schema("inference")
        .from("model_routes")
        .select("upstream_model_id, enabled, catalog_present, catalog_available")
        .eq("model_id", modelId)
        .eq("provider", preferred)
        .maybeSingle<{
          upstream_model_id: string;
          enabled: boolean;
          catalog_present: boolean;
          catalog_available: boolean;
        }>(),
      supabase
        .schema("inference")
        .from("orgs")
        .select("allow_marketplace_supply, zdr_default")
        .eq("id", orgId)
        .maybeSingle<{ allow_marketplace_supply: boolean; zdr_default: boolean }>(),
      supplierSwitchOn(supabase, supplier.id),
      isCoolingDown(env, supplier.id, modelId),
    ]);

    const route = routeRes.error ? null : routeRes.data;
    if (!route) return fallback(env, catalogUpstreamModelId, "no_route_row");
    if (!route.enabled) return fallback(env, catalogUpstreamModelId, "route_disabled");
    if (!route.catalog_present || !route.catalog_available) {
      return fallback(env, catalogUpstreamModelId, "catalog_unavailable");
    }
    if (!switchOn) return fallback(env, catalogUpstreamModelId, "switch_off");
    // Explicitly TRUE. An error, a missing org row or a NULL all mean no.
    if (orgRes.error || orgRes.data?.allow_marketplace_supply !== true) {
      return fallback(env, catalogUpstreamModelId, "org_not_allowed");
    }
    // ZDR wins over the permission flag, always. The admin API refuses to set
    // both, but that is one write path among several and a "must never happen"
    // held up only by an API guard is a promise waiting to be broken. Decide it
    // HERE, where the request is actually routed: a zero-retention org never
    // touches capacity that may keep its payload for 14 days.
    if (orgRes.data?.zdr_default === true) {
      return fallback(env, catalogUpstreamModelId, "org_zdr");
    }
    if (cooling) return fallback(env, catalogUpstreamModelId, "cooling_down");

    return { supplier, upstreamModelId: route.upstream_model_id, key, reason: "preferred" };
  } catch {
    return fallback(env, catalogUpstreamModelId, "lookup_failed");
  }
}

/** Reads the supplier kill switch FAIL-CLOSED — see the file header. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function supplierSwitchOn(supabase: any, supplierId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", `ai_supplier_${supplierId}_enabled`)
      .maybeSingle();
    if (error || data == null) return false; // absent or unreadable = off
    const value = (data as { value?: unknown }).value;
    return value === true || value === "true";
  } catch {
    return false;
  }
}
