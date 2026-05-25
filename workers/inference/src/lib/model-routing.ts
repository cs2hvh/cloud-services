/**
 * Model routing — looks up the model in inference.models and decides
 * whether to forward to the upstream gateway (proxy) or to a self-hosted
 * fine-tune serving endpoint (runpod_ft).
 *
 * The catalog row's `serving_type` is the switch:
 *   'proxy'      → forward to upstream gateway (default path)
 *   'runpod_ft'  → forward to the per-FT serving endpoint stored on the
 *                  row's `runpod_endpoint_id`; rewrite `model` to "adapter"
 *                  (the vLLM --served-model-name).
 *   'runpod_byo' → BYO Deploy, similar to runpod_ft. (Phase 6 — not all
 *                  source types implemented yet.)
 */
import { createClient } from "@supabase/supabase-js";
import type { Env } from "../types.ts";

export type ServingType = "proxy" | "runpod_ft" | "runpod_byo";

export interface ModelRouting {
  serving_type: ServingType;
  /** The per-FT or per-BYO endpoint id; null for proxy models. */
  endpoint_id: string | null;
  /** The name to put in the outgoing `model` field when forwarding to a
   *  self-hosted endpoint. vLLM's openai-server only accepts requests
   *  whose `model` matches its `--served-model-name`. */
  served_model_name: string | null;
  is_active: boolean;
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
    .select("serving_type, runpod_endpoint_id, is_active")
    .eq("model_id", modelId)
    .maybeSingle<{
      serving_type: ServingType;
      runpod_endpoint_id: string | null;
      is_active: boolean;
    }>();

  if (!data) return null;

  return {
    serving_type: data.serving_type,
    endpoint_id: data.runpod_endpoint_id,
    served_model_name: data.serving_type === "runpod_ft" ? "adapter" : null,
    is_active: data.is_active,
  };
}

/**
 * Forward a chat/completions request to a self-hosted serving endpoint.
 * The endpoint is expected to be OpenAI-compatible (vLLM openai-server).
 *
 * Returns the upstream Response. Caller is responsible for streaming
 * passthrough or buffering.
 */
export async function forwardToSelfHosted(opts: {
  env: Env;
  endpointId: string;
  body: Record<string, unknown>;
  servedModelName: string;
  signal?: AbortSignal | null;
  pathSuffix?: string; // defaults to "/openai/v1/chat/completions"
}): Promise<Response> {
  const { env, endpointId, body, servedModelName, signal } = opts;
  const path = opts.pathSuffix ?? "/openai/v1/chat/completions";

  // Rewrite model to vLLM's served-model-name. Caller's original model id
  // (e.g. "ahura/phi-4:ft-abc12345") wouldn't pass vLLM's check.
  const outgoing = { ...body, model: servedModelName };

  // Auth via the same RunPod API key we use for orchestration. The provider's
  // serverless layer requires this header on every request.
  const url = `https://api.runpod.ai/v2/${endpointId}${path}`;
  return fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.RUNPOD_API_KEY ?? ""}`,
    },
    body: JSON.stringify(outgoing),
    signal: signal ?? undefined,
  });
}
