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
 *   }
 *
 * Returns top-k most similar rows ordered by similarity descending.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { embedText } from "@/lib/inference/embeddings";
import { customerSafeErrorMessage } from "@/lib/inference/error-messages";

const querySchema = z
  .object({
    embedding: z.array(z.number()).optional(),
    text: z.string().optional(),
    top_k: z.number().int().positive().max(100).default(10),
    min_similarity: z.number().min(0).max(1).default(0),
    // Optional JSONB containment filter on row metadata (multi-tenant RAG).
    filter: z.record(z.string(), z.unknown()).optional(),
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
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid collection id" }, { status: 400 });

  const rl = await limitByUser(auth.user!.id, {
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

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });

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
      embedding_model_id: string;
    }>();

  if (cErr || !collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  // Resolve query embedding
  let queryEmbedding = parsed.data.embedding;
  if (!queryEmbedding && parsed.data.text) {
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

  const { data, error } = await supabase
    .schema("inference")
    .rpc("search_vectors", {
      p_collection_id: collection.id,
      // pgvector accepts JSON-stringified array
      p_query_embedding: JSON.stringify(queryEmbedding),
      p_distance_metric: collection.distance_metric,
      p_limit: parsed.data.top_k,
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
  const rows = (data as unknown as SearchRow[] | null) ?? [];

  return NextResponse.json({
    success: true,
    results: rows.map((r) => ({
      id: r.id,
      external_id: r.external_id,
      content: r.content,
      metadata: r.metadata,
      similarity: r.similarity,
    })),
    count: rows.length,
  });
}
