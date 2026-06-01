/**
 * Routing preset resolver.
 *
 * Looks up an org-scoped preset by name from inference.model_presets, with
 * a per-isolate in-memory cache (5-min TTL) so repeated requests on the same
 * Worker isolate skip the Postgres round-trip. Cold isolate = one SELECT.
 *
 * The compiled preset config is merged into the outgoing OpenRouter body
 * to control model fallback chain + provider routing preferences. The
 * caller's request body takes precedence on fields they explicitly set.
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
 * Merge a resolved preset into an outgoing OpenRouter chat-completions body.
 * The caller's explicit fields take precedence; preset fills the gaps.
 *
 *   - `models`: caller's `model` first, then preset's models (deduped). This
 *     becomes OpenRouter's fallback chain — if the first model errors or has
 *     no capacity, OR rolls down the list.
 *   - `provider.sort`: preset wins ONLY if caller didn't set provider.sort.
 *   - `provider.max_latency`: same.
 *   - `provider.max_price`: same.
 *   - `provider.allow_fallbacks`: preset wins only if caller didn't set it.
 *
 * Returns the merged body (does not mutate input).
 */
export function applyPreset(
  body: Record<string, unknown>,
  preset: PresetConfig
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };

  // 1. Model fallback chain — put caller's model first, then preset models
  const callerModel = typeof body.model === "string" ? body.model : null;
  const merged: string[] = [];
  if (callerModel) merged.push(callerModel);
  for (const m of preset.models) {
    if (!merged.includes(m)) merged.push(m);
  }
  // If body already has a `models` array, append preset entries to it (deduped)
  if (Array.isArray(body.models)) {
    const callerExtra = body.models.filter((m): m is string => typeof m === "string");
    for (const m of callerExtra) {
      if (!merged.includes(m)) merged.push(m);
    }
  }
  out.models = merged;
  // Keep the canonical `model` as the first item so OpenRouter still
  // reports model attribution correctly when no fallback fires.
  if (!callerModel && merged.length > 0) {
    out.model = merged[0];
  }

  // 2. Provider routing preferences — preset fills gaps in caller config
  const callerProvider = (body.provider as Record<string, unknown> | undefined) ?? {};
  const provider: Record<string, unknown> = { ...callerProvider };

  if (preset.provider_sort && provider.sort === undefined) {
    provider.sort = preset.provider_sort;
  }
  if (preset.max_latency_ms && provider.max_latency === undefined) {
    provider.max_latency = preset.max_latency_ms;
  }
  if (preset.preferred_max_price_per_mtok && provider.max_price === undefined) {
    provider.max_price = preset.preferred_max_price_per_mtok;
  }
  if (preset.allow_fallbacks !== undefined && provider.allow_fallbacks === undefined) {
    provider.allow_fallbacks = preset.allow_fallbacks;
  }

  if (Object.keys(provider).length > 0) {
    out.provider = provider;
  }

  return out;
}
