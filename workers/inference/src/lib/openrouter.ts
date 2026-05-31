/**
 * OpenRouter upstream client.
 *
 * Thin wrapper around fetch() that:
 *   • injects the right Authorization header (platform key vs caller's BYOK)
 *   • passes through OpenAI-compatible request bodies unchanged
 *   • surfaces the OpenRouter generation-id header for our usage telemetry
 *   • streams SSE responses with backpressure-respecting passthrough
 *
 * BYOK resolution (Phase 1):
 *   • Looks up inference.byok_keys for the org + provider
 *   • Decrypts the AES-GCM ciphertext with env.BYOK_DEK
 *   • Returns the plaintext key for use as the upstream Bearer token
 *   Architecture today: all BYOK is for OpenRouter (the single upstream).
 *   Direct-provider routing (anthropic/openai/google) is reserved for future.
 */
import { createClient } from "@supabase/supabase-js";
import { decryptAesGcm, postgresByteaToBytes } from "./crypto.ts";
import type { Env } from "../types.ts";

export interface OpenRouterForwardOptions {
  env: Env;
  body: unknown;
  upstreamKey: string;           // either env.OPENROUTER_PLATFORM_KEY or caller's BYOK
  path: "/chat/completions" | "/embeddings" | "/completions";
  signal?: AbortSignal;          // tied to client AbortController for cancel propagation
  extraHeaders?: Record<string, string>;
}

export async function forwardJson(opts: OpenRouterForwardOptions): Promise<Response> {
  const url = `${opts.env.OPENROUTER_BASE_URL}${opts.path}`;
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.upstreamKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ahurasense.com",
      "X-Title": "AhuraCloud Inference",
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
 * Platform billing → env.OPENROUTER_PLATFORM_KEY
 * BYOK billing     → decrypt the org's stored key for the requested provider
 *                    (defaults to 'openrouter' per architecture)
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
  if (billing === "platform") return env.OPENROUTER_PLATFORM_KEY;

  const provider = (byokProvider ?? "openrouter") as
    | "openrouter"
    | "openai"
    | "anthropic"
    | "google"
    | "mistral"
    | "custom";

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
