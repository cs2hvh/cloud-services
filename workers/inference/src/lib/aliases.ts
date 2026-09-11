/**
 * Retired catalog ids that still resolve.
 *
 * Renaming a model breaks every integration that typed the old id. The
 * catalog therefore keeps the old id in inference.model_aliases pointing at
 * the new one, and the gateway maps it before anything else looks at the
 * model: routing, the key's allowlist, the response headers and the usage
 * record all see the canonical id, so a rename never splits a customer's
 * history in two.
 *
 * The table is tiny and changes about never, so it is held in the isolate for
 * a minute rather than queried per request. A refresh that fails serves the
 * last good map instead of throwing: an alias lookup is not worth failing a
 * request over, and an unresolved alias fails later with a clean "model not
 * available" rather than a 500.
 *
 * A row here can never shadow a live model id — two triggers in the database
 * refuse an alias that names an existing model, and a model named after an
 * existing alias.
 */
import { createClient } from "@supabase/supabase-js";
import type { Env } from "../types.ts";

const TTL_MS = 60_000;

let cached: { at: number; map: Map<string, string> } | null = null;
let inflight: Promise<Map<string, string>> | null = null;

async function load(env: Env): Promise<Map<string, string>> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "ahura-inference-edge" } },
  });

  const { data, error } = await supabase
    .schema("inference")
    .from("model_aliases")
    .select("alias, model_id")
    .returns<{ alias: string; model_id: string }[]>();

  if (error) throw new Error(error.message);

  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(row.alias, row.model_id);
  return map;
}

/** The alias → canonical id map, cached in the isolate for TTL_MS. */
export async function aliasMap(env: Env): Promise<Map<string, string>> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.map;
  if (inflight) return inflight;

  inflight = load(env)
    .then((map) => {
      cached = { at: Date.now(), map };
      return map;
    })
    .catch((err: unknown) => {
      console.error(
        JSON.stringify({
          level: "error",
          message: "Model alias refresh failed; serving last known aliases",
          err: err instanceof Error ? err.message : String(err),
        })
      );
      // Stale is fine here, and an empty map only means an alias 404s.
      return cached?.map ?? new Map<string, string>();
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Canonical catalog id for what the caller asked for. Unknown ids pass through. */
export async function resolveModelId(env: Env, requested: string): Promise<string> {
  if (!requested) return requested;
  const map = await aliasMap(env);
  return map.get(requested) ?? requested;
}

/** Canonical id → the retired ids that still point at it. */
export async function aliasesByModel(env: Env): Promise<Map<string, string[]>> {
  const map = await aliasMap(env);
  const out = new Map<string, string[]>();
  for (const [alias, modelId] of map) {
    const list = out.get(modelId);
    if (list) list.push(alias);
    else out.set(modelId, [alias]);
  }
  for (const list of out.values()) list.sort();
  return out;
}

/** Test seam: drop the isolate cache. */
export function resetAliasCache(): void {
  cached = null;
  inflight = null;
}
