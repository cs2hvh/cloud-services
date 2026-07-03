/**
 * Hosted file_search tool (S2.1) — grounded RAG over the org's vector collections.
 *
 * Reuses the existing inference substrate directly (no cross-package import of the
 * Next RAG module): embed the query via the gateway, then the org-scoped
 * inference.search_vectors RPC. Returns a numbered citation envelope the model
 * can cite as [1], [2]. The collection is fixed by the agent's tool config — the
 * model only supplies the query, so it can't reach another collection.
 */
import type { AgentTool, RunCtx, ToolResult } from "@ahura/agent-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunnerEnv } from "../env.js";
import { embedText } from "../gateway.js";
import { preview } from "./detail.js";

export interface FileSearchDecl {
  type: "file_search";
  collection_id?: string;
  max_results?: number;
}

interface CollectionRow {
  id: string;
  org_id: string;
  dimensions: number;
  distance_metric: string;
  embedding_model_id: string | null;
}

interface VectorRow {
  content: string;
  external_id: string | null;
  metadata: { source?: string } | null;
  similarity: number;
}

const err = (message: string): ToolResult => ({
  output: { error: message },
  metering: { units: 0, unitLabel: "file_search" },
});

/**
 * Hybrid re-rank — ported from lib/ai/rag.ts `reRankChunks` (the Next module the
 * durable runner can't import, doc §6 AS-BUILT). Blends the vector similarity with
 * a keyword term-frequency boost (exact term hits) and a brevity bonus (shorter,
 * more focused passages), then sorts. Applied to an over-fetched candidate pool so
 * a strongly keyword-matching passage can surface above a marginally-closer vector
 * neighbour. Hardened vs the original: occurrences are counted with split() rather
 * than `new RegExp(term)`, which would let a query term inject a regex.
 */
export function reRank(rows: VectorRow[], query: string): VectorRow[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  return rows
    .map((r) => {
      const content = r.content.toLowerCase();
      let termScore = 0;
      for (const term of terms) termScore += (content.split(term).length - 1) * 0.1;
      const lengthBonus = 1 - r.content.length / 10_000;
      const adjusted = Math.min(r.similarity + termScore + lengthBonus * 0.05, 1.0);
      return { r, adjusted };
    })
    .sort((a, b) => b.adjusted - a.adjusted)
    .map((x) => x.r);
}

export function fileSearchTool(
  decl: FileSearchDecl,
  env: RunnerEnv,
  supabase: SupabaseClient
): AgentTool {
  return {
    type: "file_search",
    async run(args: unknown, ctx: RunCtx): Promise<ToolResult> {
      const a = (args ?? {}) as { query?: unknown; max_results?: unknown };
      const query = typeof a.query === "string" ? a.query : String(a.query ?? "");
      const topK = Math.min(Math.max(Number(a.max_results ?? decl.max_results ?? 5) || 5, 1), 20);

      if (!decl.collection_id) return err("file_search has no knowledge base configured on this agent");
      if (!query.trim()) return err("file_search requires a non-empty query");

      // Load the collection, org-scoped so a run can only read its own org's KB.
      const { data: col } = await supabase
        .schema("inference")
        .from("vector_collections")
        .select("id, org_id, dimensions, distance_metric, embedding_model_id")
        .eq("id", decl.collection_id)
        .eq("org_id", ctx.orgId)
        .maybeSingle<CollectionRow>();
      if (!col) return err("knowledge base not found");
      if (!col.embedding_model_id) {
        return err("this knowledge base uses bring-your-own embeddings and can't be auto-searched");
      }

      try {
        const { embedding, tokens } = await embedText(env, col.embedding_model_id, query);
        if (embedding.length !== col.dimensions) return err("query embedding dimension mismatch");

        // Over-fetch a candidate pool so the hybrid re-rank has room to reorder
        // (re-ranking only the final top-K would barely change anything).
        const candidateLimit = Math.min(Math.max(topK * 4, 20), 50);
        const { data, error } = await supabase.schema("inference").rpc("search_vectors", {
          p_collection_id: col.id,
          p_query_embedding: JSON.stringify(embedding), // pgvector accepts a JSON-stringified array
          p_distance_metric: col.distance_metric,
          p_limit: candidateLimit,
          p_min_similarity: 0,
        });
        if (error) throw new Error(error.message);

        const rows = (data as unknown as VectorRow[] | null) ?? [];
        const ranked = reRank(rows, query).slice(0, topK);
        const results = ranked.map((r, i) => ({
          index: i + 1,
          content: r.content,
          source: r.metadata?.source ?? r.external_id ?? null,
          // Report the honest vector similarity; re-rank affects ORDER, not this score.
          score: Number(Number(r.similarity).toFixed(4)),
        }));
        return {
          output: { query, results },
          metering: { units: 1, unitLabel: "file_search" },
          // Trace preview: the query + a few retrieved snippets (capped/scrubbed).
          detail: {
            query,
            snippets: results.slice(0, 3).map((r) => ({ source: r.source, text: preview(r.content, 240) })),
            count: results.length,
            candidates: rows.length,
            embed_tokens: tokens,
          },
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { output: { error: `file search failed: ${msg}` }, metering: { units: 0, unitLabel: "file_search" } };
      }
    },
  };
}
