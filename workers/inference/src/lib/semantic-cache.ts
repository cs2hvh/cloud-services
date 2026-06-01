/**
 * Phase 7.C — Semantic cache.
 *
 * The exact-match L1 cache in lib/cache.ts hashes the normalized
 * request body — great for replays, useless for near-duplicates.
 * This module embeds the user's prompt and looks up any cached
 * response whose embedding is within `SIMILARITY_THRESHOLD` cosine
 * similarity AND in the same (org, model, temperature_bucket) scope
 * AND fresher than `TTL_SECONDS`.
 *
 * Strict guarantees:
 *   - ZDR keys never read or write the cache (privacy).
 *   - Stored values are the embedding + response + usage block.
 *     The original prompt text is NEVER persisted (privacy + GDPR).
 *   - Non-deterministic requests (temperature_bucket = 1.0+) get
 *     their own bucket so a temp=0 hit can't bleed into a temp=0.7
 *     caller's response.
 *
 * Latency budget:
 *   - Embed:  ~150ms via OpenRouter text-embedding-3-small
 *   - Lookup: ~50ms  via Supabase pgvector RPC
 *   - Total miss-overhead: ~200ms. Cache hit saves the upstream
 *     model call (typically 500ms-5s), so even moderate hit rates
 *     are net wins.
 */
import { createClient } from "@supabase/supabase-js";
import type { Env } from "../types.ts";

export const SIMILARITY_THRESHOLD = 0.95;
export const TTL_SECONDS = 3600; // 1 hour
const EMBED_MODEL = "openai/text-embedding-3-small";
const EMBED_DIM = 1536;
const EMBED_TIMEOUT_MS = 4000;

export interface SemanticCacheHit {
  responseBody: string;
  contentType: string;
  usage: { prompt_tokens?: number; completion_tokens?: number } | null;
  similarity: number;
  cachedAt: string;
}

export interface SemanticCacheLookupInput {
  env: Env;
  orgId: string;
  modelId: string;
  /** Request temperature; null → treat as 0 (deterministic default). */
  temperature: number | null | undefined;
  /** Plain-text representation of the user's prompt — typically the
   *  last user message's content concatenated. We embed this, not the
   *  full message history. */
  promptText: string;
  /** Upstream API key (OpenRouter platform key, or BYOK). The embed
   *  call goes to OpenRouter; cost is on whoever's billing applies. */
  upstreamKey: string;
  /** Optional per-org override for the cosine similarity threshold.
   *  Null/undefined → use SIMILARITY_THRESHOLD. Bracketed at call time
   *  to [0.50, 0.99] for safety even if a misconfigured value reaches
   *  here. */
  thresholdOverride?: number | null;
}

export interface SemanticCacheWriteInput {
  env: Env;
  orgId: string;
  modelId: string;
  temperature: number | null | undefined;
  promptText: string;
  upstreamKey: string;
  responseBody: string;
  contentType: string;
  usage: { prompt_tokens?: number; completion_tokens?: number } | null;
}

/**
 * Extract embeddable text from an OpenAI-style messages array. We use
 * only the LAST user message — small variations in system prompt or
 * conversation history shouldn't bust the cache, and embedding the
 * whole history rarely produces useful similarity hits.
 *
 * Returns null when no embeddable user text exists (tool-only turns,
 * empty content, etc.) — caller should skip semantic cache for those.
 */
export function extractEmbeddableText(
  messages: Array<{ role?: string; content?: unknown }>
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== "user") continue;
    if (typeof m.content === "string") {
      const trimmed = m.content.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    // OpenAI multi-modal content — collect all text parts.
    if (Array.isArray(m.content)) {
      const parts: string[] = [];
      for (const p of m.content) {
        if (p && typeof p === "object" && (p as { type?: string }).type === "text") {
          const t = (p as { text?: string }).text;
          if (typeof t === "string") parts.push(t);
        }
      }
      const joined = parts.join("\n").trim();
      return joined.length > 0 ? joined : null;
    }
  }
  return null;
}

/** Snap temperature to the nearest 0.1 so similar deterministic
 *  callers share a bucket. null/undefined → 0.0 (OpenAI default). */
export function temperatureBucket(t: number | null | undefined): number {
  if (t === null || t === undefined || !Number.isFinite(t)) return 0;
  return Math.round(Math.min(Math.max(t, 0), 2) * 10) / 10;
}

/**
 * POST to OpenRouter's embedding endpoint, return the 1536-dim vector.
 * Throws on non-2xx or shape mismatch — caller wraps in try/catch and
 * skips the cache on failure rather than blocking the request path.
 */
async function embedPrompt(env: Env, text: string, upstreamKey: string): Promise<number[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), EMBED_TIMEOUT_MS);
  try {
    const r = await fetch(`${env.OPENROUTER_BASE_URL}/embeddings`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${upstreamKey}`,
        "Content-Type": "application/json",
        "X-Title": "AhuraCloud Inference (semantic cache)",
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: text,
      }),
    });
    if (!r.ok) {
      throw new Error(`embed upstream ${r.status}`);
    }
    const data = (await r.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const v = data.data?.[0]?.embedding;
    if (!Array.isArray(v) || v.length !== EMBED_DIM) {
      throw new Error(`embed shape mismatch (len=${v?.length ?? "?"})`);
    }
    return v;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Look up the nearest cached response above SIMILARITY_THRESHOLD.
 * Returns null on miss, embed failure, or DB error — caller should
 * treat null as "skip cache, hit upstream".
 */
export async function lookupSemanticCache(
  input: SemanticCacheLookupInput
): Promise<SemanticCacheHit | null> {
  try {
    const embedding = await embedPrompt(input.env, input.promptText, input.upstreamKey);
    const supabase = createClient(
      input.env.SUPABASE_URL,
      input.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false },
        global: { headers: { "X-Client-Info": "ahura-inference-semantic-cache" } },
      }
    );
    // Clamp the optional override into a safe band before passing
    // to the RPC — gives the per-org tuning meaningful range while
    // preventing pathological values (e.g. 0.0) from effectively
    // returning every entry.
    const threshold =
      typeof input.thresholdOverride === "number" && Number.isFinite(input.thresholdOverride)
        ? Math.min(0.99, Math.max(0.5, input.thresholdOverride))
        : SIMILARITY_THRESHOLD;
    const rpcResult = await supabase
      .schema("inference")
      .rpc("lookup_semantic_cache", {
        p_org_id: input.orgId,
        p_model_id: input.modelId,
        p_temp_bucket: temperatureBucket(input.temperature),
        p_embedding: embedding,
        p_threshold: threshold,
        p_ttl_seconds: TTL_SECONDS,
      });
    if (rpcResult.error) {
      console.warn(
        JSON.stringify({
          level: "warn",
          scope: "semantic-cache",
          message: "rpc failed",
          err: rpcResult.error.message,
        })
      );
      return null;
    }
    // The RPC returns SETOF rows (array); supabase-js types it as a
    // union of array | single-object — cast through unknown to land on
    // the concrete array shape we expect.
    const rows = (rpcResult.data ?? []) as unknown as Array<{
      response_body: string;
      content_type: string;
      usage: { prompt_tokens?: number; completion_tokens?: number } | null;
      similarity: number;
      cached_at: string;
    }>;
    if (rows.length === 0) return null;
    const row = rows[0]!;
    return {
      responseBody: row.response_body,
      contentType: row.content_type,
      usage: row.usage,
      similarity: row.similarity,
      cachedAt: row.cached_at,
    };
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        scope: "semantic-cache",
        message: "lookup failed",
        err: err instanceof Error ? err.message : String(err),
      })
    );
    return null;
  }
}

/**
 * Write a new cache entry. Best-effort — never throws to the caller
 * since the actual response has already been served to the user.
 */
export async function writeSemanticCache(input: SemanticCacheWriteInput): Promise<void> {
  try {
    const embedding = await embedPrompt(input.env, input.promptText, input.upstreamKey);
    const supabase = createClient(
      input.env.SUPABASE_URL,
      input.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false },
        global: { headers: { "X-Client-Info": "ahura-inference-semantic-cache" } },
      }
    );
    const { error } = await supabase
      .schema("inference")
      .from("semantic_cache")
      .insert({
        org_id: input.orgId,
        model_id: input.modelId,
        temperature_bucket: temperatureBucket(input.temperature),
        embedding,
        response_body: input.responseBody,
        content_type: input.contentType,
        usage: input.usage,
      });
    if (error) {
      console.warn(
        JSON.stringify({
          level: "warn",
          scope: "semantic-cache",
          message: "insert failed",
          err: error.message,
        })
      );
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        scope: "semantic-cache",
        message: "write failed",
        err: err instanceof Error ? err.message : String(err),
      })
    );
  }
}
