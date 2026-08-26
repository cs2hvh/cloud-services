/**
 * Wokey upstream client.
 *
 * Thin wrapper around fetch() that:
 *   • injects the right Authorization header (platform key vs caller's BYOK)
 *   • passes through OpenAI-compatible request bodies unchanged
 *   • streams SSE responses with backpressure-respecting passthrough
 *
 * Replaced OpenRouter as the single upstream. Wokey is OpenAI-compatible at
 * https://api.wokey.ai/v1, so the request/response shapes below are unchanged
 * from the OpenRouter era — what changed is the base URL, the credential, and
 * the model id we put on the wire (see `upstream_model_id` in model-routing).
 *
 * Two deliberate differences from the OpenRouter client this replaces:
 *
 *   1. No `HTTP-Referer` / `X-Title` headers. Those were OpenRouter's
 *      attribution mechanism for its rankings page; they mean nothing to
 *      Wokey and sending them would imply a relationship that no longer
 *      exists.
 *
 *   2. `/embeddings` is absent from the path union, on purpose. Wokey serves
 *      no embeddings endpoint and lists no embedding model, so a call to one
 *      would 404 at runtime. Keeping it out of the type turns that into a
 *      compile error instead — if embeddings come back, they need a real
 *      provider decision, not a silently reintroduced path.
 *
 * BYOK resolution:
 *   • Looks up inference.byok_keys for the org + provider
 *   • Decrypts the AES-GCM ciphertext with env.BYOK_DEK
 *   • Returns the plaintext key for use as the upstream Bearer token
 */
import { createClient } from "@supabase/supabase-js";
import { decryptAesGcm, postgresByteaToBytes } from "./crypto.ts";
import type { Env } from "../types.ts";

/**
 * The single BYOK provider whose keys this gateway can actually forward.
 *
 * Every request goes to WOKEY_BASE_URL, so a key stored under any other
 * provider cannot be used without shipping it to the wrong vendor. Change
 * this only alongside real multi-upstream routing.
 */
export const ROUTABLE_BYOK_PROVIDER = "wokey" as const;

export interface WokeyForwardOptions {
  env: Env;
  body: unknown;
  upstreamKey: string;           // either env.WOKEY_PLATFORM_KEY or caller's BYOK
  path: "/chat/completions" | "/completions";
  signal?: AbortSignal;          // tied to client AbortController for cancel propagation
  extraHeaders?: Record<string, string>;
}

export async function forwardJson(opts: WokeyForwardOptions): Promise<Response> {
  const url = `${opts.env.WOKEY_BASE_URL}${opts.path}`;
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.upstreamKey}`,
      "Content-Type": "application/json",
      ...opts.extraHeaders,
    },
    body: JSON.stringify(opts.body),
    signal: opts.signal,
  });
}

/**
 * Stream a response back to the client without buffering.
 * The TransformStream sits between upstream and client so we can:
 *   • inspect the final SSE chunk for usage stats
 *   • cancel the upstream when the client disconnects
 */
export function streamPassthrough(
  upstream: Response,
  onComplete?: (rawText: string) => void
): Response {
  if (!upstream.body) {
    return upstream;
  }

  let buffer = "";
  const decoder = new TextDecoder();

  const transformer = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      controller.enqueue(chunk);
    },
    flush() {
      buffer += decoder.decode();
      onComplete?.(buffer);
    },
  });

  upstream.body.pipeTo(transformer.writable).catch((err) => {
    console.error(
      JSON.stringify({
        level: "warn",
        message: "upstream stream aborted",
        err: String(err),
      })
    );
  });

  const headers = new Headers(upstream.headers);
  headers.delete("content-length");
  headers.set(
    "content-type",
    upstream.headers.get("content-type") ?? "text/event-stream"
  );
  headers.set("cache-control", "no-cache, no-transform");
  headers.set("connection", "keep-alive");

  return new Response(transformer.readable, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

/**
 * Resolve the upstream API key to use for this request.
 *
 * Platform billing → env.WOKEY_PLATFORM_KEY
 * BYOK billing     → decrypt the org's stored key for the requested provider
 *                    (defaults to 'wokey' — the single upstream)
 *
 * Throws an Error with a user-safe message if no valid BYOK key is found —
 * the caller maps this to a 400 with code `byok_unavailable`.
 */
export async function resolveUpstreamKey(
  env: Env,
  billing: "platform" | "byok",
  orgId: string,
  byokProvider: string | undefined
): Promise<string> {
  if (billing === "platform") {
    // Loud rather than silent: if the Wokey secret was never set during the
    // cutover, every platform-billed request would otherwise go upstream with
    // `Bearer undefined` and come back as an opaque 401.
    //
    // Loud to US, though — not to the customer. The route handlers return
    // this error's message verbatim, so naming the env var and the wrangler
    // command here would publish our deploy internals to anyone who makes a
    // request while the secret is missing.
    if (!env.WOKEY_PLATFORM_KEY) {
      console.error(
        JSON.stringify({
          level: "error",
          message:
            "WOKEY_PLATFORM_KEY is not set — every platform-billed request " +
            "will fail. Set it with `wrangler secret put WOKEY_PLATFORM_KEY`.",
        })
      );
      throw new Error(
        "The inference service is temporarily unavailable. Please retry, or " +
          "contact support if this persists."
      );
    }
    return env.WOKEY_PLATFORM_KEY;
  }

  const provider = byokProvider ?? ROUTABLE_BYOK_PROVIDER;

  // Refuse to forward a key that belongs to a different vendor.
  //
  // Every BYOK request ends up at WOKEY_BASE_URL, because that is the only
  // upstream this gateway has. So a caller asking for provider 'openai' would
  // have their OpenAI key decrypted and sent, as a Bearer token, to Wokey — a
  // third party with no business holding it. It would 401 and look like a
  // broken feature, but the credential has already left our infrastructure by
  // then.
  //
  // Checked BEFORE the lookup so the ciphertext is never even fetched, let
  // alone decrypted. The other enum values stay valid for STORAGE — a
  // customer may pre-load a key for a provider we intend to route to later —
  // they are just not forwardable today.
  if (provider !== ROUTABLE_BYOK_PROVIDER) {
    throw new Error(
      `BYOK is not available for provider '${provider}'. This gateway routes ` +
        `all traffic through a single upstream, so only a '${ROUTABLE_BYOK_PROVIDER}' ` +
        `key can be used. Remove the X-Ahura-BYOK-Provider header to use your ` +
        `'${ROUTABLE_BYOK_PROVIDER}' key, or switch to platform billing.`
    );
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "ahura-inference-edge-byok" } },
  });

  const { data, error } = await supabase
    .schema("inference")
    .from("byok_keys")
    .select("ciphertext")
    .eq("org_id", orgId)
    .eq("provider", provider)
    .eq("is_valid", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ ciphertext: string }>();

  if (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "BYOK key lookup failed",
        err: error.message,
      })
    );
    throw new Error("Unable to look up BYOK key");
  }
  if (!data) {
    throw new Error(`No valid BYOK key configured for provider '${provider}'`);
  }

  try {
    const cipherBytes = postgresByteaToBytes(data.ciphertext);
    return await decryptAesGcm(cipherBytes, env.BYOK_DEK);
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "BYOK key decryption failed",
        err: err instanceof Error ? err.message : String(err),
      })
    );
    throw new Error(
      "Stored BYOK key could not be decrypted — DEK rotation may have occurred"
    );
  }
}

/**
 * Cached-prompt-token count, read across the several spellings upstreams use.
 *
 * This exists because the field is NOT standardised and getting it wrong is a
 * billing error, not a cosmetic one. The consumer computes
 *
 *     billable_input = max(0, input_tokens - cached_tokens)
 *
 * so a cached count that silently reads 0 bills the customer the full input
 * rate on a cache hit — an overcharge, and an invisible one.
 *
 * OpenAI reports `usage.prompt_tokens_details.cached_tokens`. Wokey does not:
 * a live probe on 2026-08-25 returned `cache_read_tokens` and
 * `cache_read_input_tokens` (the Anthropic spelling) at the top level of
 * `usage`, and no `prompt_tokens_details` at all. Both spellings are accepted
 * here, OpenAI's first, so this keeps working if the upstream changes again or
 * a managed vLLM endpoint reports the standard shape.
 *
 * Returns null — not 0 — when nothing is reported, so "no cache information"
 * stays distinguishable from "a genuine zero" in the usage record.
 */
export function readCachedTokens(usage: unknown): number | null {
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;

  const details = u.prompt_tokens_details;
  if (details && typeof details === "object") {
    const v = (details as Record<string, unknown>).cached_tokens;
    if (typeof v === "number") return v;
  }
  for (const key of ["cache_read_input_tokens", "cache_read_tokens"]) {
    const v = u[key];
    if (typeof v === "number") return v;
  }
  return null;
}

/**
 * Turn an upstream error response into one safe to hand a customer.
 *
 * The gateway used to return the upstream's error body verbatim. That leaks
 * who our upstream is: Wokey's 404 reads "Model ID ... was not recognized.
 * ... Visit https://wokey.ai/models to copy the correct model ID", which
 * names the provider, its console URL, and by implication our whole supply
 * chain. Rate-limit and quota errors can additionally hint at our account
 * tier and spend.
 *
 * The migration made this far more likely to fire, not less: delisting most
 * of the catalog means clients still naming an old model now reach an error
 * path that previously almost never ran.
 *
 * So: keep the HTTP status (clients need it to retry correctly) and the
 * OpenAI-shaped envelope, but replace the prose with our own. The original
 * upstream text is returned to the caller of this function for
 * SERVER-SIDE logging only — never put it in the response.
 */
export interface SanitizedUpstreamError {
  /** Safe body to return to the customer. */
  body: { error: { message: string; type: string; code: string; request_id: string } };
  /** Original upstream text. Log it; do not serve it. */
  upstreamText: string;
}

export function sanitizeUpstreamError(
  status: number,
  upstreamText: string,
  requestId: string
): SanitizedUpstreamError {
  let message: string;
  let type: string;
  let code: string;

  if (status === 404) {
    message =
      "The requested model is not available. Call GET /v1/models for the " +
      "current list of models your key can use.";
    type = "invalid_request_error";
    code = "model_not_found";
  } else if (status === 429) {
    message =
      "Upstream rate limit reached. Retry after a short backoff.";
    type = "rate_limit_error";
    code = "upstream_rate_limited";
  } else if (status === 400 || status === 422) {
    // The upstream rejected the request shape. We cannot echo its reason
    // without risking provider detail, but the caller does need to know the
    // fault is theirs, not ours.
    message =
      "The upstream rejected this request as malformed. Check your " +
      "parameters against the OpenAI Chat Completions specification.";
    type = "invalid_request_error";
    code = "upstream_rejected_request";
  } else if (status === 401 || status === 403) {
    // Never surface upstream auth state — that is OUR credential failing,
    // and saying so tells a customer something about our account.
    message =
      "The inference service is temporarily unable to process this request.";
    type = "api_error";
    code = "upstream_unavailable";
  } else {
    message =
      "The inference service returned an error. If this persists, contact " +
      "support with the request id.";
    type = "api_error";
    code = `upstream_${status}`;
  }

  return {
    body: { error: { message, type, code, request_id: requestId } },
    upstreamText,
  };
}

/**
 * Clamp an upstream-reported cached-token count into a range that cannot
 * distort a bill.
 *
 * `cached` is attacker-adjacent data: it arrives as JSON from a third party
 * and feeds the billing consumer directly, where
 * `raw_cents += cached * cached_rate / 1M` has no upper bound. A negative
 * value inflates billable input (`input - cached` grows); an absurdly large
 * one inflates the cached term. Neither is hypothetical enough to ignore on
 * a platform that has already shipped one unvalidated billing rate.
 *
 * Cached tokens are by definition a subset of input tokens, so the input
 * count is the natural ceiling. Returns null when there is nothing usable,
 * preserving "no cache information" as distinct from "zero".
 */
export function clampCachedTokens(
  cached: number | null,
  inputTokens: number | null | undefined
): number | null {
  if (cached === null || !Number.isFinite(cached)) return null;
  if (cached < 0) return 0;
  const ceiling = Number.isFinite(inputTokens as number) ? (inputTokens as number) : null;
  if (ceiling !== null && ceiling >= 0 && cached > ceiling) return ceiling;
  return cached;
}
