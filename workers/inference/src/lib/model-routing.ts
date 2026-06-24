/**
 * Model routing — looks up the model in inference.models and decides
 * whether to forward to the upstream gateway (proxy) or to a managed
 * serving endpoint (Phase 11).
 *
 * The decision tree:
 *   serving_type='proxy'                    → forward to OpenRouter (default)
 *   serving_type='runpod_ft'/'runpod_byo':
 *     - models.serving_url IS NOT NULL      → forward to that URL
 *                                              (managed; Phase 11)
 *     - models.serving_url IS NULL          → 400 self_serve_model
 *                                              (user runs vLLM themselves;
 *                                              Phase 10)
 *
 * The serving_url shape is a full OpenAI-compatible base URL:
 *   "https://phi-4-managed.ahura.svc:8000"
 * The gateway appends "/v1/chat/completions" when forwarding.
 */
import { createClient } from "@supabase/supabase-js";
import type { Env } from "../types.ts";

export type ServingType = "proxy" | "runpod_ft" | "runpod_byo";

export interface ModelRouting {
  serving_type: ServingType;
  /** Full HTTPS URL of the managed vLLM server. NULL = self-serve only. */
  serving_url: string | null;
  /** The name to put in the outgoing `model` field when forwarding to a
   *  managed endpoint. vLLM's openai-server only accepts requests
   *  whose `model` matches its `--served-model-name`. */
  served_model_name: string | null;
  /** Upstream model ID used when serving_type='proxy' (e.g. 'cohere/rerank-v3.5'). */
  upstream_model_id: string | null;
  is_active: boolean;
  /** Model capabilities JSONB — route-specific handlers can read feature flags
   *  (e.g. supported_durations, supports_i2v) without extra DB queries. */
  capabilities: Record<string, unknown> | null;
}

/**
 * Look up routing for a model id. Returns null if the model isn't in
 * the catalog (gateway should treat as 404).
 */
export async function lookupModelRouting(
  env: Env,
  modelId: string
): Promise<ModelRouting | null> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data } = await supabase
    .schema("inference")
    .from("models")
    .select("serving_type, serving_url, upstream_model_id, is_active, capabilities")
    .eq("model_id", modelId)
    .maybeSingle<{
      serving_type: ServingType;
      serving_url: string | null;
      upstream_model_id: string | null;
      is_active: boolean;
      capabilities: Record<string, unknown> | null;
    }>();

  if (!data) return null;

  return {
    serving_type: data.serving_type,
    serving_url: data.serving_url,
    served_model_name: data.serving_type === "runpod_ft" ? "adapter" : null,
    upstream_model_id: data.upstream_model_id,
    is_active: data.is_active,
    capabilities: data.capabilities ?? null,
  };
}

/**
 * Forward a chat/completions request to a managed vLLM server.
 * The serving_url is treated as a base ("https://host:port") and the
 * gateway appends "/v1/chat/completions". vLLM's openai-server lives
 * at /v1/* so the URL composition matches OpenAI's own spec.
 *
 * Returns the upstream Response. Caller is responsible for streaming
 * passthrough or buffering.
 */
export async function forwardToManaged(opts: {
  servingUrl: string;
  body: Record<string, unknown>;
  servedModelName: string;
  signal?: AbortSignal | null;
  pathSuffix?: string; // defaults to "/v1/chat/completions"
}): Promise<Response> {
  const path = opts.pathSuffix ?? "/v1/chat/completions";
  const base = opts.servingUrl.replace(/\/+$/, "");

  // Rewrite model to vLLM's served-model-name. Caller's original model id
  // (e.g. "ahura/phi-4:ft-abc12345") wouldn't pass vLLM's --served-model-name
  // check unless the operator explicitly set --served-model-name to that
  // value at container start.
  const outgoing = { ...opts.body, model: opts.servedModelName };

  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(outgoing),
    signal: opts.signal ?? undefined,
  });
}

/**
 * Push the matching FT row's `serving_pod_auto_stop_at` forward by N
 * minutes (default 60). Called from the gateway on every successful
 * managed call so active pods don't get killed by the watchdog while
 * customers are using them. Idle pods (no calls) hit their original
 * deadline and get reaped.
 *
 * Best-effort: failures here are logged but never bubble up — a failed
 * extend is far better than a failed customer response.
 *
 * Implementation note: we look up by `serving_url` not by model id
 * (avoids an extra round trip — the gateway already has the URL from
 * the routing lookup).
 */
export async function extendServingPodIdle(
  env: Env,
  servingUrl: string,
  extendMinutes = 60
): Promise<void> {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const newDeadline = new Date(Date.now() + extendMinutes * 60 * 1000).toISOString();
    await supabase
      .schema("inference")
      .from("finetunes")
      .update({ serving_pod_auto_stop_at: newDeadline })
      .eq("serving_url", servingUrl)
      .eq("serving_pod_state", "running");
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "extendServingPodIdle failed",
        servingUrl,
        err: err instanceof Error ? err.message : String(err),
      })
    );
  }
}
