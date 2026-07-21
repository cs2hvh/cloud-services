/**
 * Server-side rerank helper for the vector store's dashboard query panel and
 * the /answer grounded-generation route — the Next.js-side counterpart to
 * workers/inference/src/lib/rag-rerank.ts. Same upstream, same model
 * (ahura/rerank-m3 -> cohere/rerank-v3.5), same best-effort discipline: on
 * any failure the caller gets its original candidate order back, never an
 * error — a rerank hiccup must never fail a search or answer request.
 */
import { createClient } from "@supabase/supabase-js";

const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const RERANK_MODEL_ID = "ahura/rerank-m3";

export interface RerankableCandidate {
  id: string;
  content: string | null;
}

interface RerankResponse {
  results?: Array<{ index: number; relevance_score: number }>;
}

async function resolveUpstreamModelId(): Promise<string | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data } = await supabase
    .schema("inference")
    .from("models")
    .select("upstream_model_id, is_active")
    .eq("model_id", RERANK_MODEL_ID)
    .maybeSingle<{ upstream_model_id: string | null; is_active: boolean }>();
  if (!data || !data.is_active || !data.upstream_model_id) return null;
  return data.upstream_model_id;
}

/** Reorders `candidates` by real cross-encoder relevance to `query`. Best-effort:
 *  any failure (model disabled, upstream error, timeout, missing platform key)
 *  returns the original order unchanged.
 *
 *  Attaches `rerank_score` to each returned row — found live, 2026-07-21: the
 *  callers only ever surfaced the pre-rerank `similarity`, so a caller could
 *  enable `rerank:true` and get correctly reordered rows back with no visible
 *  signal reordering happened at all (the displayed score didn't match the
 *  new order). Returning the actual score the reorder was based on closes
 *  that. */
export async function rerankCandidates<T extends RerankableCandidate>(
  query: string,
  candidates: T[]
): Promise<(T & { rerank_score?: number })[]> {
  const scorable = candidates.filter((c) => c.content && c.content.trim().length > 0);
  if (scorable.length < 2) return candidates;

  const key = process.env.OPENROUTER_PLATFORM_KEY;
  if (!key) return candidates;

  try {
    const upstreamModelId = await resolveUpstreamModelId();
    if (!upstreamModelId) return candidates;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(`${OPENROUTER_BASE}/rerank`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ahurasense.com",
          "X-Title": "AhuraCloud Inference (dashboard rerank)",
        },
        body: JSON.stringify({
          model: upstreamModelId,
          query,
          documents: scorable.map((c) => c.content as string),
          top_n: scorable.length,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return candidates;

    const parsed = (await res.json()) as RerankResponse;
    const results = parsed.results ?? [];
    if (results.length === 0) return candidates;

    const reordered = [...results]
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .map((r) => (scorable[r.index] ? { ...scorable[r.index], rerank_score: r.relevance_score } : undefined))
      .filter((c): c is T & { rerank_score: number } => c !== undefined);
    const unscored = candidates.filter((c) => !scorable.includes(c));
    return [...reordered, ...unscored];
  } catch {
    return candidates;
  }
}
