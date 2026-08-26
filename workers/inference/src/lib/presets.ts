/**
 * Routing preset resolver.
 *
 * Looks up an org-scoped preset by name from inference.model_presets, with
 * a per-isolate in-memory cache (5-min TTL) so repeated requests on the same
 * Worker isolate skip the Postgres round-trip. Cold isolate = one SELECT.
 *
 * ⚠ MOST OF THIS FEATURE IS INERT SINCE THE MOVE TO WOKEY.
 *
 * Presets were built against OpenRouter's request extensions: a `models`
 * array (its fallback chain) and a `provider` object (sort, max_latency,
 * max_price, allow_fallbacks). None of those are OpenAI-standard fields, and
 * Wokey does not implement them — a live probe on 2026-08-25 sent both and
 * got a normal 200 back with them ignored.
 *
 * Silently ignored is the worst of the possible outcomes: an org that
 * configured a fallback chain believes it has failover and does not. So
 * `applyPreset` no longer puts those fields on the wire, and the gateway
 * marks affected responses with `X-Ahura-Preset-Fallback: unsupported`.
 *
 * What still works — and is worth keeping — is the preset as a NAMED DEFAULT
 * MODEL: a caller can send `X-Ahura-Preset` with no `model` and get the
 * preset's first model. That behaviour is ours, not the upstream's.
 *
 * Restoring real fallback means implementing it in the gateway (catch the
 * upstream error, retry the next model in the chain) rather than delegating
 * to the upstream. That is a feature, not a config change.
 */
import { createClient } from "@supabase/supabase-js";
import type { Env } from "../types.ts";

export interface PresetConfig {
  models: string[];
  provider_sort?: "price" | "throughput" | "latency" | null;
  max_latency_ms?: number | null;
  allow_fallbacks?: boolean;
  preferred_max_price_per_mtok?: number | null;
}

interface CachedPreset {
  config: PresetConfig;
  expiresAt: number;
}

const cache = new Map<string, CachedPreset>();
const CACHE_TTL_MS = 5 * 60_000;

function cacheKey(orgId: string, name: string): string {
  return `${orgId}::${name}`;
}

export async function resolvePreset(
  env: Env,
  orgId: string,
  presetName: string
): Promise<PresetConfig | null> {
  const key = cacheKey(orgId, presetName);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.config;
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "ahura-inference-edge-preset" } },
  });

  const { data, error } = await supabase
    .schema("inference")
    .from("model_presets")
    .select("config")
    .eq("org_id", orgId)
    .eq("name", presetName)
    .maybeSingle<{ config: PresetConfig }>();

  if (error || !data) {
    return null;
  }

  cache.set(key, { config: data.config, expiresAt: Date.now() + CACHE_TTL_MS });
  return data.config;
}

/**
 * True when the upstream implements OpenRouter-style `models` / `provider`
 * request extensions. False for Wokey — see the file header. Read by the
 * route handlers to decide whether to warn the caller.
 */
export const UPSTREAM_HONOURS_PRESET_ROUTING = false;

/** Does this preset ask for behaviour the upstream cannot deliver? */
export function presetRoutingIsDegraded(preset: PresetConfig): boolean {
  if (UPSTREAM_HONOURS_PRESET_ROUTING) return false;
  return (
    preset.models.length > 1 ||
    !!preset.provider_sort ||
    !!preset.max_latency_ms ||
    !!preset.preferred_max_price_per_mtok ||
    preset.allow_fallbacks === true
  );
}

/**
 * Merge a resolved preset into an outgoing chat-completions body.
 * The caller's explicit fields take precedence; preset fills the gaps.
 *
 * Only the default-model behaviour is applied: if the caller sent no `model`,
 * the preset's first model becomes it. The former fallback-chain and
 * provider-routing fields are deliberately NOT emitted — the upstream ignores
 * them, so putting them on the wire would only make the request look like it
 * requested something it did not get.
 *
 * Returns the merged body (does not mutate input).
 */
export function applyPreset(
  body: Record<string, unknown>,
  preset: PresetConfig
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };

  // Named default model — the one part of a preset the gateway itself can
  // honour. If the caller named a model, theirs wins.
  const callerModel = typeof body.model === "string" ? body.model : null;
  if (!callerModel && preset.models.length > 0) {
    out.model = preset.models[0];
  }

  // The fallback chain and provider-routing preferences are NOT emitted.
  // They were OpenRouter extensions; Wokey accepts and ignores them. Sending
  // them would put a request on the wire that appears to ask for failover and
  // price/latency steering it will never receive — misleading in upstream
  // logs and in any traffic capture. Dropping them changes no behaviour,
  // because there was none to change.
  //
  // A caller who set `models` or `provider` themselves keeps whatever they
  // sent; it is not this function's job to strip a caller's own fields.

  return out;
}
