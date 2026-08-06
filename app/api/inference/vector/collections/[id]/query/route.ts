/**
 * POST /api/inference/vector/collections/[id]/query
 *
 * Similarity search against a collection. Caller supplies either:
 *   • `embedding` (number[]) — pre-computed query vector
 *   • `text` (string)        — server auto-embeds via collection's model
 *
 * Body:
 *   {
 *     embedding?: number[],
 *     text?: string,
 *     top_k?: number (1-100, default 10),
 *     min_similarity?: number (0-1, default 0),
 *     filter?: object  — JSONB containment filter on row metadata, e.g.
 *                        { "tenant": "acme", "lang": "en" } returns only rows
 *                        whose metadata contains those pairs (multi-tenant RAG)
 *     mode?: "vector" | "hybrid" (default "vector") — hybrid fuses dense vector
 *            search with sparse full-text search via RRF (inference.hybrid_search,
 *            nextstespsAI/04-rag-data-platform.md). No behavior change for
 *            existing callers.
 *     full_text_weight?: number (0-10, default 1) — hybrid only, RRF bias toward
 *            exact/keyword matches.
 *     semantic_weight?: number (0-10, default 1) — hybrid only, RRF bias toward
 *            meaning. Equal defaults reproduce the previous behaviour exactly.
 *     rerank?: boolean (default false) — real cross-encoder rerank over an
 *            over-fetched candidate pool. Best-effort: a rerank failure falls
 *            back to the original order, never errors the request.
 *   }
 *
 * Returns top-k most similar rows ordered by similarity descending.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { resolveControlPlaneAuth } from "@/lib/inference/api-key-auth";
import { embedText } from "@/lib/inference/embeddings";
import { rerankCandidates } from "@/lib/inference/rerank";
import { customerSafeErrorMessage } from "@/lib/inference/error-messages";

const querySchema = z
  .object({
    embedding: z.array(z.number()).optional(),
    text: z.string().optional(),
    top_k: z.number().int().positive().max(100).default(10),
    min_similarity: z.number().min(0).max(1).default(0),
    // Optional JSONB containment filter on row metadata (multi-tenant RAG).
    filter: z.record(z.string(), z.unknown()).optional(),
    mode: z.enum(["vector", "hybrid"]).default("vector"),
    rerank: z.boolean().default(false),
    // RRF fusion weights, hybrid mode only. The SQL function has accepted these
    // since 20260720000001; they were simply never exposed. Bias toward exact
    // matches for a product-SKU corpus (full_text_weight > semantic_weight), or
    // toward meaning for a general FAQ. Defaults 1.0/1.0 = equal, which is the
    // behaviour every existing caller already gets.
    full_text_weight: z.number().min(0).max(10).default(1),
    semantic_weight: z.number().min(0).max(10).default(1),

  })
  .refine((d) => !!d.embedding || !!d.text, {
    message: "Must provide either `embedding` or `text`",
  });

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

interface SearchRow {
  id: string;
  external_id: string;
  content: string | null;
  metadata: Record<string, unknown>;
  similarity: number;
  // Present only when mode:"hybrid" (inference.hybrid_search's RRF fusion
  // score) — not part of the declared search_vectors row shape, so this is
  // undefined for plain vector-mode results.
  rrf_score?: number;
  // Present only when rerank:true and the rerank call succeeded — attached
  // by rerankCandidates.
  rerank_score?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await resolveControlPlaneAuth(
    request,
    async () => {
      const a = await authenticateUserFromHeader(request);
      return a.authenticated
        ? { ok: true as const, userId: a.user!.id, email: a.user!.email ?? "" }
        : { ok: false as const, response: a.response };
    },
    async (userId) => {
      const o = await getActiveOrgForUser(userId);
      return o ? { org_id: o.org_id, role: o.role, org_name: o.org_name, org_slug: o.org_slug } : null;
    }
  );
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid collection id" }, { status: 400 });

  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-vec-query",
    limit: 120,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const body = await request.json();
  const parsed = querySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const org = { org_id: auth.orgId, role: auth.orgRole };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: collection, error: cErr } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select("id, dimensions, distance_metric, embedding_model_id")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<{
      id: string;
      dimensions: number;
      distance_metric: string;
      embedding_model_id: string | null;
    }>();

  if (cErr || !collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  // Resolve query embedding
  let queryEmbedding = parsed.data.embedding;
  if (!queryEmbedding && parsed.data.text) {
    if (!collection.embedding_model_id) {
      return NextResponse.json(
        {
          error:
            "This is a bring-your-own-embeddings collection (no embedding model). Pass a pre-computed `embedding` array instead of `text`.",
        },
        { status: 400 }
      );
    }
    try {
      const result = await embedText(parsed.data.text, collection.embedding_model_id);
      queryEmbedding = result.embedding;
    } catch (err) {
      console.error("[Inference Vector] query auto-embed failed:", err);
      return NextResponse.json(
        {
          error: customerSafeErrorMessage(
            err instanceof Error ? err.message : "Auto-embed failed"
          ) || "Auto-embed failed. Try again, or pass a pre-computed `embedding` array.",
        },
        { status: 502 }
      );
    }
  }
  if (!queryEmbedding || queryEmbedding.length !== collection.dimensions) {
    return NextResponse.json(
      {
        error: `Query embedding must be ${collection.dimensions} dimensions; got ${
          queryEmbedding?.length ?? 0
        }`,
      },
      { status: 400 }
    );
  }

  // Reranking needs a wider candidate pool to reorder over — matches the
  // gateway's exact over-fetch reasoning (workers/inference's queryCollection).
  const fetchLimit = parsed.data.rerank ? Math.min(Math.max(parsed.data.top_k * 4, 20), 100) : parsed.data.top_k;

  const { data, error } =
    parsed.data.mode === "hybrid"
      ? await supabase.schema("inference").rpc("hybrid_search", {
          p_collection_id: collection.id,
          p_query_embedding: JSON.stringify(queryEmbedding),
          p_query_text: parsed.data.text ?? "",
          p_distance_metric: collection.distance_metric,
          p_limit: fetchLimit,
          p_min_similarity: parsed.data.min_similarity,
          p_full_text_weight: parsed.data.full_text_weight,
          p_semantic_weight: parsed.data.semantic_weight,
          ...(parsed.data.filter ? { p_metadata_filter: parsed.data.filter } : {}),
        })
      : await supabase.schema("inference").rpc("search_vectors", {
          p_collection_id: collection.id,
          // pgvector accepts JSON-stringified array
          p_query_embedding: JSON.stringify(queryEmbedding),
          p_distance_metric: collection.distance_metric,
          p_limit: fetchLimit,
          p_min_similarity: parsed.data.min_similarity,
          // Only pass the filter when present, so unfiltered queries still match
          // the pre-migration 5-arg function — safe to deploy before the migration
          // is applied; only the filter feature itself needs the new 6-arg version.
          ...(parsed.data.filter ? { p_metadata_filter: parsed.data.filter } : {}),
        });

  if (error) {
    console.error("[Inference Vector] query error:", error);
    return NextResponse.json(
      { error: "Vector search failed" },
      { status: 500 }
    );
  }

  // Supabase's generated RPC types are over-strict for SETOF RETURNS TABLE
  // functions; cast through unknown to the row shape we declared.
  let rows = (data as unknown as SearchRow[] | null) ?? [];
  if (parsed.data.rerank && parsed.data.text) {
    rows = await rerankCandidates(parsed.data.text, rows);
  }
  rows = rows.slice(0, parsed.data.top_k);

  return NextResponse.json({
    success: true,
    results: rows.map((r) => ({
      id: r.id,
      external_id: r.external_id,
      content: r.content,
      metadata: r.metadata,
      similarity: r.similarity,
      // The score that actually decided this row's position, when it differs
      // from raw vector similarity — found live, 2026-07-21: mode:"hybrid"
      // and rerank:true both reorder rows, but the response only ever
      // surfaced the pre-fusion/pre-rerank `similarity`, so a caller (or the
      // dashboard) had no visible signal that reordering had happened at all.
      ...(r.rrf_score !== undefined ? { rrf_score: r.rrf_score } : {}),
      ...(r.rerank_score !== undefined ? { rerank_score: r.rerank_score } : {}),
    })),
    count: rows.length,
  });
}
