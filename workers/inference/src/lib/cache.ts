/**
 * L1 response cache for /v1/chat/completions.
 *
 * Strategy:
 *   • Only caches NON-streaming, deterministic (temperature 0 OR caller-set
 *     X-Ahura-Cache: aggressive) responses — streaming SSE replays are
 *     non-trivial and we defer those to Phase 7 (semantic cache).
 *   • Cache key = sha256 of normalized request body — model, messages,
 *     tools, tool_choice, response_format, max_tokens, temperature, top_p,
 *     seed. We deliberately exclude `user`, `metadata`, and our own headers.
 *   • Scoped per ORG, so one org's cache doesn't bleed into another's.
 *   • Default TTL = 300s (5 min). Caller can override with X-Ahura-Cache-TTL
 *     header (clamped to [60, 3600]).
 *   • Caller can SKIP the cache entirely with Cache-Control: no-cache OR
 *     X-Ahura-Cache: off.
 *
 * Hits/misses surface in response headers:
 *   X-Ahura-Cache: hit | miss | bypass | streaming-skipped
 *
 * Cached entries store the upstream response body verbatim + content-type +
 * a snapshot of `usage` so the metering consumer can still bill cache hits
 * at the cached_tokens rate (cheaper).
 */
import type { Env } from "../types.ts";

interface CacheableRequest {
  model?: string;
  messages?: unknown;
  tools?: unknown;
  tool_choice?: unknown;
  response_format?: unknown;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  seed?: number;
}

interface CachedResponse {
  body: string;
  contentType: string;
  cachedAt: number;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

const DEFAULT_TTL_S = 300;
const MIN_TTL_S = 60;
const MAX_TTL_S = 3600;

/**
 * Decide whether to attempt caching for this request.
 * Returns a CacheDecision struct with the cache key (if cacheable) and the
 * reason / TTL.
 */
export interface CacheDecision {
  cacheable: boolean;
  bypass: boolean; // explicit caller bypass (no-cache header)
  reason: "ok" | "streaming" | "non-deterministic" | "bypass" | "non-cacheable-body";
  key: string | null;
  ttlSeconds: number;
}

export async function shouldCache(
  request: Request,
  body: CacheableRequest,
  orgId: string
): Promise<CacheDecision> {
  // Explicit bypass
  const cacheControl = request.headers.get("cache-control") ?? "";
  const ahuraCache = request.headers.get("x-ahura-cache")?.toLowerCase() ?? "";
  if (cacheControl.includes("no-cache") || ahuraCache === "off") {
    return { cacheable: false, bypass: true, reason: "bypass", key: null, ttlSeconds: 0 };
  }

  // Streaming responses skip the cache for v1
  if (typeof (body as { stream?: boolean }).stream === "boolean" && (body as { stream: boolean }).stream) {
    return {
      cacheable: false,
      bypass: false,
      reason: "streaming",
      key: null,
      ttlSeconds: 0,
    };
  }

  // Only cache deterministic-ish requests: temperature 0 or aggressive opt-in
  const aggressive = ahuraCache === "aggressive";
  const temp = body.temperature;
  const isDeterministic = temp === 0 || (typeof temp === "number" && temp <= 0.001);
  if (!aggressive && !isDeterministic) {
    return {
      cacheable: false,
      bypass: false,
      reason: "non-deterministic",
      key: null,
      ttlSeconds: 0,
    };
  }

  // Need a model + messages to be meaningfully cacheable
  if (!body.model || !body.messages) {
    return {
      cacheable: false,
      bypass: false,
      reason: "non-cacheable-body",
      key: null,
      ttlSeconds: 0,
    };
  }

  // TTL override
  const ttlHeader = request.headers.get("x-ahura-cache-ttl");
  let ttl = DEFAULT_TTL_S;
  if (ttlHeader) {
    const parsed = Number.parseInt(ttlHeader, 10);
    if (Number.isFinite(parsed)) {
      ttl = Math.min(Math.max(parsed, MIN_TTL_S), MAX_TTL_S);
    }
  }

  const key = await computeCacheKey(orgId, body);
  return { cacheable: true, bypass: false, reason: "ok", key, ttlSeconds: ttl };
}

async function computeCacheKey(orgId: string, body: CacheableRequest): Promise<string> {
  // Stable normalized payload — sort keys, drop our headers, drop telemetry-only fields
  const normalized = {
    model: body.model,
    messages: body.messages,
    tools: body.tools,
    tool_choice: body.tool_choice,
    response_format: body.response_format,
    max_tokens: body.max_tokens,
    temperature: body.temperature,
    top_p: body.top_p,
    seed: body.seed,
  };
  const payload = `${orgId}::${JSON.stringify(normalized, Object.keys(normalized).sort())}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return "l1:" + Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function lookupCache(
  env: Env,
  key: string
): Promise<CachedResponse | null> {
  try {
    return await env.L1_CACHE.get<CachedResponse>(key, "json");
  } catch (err) {
    console.error(
      JSON.stringify({ level: "warn", message: "L1 cache lookup failed", err: String(err) })
    );
    return null;
  }
}

export async function writeCache(
  env: Env,
  key: string,
  responseBody: string,
  contentType: string,
  ttlSeconds: number,
  usage?: CachedResponse["usage"]
): Promise<void> {
  try {
    const entry: CachedResponse = {
      body: responseBody,
      contentType,
      cachedAt: Date.now(),
      usage,
    };
    await env.L1_CACHE.put(key, JSON.stringify(entry), { expirationTtl: ttlSeconds });
  } catch (err) {
    console.error(
      JSON.stringify({ level: "warn", message: "L1 cache write failed", err: String(err) })
    );
  }
}
