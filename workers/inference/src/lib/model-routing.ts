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
  /** Which supplier this model is bought from. NULL = OpenRouter. Selected here
   *  so supplier routing does not re-read a row we already have — this lookup
   *  runs on every request, and a second round trip for a feature with no
   *  traffic is a cost paid by every request that will never use it. */
  preferred_provider: string | null;
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

  // BASE COLUMNS vs the one added for supplier routing, kept apart on purpose.
  //
  // This function runs on EVERY request on EVERY route, and its `null` return
  // is read by assertModelAvailable as "this model is not in the catalog" — a
  // customer-facing 404. So a query that merely FAILS is indistinguishable from
  // a model that does not exist.
  //
  // That matters because `preferred_provider` arrives in migration
  // 20260825000002. Selecting it unconditionally would mean: deploy this Worker
  // before that migration is applied and PostgREST rejects the column, `data`
  // is null, and every model on every modality reports "not found". A total
  // outage caused by deploy ordering, on a column that exists for a feature
  // with no traffic.
  //
  // So the optional column is tried, and its absence is survivable: fall back
  // to the base select and treat the supplier preference as unset. The
  // optimisation (one query instead of two) is kept when the column is there;
  // the hard dependency is not.
  const BASE = "serving_type, serving_url, upstream_model_id, is_active, capabilities";
  type Row = {
    serving_type: ServingType;
    serving_url: string | null;
    upstream_model_id: string | null;
    is_active: boolean;
    capabilities: Record<string, unknown> | null;
    preferred_provider?: string | null;
  };

  const read = (columns: string) =>
    supabase
      .schema("inference")
      .from("models")
      .select(columns)
      .eq("model_id", modelId)
      .maybeSingle<Row>();

  let { data, error } = await read(`${BASE}, preferred_provider`);
  if (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        scope: "model-routing",
        message: "catalog read failed with preferred_provider — retrying without it",
        modelId,
        err: error.message,
      })
    );
    ({ data, error } = await read(BASE));
  }

  if (error) {
    // A genuine catalog failure. Still returns null, which the callers render
    // as "model not found" — wrong, but pre-existing and unchanged here; a
    // database this broken is failing auth and spend checks too. Logged so it
    // is not silent.
    console.error(
      JSON.stringify({
        level: "error",
        scope: "model-routing",
        message: "catalog read failed",
        modelId,
        err: error.message,
      })
    );
    return null;
  }

  if (!data) return null;

  return {
    serving_type: data.serving_type,
    serving_url: data.serving_url,
    served_model_name: data.serving_type === "runpod_ft" ? "adapter" : null,
    upstream_model_id: data.upstream_model_id,
    is_active: data.is_active,
    capabilities: data.capabilities ?? null,
    // undefined when the column is not there yet — normalised to null, which
    // means "no preference", which routes to OpenRouter.
    preferred_provider: data.preferred_provider ?? null,
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
