/**
 * Knowledge-base (vector collection) API — list/get an existing collection,
 * query it, upsert rows into it, and list/delete its rows, all by API key.
 * Counterpart to app/api/inference/vector/collections/* (dashboard-session-
 * only) for the parts that are a safe, mechanical port.
 *
 * Scope, deliberately narrower than the dashboard version — two operations
 * are NOT ported here, each for a distinct, real reason (not oversight):
 *
 *   - POST /collections (CREATE) and DELETE /collections/:id are NOT here.
 *     Creating a collection starts a recurring monthly credit meter
 *     (config/billing-flow.ts's reserveProvision/settleProvision — an
 *     atomic credit-ledger debit + hold, with rollback on failure);
 *     deleting one closes it (closeActiveBilling). That logic is the
 *     platform's core billing/credit system, shared across every metered
 *     service (databases, kubernetes, compute, …), and lives in Next.js-
 *     only modules this Worker — a separate deployable — can't import.
 *     Duplicating live credit-reservation logic into a second codebase is a
 *     real risk (a bug there means double-charging or double-crediting a
 *     customer), not a routine port. Needs its own decision: duplicate,
 *     proxy through an internal Next.js endpoint, or leave dashboard-only.
 *     A collection can still be fully USED via API once it exists — query/
 *     upsert/rows below — only creating/deleting the collection itself
 *     needs the dashboard for now.
 *
 *   - ingest-url / ingest-file are NOT here either. ingest-url's SSRF guard
 *     (lib/inference/url-ingest.ts) pins the outbound TCP connection to a
 *     pre-resolved IP via undici + node:dns/node:net — a technique with no
 *     Workers equivalent (Workers' fetch() has no socket-level control, and
 *     has a different threat model besides — it can't reach RFC1918/
 *     loopback addresses at all, unlike the Node server this guard was
 *     built for). ingest-file depends on `mammoth` (DOCX parsing), a
 *     Node-native library of unverified Workers-runtime compatibility.
 *     Porting either safely is real, separate work — not a copy-paste.
 *     Rows can still be added via `upsert` below with pre-computed or
 *     server-auto-embedded `content` — just not sourced from a URL/file
 *     upload through this API yet.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Handler } from "hono";
import { z } from "zod";
import type { Env, HonoVariables } from "../types.ts";
import { buildBaseEvent, enqueueUsage, gatewayError } from "../lib/gateway.ts";
import { isValidUuid } from "../lib/on-behalf-of.ts";
import { makeSupabase, enqueueAudit, readJson } from "../lib/route-helpers.ts";
import { rerankCandidates } from "../lib/rag-rerank.ts";

/** Ceiling for an org with no explicit override — mirrors DEFAULT_VECTOR_QUOTA
 *  in lib/inference/vector-quota.ts. Since 2026-08-04 an org can carry its own
 *  `orgs.vector_quota`; this is only the fallback. */
const DEFAULT_VECTOR_QUOTA = 1_000_000;

/** Server-side auto-embed via OpenRouter (platform key) — Workers-native
 *  port of lib/inference/embeddings.ts's embedText: same upstream, same
 *  request shape, just fetch() instead of Node's global fetch shim. */
export async function embedText(env: Env, text: string, modelId: string): Promise<{ embedding: number[]; inputTokens: number | null }> {
  const r = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_PLATFORM_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ahurasense.com",
      "X-Title": "AhuraCloud Inference (vector autoembed)",
    },
    body: JSON.stringify({ model: modelId, input: text }),
  });
  if (!r.ok) {
    throw new Error(`Upstream embed failed (${r.status}): ${await r.text()}`);
  }
  const data = (await r.json()) as { data?: Array<{ embedding?: number[] }>; usage?: { prompt_tokens?: number } };
  const embedding = data.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) throw new Error("Upstream returned no embedding");
  return { embedding, inputTokens: data.usage?.prompt_tokens ?? null };
}

/** Per-org vector storage cap, checked before embedding so a batch that
 *  would blow the quota fails fast without spending on embed calls. Mirrors
 *  lib/inference/vector-quota.ts (pure DB read + comparison, no billing
 *  system involved — safe to duplicate, unlike the reservation flow above). */
async function checkVectorQuota(supabase: SupabaseClient, orgId: string, incomingRowCount: number): Promise<string | null> {
  const [collections, org] = await Promise.all([
    supabase.schema("inference").from("vector_collections").select("row_count").eq("org_id", orgId),
    supabase.schema("inference").from("orgs").select("vector_quota").eq("id", orgId).maybeSingle(),
  ]);
  // Any doubt about the override — missing row, unreadable column, nonsense
  // value — falls back to the default. Refusing writes because the QUOTA
  // lookup failed would turn a DB hiccup into apparent data loss.
  //
  // NULL IS CHECKED BEFORE COERCION, deliberately: `Number(null)` is 0, not NaN,
  // so coercing first turned "no override" — the normal case for every org —
  // into a quota of ZERO, which would have refused every vector write on the
  // platform. Caught by live testing 2026-08-04, not by any unit test.
  const raw = (org.data as { vector_quota: number | null } | null)?.vector_quota;
  const override = raw === null || raw === undefined ? NaN : Number(raw);
  const quota = Number.isFinite(override) && override >= 0 ? override : DEFAULT_VECTOR_QUOTA;
  const current = (collections.data ?? []).reduce((sum, c) => sum + (Number((c as { row_count: number | null }).row_count) || 0), 0);
  if (current + incomingRowCount > quota) {
    return `Vector storage limit reached (${quota.toLocaleString()} vectors per org). Delete unused vectors, or contact support to raise your limit.`;
  }
  return null;
}

interface CollectionRow {
  id: string;
  name: string;
  description: string | null;
  dimensions: number;
  distance_metric: string;
  embedding_model_id: string | null;
  index_type: string;
  index_params: Record<string, unknown>;
  row_count: number;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}

const COLLECTION_SELECT_COLS =
  "id, name, description, dimensions, distance_metric, embedding_model_id, index_type, index_params, row_count, size_bytes, created_at, updated_at";

export async function fetchCollection<T extends { id: string; dimensions: number; embedding_model_id: string | null } = { id: string; dimensions: number; embedding_model_id: string | null }>(
  supabase: SupabaseClient,
  orgId: string,
  id: string,
  cols = "id, dimensions, embedding_model_id"
): Promise<T | null> {
  const { data } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select(cols)
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle<T>();
  return data ?? null;
}

// ── Collections ──────────────────────────────────────────────────────────────

// GET /v1/vector/collections
export const listCollections: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const supabase = makeSupabase(c.env);

  const { data, error } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select(COLLECTION_SELECT_COLS)
    .eq("org_id", auth.orgId)
    .order("created_at", { ascending: false })
    .returns<CollectionRow[]>();

  if (error) {
    return c.json(gatewayError("Failed to list collections", "server_error", "collections_list_failed", requestId), 500);
  }
  return c.json({ object: "list" as const, data: (data ?? []).map((d) => ({ object: "vector_collection" as const, ...d })) });
};

// GET /v1/vector/collections/:id
export const getCollection: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id || !isValidUuid(id)) {
    return c.json(gatewayError("Invalid collection id", "invalid_request_error", "invalid_request", requestId), 400);
  }
  const supabase = makeSupabase(c.env);

  const { data } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select(COLLECTION_SELECT_COLS)
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .maybeSingle<CollectionRow>();

  if (!data) {
    return c.json(gatewayError("Collection not found in this org", "invalid_request_error", "collection_not_found", requestId), 404);
  }
  return c.json({ object: "vector_collection" as const, ...data });
};

// ── Query ────────────────────────────────────────────────────────────────────

export const querySchema = z
  .object({
    embedding: z.array(z.number()).optional(),
    text: z.string().optional(),
    top_k: z.number().int().positive().max(100).default(10),
    min_similarity: z.number().min(0).max(1).default(0),
    filter: z.record(z.string(), z.unknown()).optional(),
    // nextstespsAI/04-rag-data-platform.md — hybrid = dense vector + sparse
    // full-text (BM25-style) fused via RRF (inference.hybrid_search RPC,
    // migration 20260720000001). Falls back to pure-vector fusion when no
    // `text` is given (nothing to full-text-match against).
    mode: z.enum(["vector", "hybrid"]).default("vector"),
    // Real cross-encoder rerank (ahura/rerank-m3) over an over-fetched
    // candidate pool, same pattern as the agent file_search tool. Optional
    // and best-effort — see lib/rag-rerank.ts.
    rerank: z.boolean().default(false),
  })
  .refine((d) => !!d.embedding || !!d.text, { message: "Must provide either `embedding` or `text`" });

interface SearchRow {
  id: string;
  external_id: string;
  content: string | null;
  metadata: Record<string, unknown>;
  similarity: number;
  // Present only when mode:"hybrid" (inference.hybrid_search's RRF fusion
  // score) — undefined for plain vector-mode (search_vectors) results.
  rrf_score?: number;
  // Present only when rerank:true and the rerank call succeeded — attached
  // by rerankCandidates (rag-rerank.ts).
  rerank_score?: number;
}

// POST /v1/vector/collections/:id/query
export const queryCollection: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const startedAt = Date.now();
  const id = c.req.param("id");
  if (!id || !isValidUuid(id)) {
    return c.json(gatewayError("Invalid collection id", "invalid_request_error", "invalid_request", requestId), 400);
  }

  const raw = await readJson(c);
  if (raw === undefined) {
    return c.json(gatewayError("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      gatewayError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), "invalid_request_error", "invalid_request", requestId),
      400
    );
  }

  const supabase = makeSupabase(c.env);
  const collection = await fetchCollection<{ id: string; dimensions: number; embedding_model_id: string | null; distance_metric: string }>(
    supabase,
    auth.orgId,
    id,
    "id, dimensions, distance_metric, embedding_model_id"
  );
  if (!collection) {
    return c.json(gatewayError("Collection not found", "invalid_request_error", "collection_not_found", requestId), 404);
  }

  let queryEmbedding = parsed.data.embedding;
  if (!queryEmbedding && parsed.data.text) {
    if (!collection.embedding_model_id) {
      return c.json(
        gatewayError(
          "This is a bring-your-own-embeddings collection (no embedding model). Pass a pre-computed `embedding` array instead of `text`.",
          "invalid_request_error",
          "byo_embeddings_collection",
          requestId
        ),
        400
      );
    }
    try {
      const embedResult = await embedText(c.env, parsed.data.text, collection.embedding_model_id);
      queryEmbedding = embedResult.embedding;
      // Was silently unbilled before this slice (nextstespsAI/04-rag-data-
      // platform.md, 2026-07-20) — every auto-embed call here hits a real,
      // metered upstream (OpenRouter) regardless of whether the customer is
      // ever charged for it. Bill it like any other embedding call.
      void enqueueUsage(
        c.env,
        buildBaseEvent(auth, collection.embedding_model_id, "embedding", requestId, startedAt, {
          inputTokens: embedResult.inputTokens,
          outputTokens: 0,
          numUnits: 1,
          unitLabel: "embedding",
        }),
      );
    } catch {
      return c.json(gatewayError("Auto-embed failed. Try again, or pass a pre-computed `embedding` array.", "server_error", "embed_failed", requestId), 502);
    }
  }
  if (!queryEmbedding || queryEmbedding.length !== collection.dimensions) {
    return c.json(
      gatewayError(`Query embedding must be ${collection.dimensions} dimensions; got ${queryEmbedding?.length ?? 0}`, "invalid_request_error", "dimension_mismatch", requestId),
      400
    );
  }

  // Reranking needs a wider candidate pool to reorder over — re-ranking only
  // the final top_k would barely change anything (same reasoning as the
  // agent file_search tool's over-fetch).
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
          ...(parsed.data.filter ? { p_metadata_filter: parsed.data.filter } : {}),
        })
      : await supabase.schema("inference").rpc("search_vectors", {
          p_collection_id: collection.id,
          p_query_embedding: JSON.stringify(queryEmbedding),
          p_distance_metric: collection.distance_metric,
          p_limit: fetchLimit,
          p_min_similarity: parsed.data.min_similarity,
          ...(parsed.data.filter ? { p_metadata_filter: parsed.data.filter } : {}),
        });

  if (error) {
    return c.json(gatewayError("Vector search failed", "server_error", "vector_search_failed", requestId), 500);
  }
  let rows = (data as unknown as SearchRow[] | null) ?? [];
  if (parsed.data.rerank && parsed.data.text) {
    rows = await rerankCandidates(c.env, auth, requestId, parsed.data.text, rows);
  }
  rows = rows.slice(0, parsed.data.top_k);
  return c.json({
    object: "list" as const,
    // rrf_score/rerank_score surface the score that actually decided a row's
    // position when it differs from raw vector similarity — found live,
    // 2026-07-21: mode:"hybrid"/rerank:true reorder rows but the response
    // used to only ever return the pre-fusion/pre-rerank `similarity`.
    data: rows.map((r) => ({
      id: r.id, external_id: r.external_id, content: r.content, metadata: r.metadata, similarity: r.similarity,
      ...(r.rrf_score !== undefined ? { rrf_score: r.rrf_score } : {}),
      ...(r.rerank_score !== undefined ? { rerank_score: r.rerank_score } : {}),
    })),
  });
};

// ── Upsert ───────────────────────────────────────────────────────────────────

export const upsertSchema = z.object({
  rows: z
    .array(
      z.object({
        external_id: z.string().min(1).max(200),
        content: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        embedding: z.array(z.number()).optional(),
      })
    )
    .min(1)
    .max(100),
});

// POST /v1/vector/collections/:id/upsert
export const upsertRows: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id || !isValidUuid(id)) {
    return c.json(gatewayError("Invalid collection id", "invalid_request_error", "invalid_request", requestId), 400);
  }

  const raw = await readJson(c);
  if (raw === undefined) {
    return c.json(gatewayError("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }
  const parsed = upsertSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      gatewayError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), "invalid_request_error", "invalid_request", requestId),
      400
    );
  }

  const supabase = makeSupabase(c.env);
  const collection = await fetchCollection(supabase, auth.orgId, id);
  if (!collection) {
    return c.json(gatewayError("Collection not found", "invalid_request_error", "collection_not_found", requestId), 404);
  }

  const quotaError = await checkVectorQuota(supabase, auth.orgId, parsed.data.rows.length);
  if (quotaError) {
    return c.json(gatewayError(quotaError, "invalid_request_error", "vector_quota_exceeded", requestId), 403);
  }

  const resolved: Array<{ external_id: string; content: string | null; metadata: Record<string, unknown>; embedding: number[] }> = [];
  for (const r of parsed.data.rows) {
    let embedding = r.embedding;
    if (!embedding) {
      if (!collection.embedding_model_id) {
        return c.json(
          gatewayError(
            `This is a bring-your-own-embeddings collection (no embedding model). Provide a pre-computed \`embedding\` array for row "${r.external_id}".`,
            "invalid_request_error",
            "byo_embeddings_collection",
            requestId
          ),
          400
        );
      }
      if (!r.content) {
        return c.json(gatewayError(`Row "${r.external_id}" must provide either \`embedding\` or \`content\``, "invalid_request_error", "invalid_request", requestId), 400);
      }
      try {
        embedding = (await embedText(c.env, r.content, collection.embedding_model_id)).embedding;
      } catch {
        return c.json(gatewayError("Auto-embed failed. Try again, or pass a pre-computed `embedding` array.", "server_error", "embed_failed", requestId), 502);
      }
    }
    if (embedding.length !== collection.dimensions) {
      return c.json(
        gatewayError(`Row "${r.external_id}" has ${embedding.length} dims, collection expects ${collection.dimensions}`, "invalid_request_error", "dimension_mismatch", requestId),
        400
      );
    }
    resolved.push({ external_id: r.external_id, content: r.content ?? null, metadata: r.metadata ?? {}, embedding });
  }

  const { data: inserted, error } = await supabase
    .schema("inference")
    .from("vector_rows")
    .upsert(
      resolved.map((r) => ({ collection_id: collection.id, external_id: r.external_id, content: r.content, metadata: r.metadata, embedding: JSON.stringify(r.embedding) })),
      { onConflict: "collection_id,external_id" }
    )
    .select("id, external_id");

  if (error) {
    return c.json(gatewayError("Failed to upsert rows", "server_error", "vector_upsert_failed", requestId), 500);
  }
  return c.json({ upserted: inserted?.length ?? 0, rows: inserted ?? [] });
};

// ── Rows ─────────────────────────────────────────────────────────────────────

// GET /v1/vector/collections/:id/rows?limit=&offset=&q=
export const listRows: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id || !isValidUuid(id)) {
    return c.json(gatewayError("Invalid collection id", "invalid_request_error", "invalid_request", requestId), 400);
  }
  const limit = Math.min(200, Math.max(1, Number.parseInt(c.req.query("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, Number.parseInt(c.req.query("offset") ?? "0", 10) || 0);
  const q = c.req.query("q")?.trim() ?? "";

  const supabase = makeSupabase(c.env);
  const { data: collection } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select("id, row_count")
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .maybeSingle<{ id: string; row_count: number }>();
  if (!collection) {
    return c.json(gatewayError("Collection not found", "invalid_request_error", "collection_not_found", requestId), 404);
  }

  let query = supabase
    .schema("inference")
    .from("vector_rows")
    .select("id, external_id, content, metadata, created_at, updated_at", { count: "exact" })
    .eq("collection_id", collection.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (q) query = query.ilike("external_id", `%${q}%`);

  const { data, error, count } = await query;
  if (error) {
    return c.json(gatewayError("Failed to list rows", "server_error", "vector_rows_list_failed", requestId), 500);
  }
  return c.json({
    object: "list" as const,
    data: (data ?? []).map((r) => ({ ...r, content: r.content ? (r.content.length > 240 ? r.content.slice(0, 240) + "…" : r.content) : null })),
    total: count ?? collection.row_count,
    limit,
    offset,
  });
};

export const bulkDeleteRowsSchema = z.object({
  external_ids: z.array(z.string().min(1).max(200)).min(1).max(500),
});

// DELETE /v1/vector/collections/:id/rows — bulk delete by external_id
export const bulkDeleteRows: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  if (!id || !isValidUuid(id)) {
    return c.json(gatewayError("Invalid collection id", "invalid_request_error", "invalid_request", requestId), 400);
  }

  const raw = await readJson(c);
  if (raw === undefined) {
    return c.json(gatewayError("Invalid JSON body", "invalid_request_error", "invalid_json", requestId), 400);
  }
  const parsed = bulkDeleteRowsSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      gatewayError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), "invalid_request_error", "invalid_request", requestId),
      400
    );
  }

  const supabase = makeSupabase(c.env);
  const { data: collection } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select("id, name")
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .maybeSingle<{ id: string; name: string }>();
  if (!collection) {
    return c.json(gatewayError("Collection not found", "invalid_request_error", "collection_not_found", requestId), 404);
  }

  const { error, count } = await supabase
    .schema("inference")
    .from("vector_rows")
    .delete({ count: "exact" })
    .eq("collection_id", collection.id)
    .in("external_id", parsed.data.external_ids);

  if (error) {
    return c.json(gatewayError("Failed to delete rows", "server_error", "vector_rows_delete_failed", requestId), 500);
  }

  enqueueAudit(c, {
    action: "vector_rows.deleted",
    targetType: "vector_collection",
    targetId: collection.id,
    metadata: { collection_name: collection.name, deleted: count ?? 0, requested: parsed.data.external_ids.length },
  });
  return c.json({ deleted: count ?? 0 });
};

// GET /v1/vector/collections/:id/rows/:rowId — full row including embedding
export const getRow: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  const rowId = c.req.param("rowId");
  if (!id || !isValidUuid(id) || !rowId || !isValidUuid(rowId)) {
    return c.json(gatewayError("Invalid id", "invalid_request_error", "invalid_request", requestId), 400);
  }
  const supabase = makeSupabase(c.env);

  const { data: collection } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select("id")
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .maybeSingle<{ id: string }>();
  if (!collection) {
    return c.json(gatewayError("Collection not found", "invalid_request_error", "collection_not_found", requestId), 404);
  }

  const { data } = await supabase
    .schema("inference")
    .from("vector_rows")
    .select("id, external_id, content, metadata, embedding, created_at, updated_at")
    .eq("id", rowId)
    .eq("collection_id", collection.id)
    .maybeSingle();

  if (!data) {
    return c.json(gatewayError("Row not found", "invalid_request_error", "vector_row_not_found", requestId), 404);
  }
  return c.json({ object: "vector_row" as const, ...data });
};

// DELETE /v1/vector/collections/:id/rows/:rowId — single-row delete
export const deleteRow: Handler<{ Bindings: Env; Variables: HonoVariables }> = async (c) => {
  const auth = c.get("auth");
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  const rowId = c.req.param("rowId");
  if (!id || !isValidUuid(id) || !rowId || !isValidUuid(rowId)) {
    return c.json(gatewayError("Invalid id", "invalid_request_error", "invalid_request", requestId), 400);
  }
  const supabase = makeSupabase(c.env);

  const { data: collection } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select("id, name")
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .maybeSingle<{ id: string; name: string }>();
  if (!collection) {
    return c.json(gatewayError("Collection not found", "invalid_request_error", "collection_not_found", requestId), 404);
  }

  // Fetch external_id for the audit trail before deleting.
  const { data: existing } = await supabase
    .schema("inference")
    .from("vector_rows")
    .select("external_id")
    .eq("id", rowId)
    .eq("collection_id", collection.id)
    .maybeSingle<{ external_id: string }>();

  const { error, count } = await supabase
    .schema("inference")
    .from("vector_rows")
    .delete({ count: "exact" })
    .eq("id", rowId)
    .eq("collection_id", collection.id);

  if (error) {
    return c.json(gatewayError("Failed to delete row", "server_error", "vector_row_delete_failed", requestId), 500);
  }
  if (!count) {
    return c.json(gatewayError("Row not found", "invalid_request_error", "vector_row_not_found", requestId), 404);
  }

  enqueueAudit(c, {
    action: "vector_row.deleted",
    targetType: "vector_row",
    targetId: rowId,
    metadata: { collection_name: collection.name, external_id: existing?.external_id },
  });
  return c.json({ id: rowId, object: "vector_row" as const, deleted: true });
};
