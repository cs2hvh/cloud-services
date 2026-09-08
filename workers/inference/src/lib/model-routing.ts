/**
 * Model routing — looks up the model in inference.models and decides
 * whether to forward to the upstream gateway (proxy) or to a serving
 * endpoint we operate or rent.
 *
 * The decision tree:
 *   serving_type='proxy'                    → forward to Wokey (default)
 *   serving_type='runpod_ft'/'runpod_byo':
 *     - inference.serving_endpoints rows    → try them in weighted order,
 *                                              failing over on 5xx / network
 *     - else models.serving_url IS NOT NULL → forward to that one URL
 *                                              (managed fine-tune pod; Phase 11)
 *     - else                                → 400 self_serve_model
 *                                              (user runs vLLM themselves;
 *                                              Phase 10)
 *
 * ENDPOINTS, 2026-09-07. The first model Wokey does not carry,
 * zhipu/glm-5.3-flash-uncensored, is two RunPod pods behind one bearer key. That
 * needed three things the single serving_url column could not express: more
 * than one URL per model, a credential per URL, and a served-model-name that
 * is not "adapter". inference.serving_endpoints carries all three. The key is
 * AES-GCM under BYOK_DEK, the same envelope as a customer's BYOK key, and is
 * decrypted only at forward time.
 *
 * The URL shape is a full OpenAI-compatible base:
 *   "https://phi-4-managed.ahura.svc:8000"   or   "https://…/v1"
 * The gateway appends "/chat/completions" style paths; a base that already
 * ends in /v1 gets "/chat/completions", one that does not gets
 * "/v1/chat/completions" — see managedPath().
 */
import { createClient } from "@supabase/supabase-js";
import { decryptAesGcm, postgresByteaToBytes } from "./crypto.ts";
import type { Env } from "../types.ts";

export type ServingType = "proxy" | "runpod_ft" | "runpod_byo";

export interface ServingEndpoint {
  id: string;
  /** Full HTTPS base URL, with or without a trailing /v1. */
  baseUrl: string;
  /**
   * Ciphertext of the endpoint's bearer key under BYOK_DEK, as the Postgres
   * bytea literal PostgREST returns (`\x…`) or base64. Null: no credential.
   */
  apiKeyCt: string | null;
  /** Per-endpoint override of the model's served-model-name. */
  servedModelName: string | null;
  /** Relative share of first picks. */
  weight: number;
}

export interface ModelRouting {
  serving_type: ServingType;
  /** Full HTTPS URL of the managed vLLM server. NULL = self-serve only. */
  serving_url: string | null;
  /** The name to put in the outgoing `model` field when forwarding to a
   *  managed endpoint. vLLM's openai-server only accepts requests
   *  whose `model` matches its `--served-model-name`. */
  served_model_name: string | null;
  /**
   * What the upstream calls this model, when that differs from what we
   * call it publicly.
   *
   * Our catalog ids are namespaced (`anthropic/claude-opus-5`) because they
   * were minted when OpenRouter was the upstream and its ids were ours.
   * Wokey uses bare ids (`claude-opus-5`). Rather than rewrite the catalog —
   * which would break every customer integration that names a model — the
   * public id stays put and this column carries the upstream's spelling.
   *
   * NULL means the two agree and the public id goes upstream unchanged.
   */
  upstream_model_id: string | null;
  is_active: boolean;
  /** Enabled rows of inference.serving_endpoints for this model. */
  endpoints: ServingEndpoint[];
  /**
   * True when the endpoints table could not be read. Distinguished from
   * "no endpoints" on purpose: a model that HAS endpoints must not be
   * reported as a self-serve adapter because one query failed.
   */
  endpoints_error: boolean;
}

/** Does this routing name anywhere the gateway can actually send traffic? */
export function hasManagedTarget(routing: ModelRouting): boolean {
  return routing.endpoints.length > 0 || routing.serving_url !== null;
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
    .select("serving_type, serving_url, upstream_model_id, is_active")
    .eq("model_id", modelId)
    .maybeSingle<{
      serving_type: ServingType;
      serving_url: string | null;
      upstream_model_id: string | null;
      is_active: boolean;
    }>();

  if (!data) return null;

  // A fine-tune adapter is always served as "adapter" (the controller starts
  // vLLM that way). An operator-added model is served under the upstream's
  // own spelling, falling back to the public id.
  const servedModelName =
    data.serving_type === "runpod_ft"
      ? "adapter"
      : data.serving_type === "runpod_byo"
        ? (data.upstream_model_id ?? modelId)
        : null;

  let endpoints: ServingEndpoint[] = [];
  let endpointsError = false;
  if (data.serving_type !== "proxy") {
    const { data: rows, error } = await supabase
      .schema("inference")
      .from("serving_endpoints")
      .select("id, base_url, api_key_ct, served_model_name, weight")
      .eq("model_id", modelId)
      .eq("enabled", true);
    if (error) {
      endpointsError = true;
      console.error(
        JSON.stringify({
          level: "error",
          message: "serving_endpoints lookup failed",
          modelId,
          err: error.message,
        })
      );
    }
    endpoints = (rows ?? []).map((r) => ({
      id: String(r.id),
      baseUrl: String(r.base_url),
      apiKeyCt: (r.api_key_ct as string | null) ?? null,
      servedModelName: (r.served_model_name as string | null) ?? null,
      weight: Number(r.weight) > 0 ? Number(r.weight) : 1,
    }));
  }

  return {
    serving_type: data.serving_type,
    serving_url: data.serving_url,
    served_model_name: servedModelName,
    upstream_model_id: data.upstream_model_id,
    is_active: data.is_active,
    endpoints,
    endpoints_error: endpointsError,
  };
}

/**
 * The full URL for a managed call. A base that already names /v1 (the shape
 * RunPod and most hosted vLLM proxies hand out) gets the bare route appended;
 * a host:port base (the Phase 11 controller's shape) gets /v1 in front of it.
 */
export function managedPath(baseUrl: string, route = "/chat/completions"): string {
  const base = baseUrl.replace(/\/+$/, "");
  return base.endsWith("/v1") ? `${base}${route}` : `${base}/v1${route}`;
}

/**
 * Forward a chat/completions request to one managed vLLM server.
 *
 * Returns the upstream Response. Caller is responsible for streaming
 * passthrough or buffering.
 */
export async function forwardToManaged(opts: {
  servingUrl: string;
  body: Record<string, unknown>;
  servedModelName: string;
  signal?: AbortSignal | null;
  /** Route under /v1; defaults to "/chat/completions". */
  route?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<Response> {
  // Rewrite model to vLLM's served-model-name. Caller's original model id
  // (e.g. "ahura/phi-4:ft-abc12345") wouldn't pass vLLM's --served-model-name
  // check unless the operator explicitly set --served-model-name to that
  // value at container start.
  const outgoing: Record<string, unknown> = { ...opts.body, model: opts.servedModelName };
  // ASK FOR USAGE ON A STREAM. Wokey puts a usage object in the last chunk
  // unasked; vLLM and SGLang do so only when stream_options.include_usage is
  // set. Without it the first streamed request to GLM-5.3 Flash was recorded
  // with null tokens and billed nothing (2026-09-08), which is the shape of
  // billing gap this codebase keeps finding.
  if (outgoing.stream === true) {
    const given =
      outgoing.stream_options && typeof outgoing.stream_options === "object"
        ? (outgoing.stream_options as Record<string, unknown>)
        : {};
    outgoing.stream_options = { ...given, include_usage: true };
  }
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.apiKey) headers.authorization = `Bearer ${opts.apiKey}`;

  const doFetch = opts.fetchImpl ?? fetch;
  return doFetch(managedPath(opts.servingUrl, opts.route), {
    method: "POST",
    headers,
    body: JSON.stringify(outgoing),
    signal: opts.signal ?? undefined,
  });
}

/**
 * Endpoints in the order to try them: a weighted random first pick, then the
 * remainder chosen the same way from what is left. Pure; `random` is
 * injectable so the order is testable.
 */
export function orderEndpoints<T extends { weight: number }>(
  endpoints: readonly T[],
  random: () => number = Math.random
): T[] {
  const pool = [...endpoints];
  const out: T[] = [];
  while (pool.length > 0) {
    const total = pool.reduce((sum, e) => sum + Math.max(e.weight, 0), 0);
    let idx = pool.length - 1;
    if (total > 0) {
      let r = random() * total;
      for (let i = 0; i < pool.length; i++) {
        r -= Math.max(pool[i]?.weight ?? 0, 0);
        if (r < 0) {
          idx = i;
          break;
        }
      }
    }
    const [picked] = pool.splice(idx, 1);
    if (picked) out.push(picked);
  }
  return out;
}

export interface ManagedAttempt {
  baseUrl: string;
  /** HTTP status when the endpoint answered; null when it did not. */
  status: number | null;
  error: string | null;
}

export interface ManagedResult {
  response: Response;
  /** Which endpoint answered. */
  baseUrl: string;
  /** Endpoints tried before this one answered. Empty on the happy path. */
  attempts: ManagedAttempt[];
}

export class ManagedUnavailableError extends Error {
  constructor(public readonly attempts: ManagedAttempt[]) {
    super(
      attempts.length === 0
        ? "no serving endpoint is configured"
        : "every serving endpoint failed: " +
            attempts.map((a) => `${a.baseUrl} -> ${a.status ?? a.error}`).join("; ")
    );
    this.name = "ManagedUnavailableError";
  }
}

/**
 * Send one request to the model's endpoints, failing over until one answers.
 *
 * A 5xx or a network failure moves on to the next endpoint: those are the
 * replica's problem (cold start, pod gone, proxy hiccup) and another replica
 * may be fine. A 4xx is returned at once: it is the request's problem and
 * every replica would say the same. A client abort is rethrown: there is
 * nobody left to fail over for.
 *
 * Throws ManagedUnavailableError when no endpoint answered.
 */
export async function forwardToEndpoints(opts: {
  env: Pick<Env, "BYOK_DEK">;
  routing: ModelRouting;
  body: Record<string, unknown>;
  signal?: AbortSignal | null;
  route?: string;
  fetchImpl?: typeof fetch;
  random?: () => number;
}): Promise<ManagedResult> {
  const candidates: ServingEndpoint[] =
    opts.routing.endpoints.length > 0
      ? orderEndpoints(opts.routing.endpoints, opts.random)
      : opts.routing.serving_url
        ? [{ id: "serving_url", baseUrl: opts.routing.serving_url, apiKeyCt: null, servedModelName: null, weight: 1 }]
        : [];
  if (candidates.length === 0) throw new ManagedUnavailableError([]);

  const attempts: ManagedAttempt[] = [];
  for (const endpoint of candidates) {
    let apiKey: string | undefined;
    if (endpoint.apiKeyCt) {
      try {
        apiKey = await decryptAesGcm(postgresByteaToBytes(endpoint.apiKeyCt), opts.env.BYOK_DEK);
      } catch (err) {
        // A credential we cannot open is this endpoint's problem, not the
        // request's: skip it the way a dead pod is skipped.
        attempts.push({
          baseUrl: endpoint.baseUrl,
          status: null,
          error: `credential: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }
    }

    let response: Response;
    try {
      response = await forwardToManaged({
        servingUrl: endpoint.baseUrl,
        body: opts.body,
        servedModelName: endpoint.servedModelName ?? opts.routing.served_model_name ?? "adapter",
        signal: opts.signal,
        route: opts.route,
        apiKey,
        fetchImpl: opts.fetchImpl,
      });
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      attempts.push({
        baseUrl: endpoint.baseUrl,
        status: null,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (response.status >= 500 && response.status < 600) {
      attempts.push({ baseUrl: endpoint.baseUrl, status: response.status, error: null });
      try {
        await response.body?.cancel();
      } catch {
        // nothing to release
      }
      continue;
    }

    return { response, baseUrl: endpoint.baseUrl, attempts };
  }

  throw new ManagedUnavailableError(attempts);
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
 * the routing lookup). An operator endpoint matches no finetunes row and
 * the update is a no-op, which is the right answer for a pod nobody reaps.
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
