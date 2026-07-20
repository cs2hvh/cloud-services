/**
 * Shared rerank-candidates helper for the RAG data-platform slice
 * (nextstespsAI/04-rag-data-platform.md) — used by both
 * `queryCollection`'s `rerank:true` option and the `/answer` grounded-
 * generation endpoint, so the forward+bill logic exists in exactly one
 * place (the split-duplication `route-helpers.ts` was extracted to avoid
 * elsewhere in this same file family).
 *
 * Calls the already-live `ahura/rerank-m3` model via the internal
 * `/rerank` upstream path (same `forwardJson` primitive `routes/rerank.ts`
 * uses for the customer-facing route) — this is an in-process compose
 * call, not a self-HTTP round trip (no SELF binding exists on this
 * Worker), matching the established pattern (`embedText` in this same
 * file family, `rerank.ts` itself).
 */
import type { AuthContext, Env } from "../types.ts";
import { buildBaseEvent, enqueueUsage, resolveRouting } from "./gateway.ts";
import { forwardJson, resolveUpstreamKey } from "./openrouter.ts";

const RERANK_MODEL_ID = "ahura/rerank-m3";

export interface RerankableCandidate {
  id: string;
  content: string | null;
}

interface RerankResponse {
  results?: Array<{ index: number; relevance_score: number }>;
}

/**
 * Reorders `candidates` by real cross-encoder relevance to `query`. Rows
 * with no `content` can't be scored and are pushed to the end, stable
 * order preserved. Best-effort: on any failure (model unavailable,
 * upstream error, timeout) the ORIGINAL order is returned unchanged —
 * a rerank failure must never fail the caller's search/answer request,
 * same discipline as every other best-effort dependency in this gateway.
 */
export async function rerankCandidates<T extends RerankableCandidate>(
  env: Env,
  auth: AuthContext,
  requestId: string,
  query: string,
  candidates: T[],
): Promise<T[]> {
  const scorable = candidates.filter((c) => c.content && c.content.trim().length > 0);
  if (scorable.length < 2) return candidates;

  try {
    const routing = await resolveRouting(env, RERANK_MODEL_ID, requestId);
    if (!routing.ok) return candidates;
    const upstreamKey = await resolveUpstreamKey(env, "platform", auth.orgId, undefined);

    const upstream = await forwardJson({
      env,
      upstreamKey,
      path: "/rerank",
      body: {
        model: routing.upstreamModelId,
        query,
        documents: scorable.map((c) => c.content as string),
        top_n: scorable.length,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!upstream.ok) return candidates;
    const parsed = (await upstream.json()) as RerankResponse;
    const results = parsed.results ?? [];
    if (results.length === 0) return candidates;

    void enqueueUsage(
      env,
      buildBaseEvent(auth, RERANK_MODEL_ID, "rerank", requestId, Date.now(), {
        numUnits: scorable.length,
        unitLabel: "rerank_unit",
      }),
    );

    const reordered = [...results]
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .map((r) => scorable[r.index])
      .filter((c): c is T => c !== undefined);
    const unscored = candidates.filter((c) => !scorable.includes(c));
    return [...reordered, ...unscored];
  } catch {
    return candidates; // best-effort — never fail the caller over a rerank hiccup
  }
}
