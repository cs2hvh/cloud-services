import { recordAudit } from "@/lib/inference/audit";
import { createServiceClient } from "@/lib/supabase/server";
import { embedText } from "@/lib/inference/embeddings";
import { customerSafeErrorMessage } from "@/lib/inference/error-messages";
import { ensureBalance, postProvisionBilling, closeActiveBilling } from "@/config/billing-flow";
import { BillingCredits } from "@/lib/billing/credits";

type SR<T> = { success: true; data: T } | { success: false; error: string; status?: number; code?: string };

interface SearchRow {
  id: string;
  external_id: string;
  content: string | null;
  metadata: Record<string, unknown>;
  similarity: number;
}

const VECTOR_COLLECTION_MONTHLY_USD = 8;
const VECTOR_COLLECTION_HOURLY_USD = VECTOR_COLLECTION_MONTHLY_USD / 720;
const MIN_VECTOR_BALANCE_USD = 1;
const MAX_VECTORS_PER_ORG = 1_000_000;

export interface CreateCollectionInput {
  name: string;
  description?: string | null;
  dimensions?: number;
  distance_metric?: "cosine" | "l2" | "inner_product";
  embedding_model_id?: string | null;
  index_type?: "hnsw" | "ivfflat" | "none";
  index_params?: Record<string, string | number | boolean>;
}

export const InferenceVectorService = {
  async list(orgId: string): Promise<SR<unknown[]>> {
    const db = await createServiceClient();
    const { data, error } = await db
      .schema("inference")
      .from("vector_collections")
      .select("id, name, description, dimensions, distance_metric, embedding_model_id, index_type, index_params, row_count, size_bytes, created_at, updated_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) return { success: false, error: "Failed to list collections" };
    return { success: true, data: data ?? [] };
  },

  async get(orgId: string, id: string): Promise<SR<unknown>> {
    const db = await createServiceClient();
    const { data, error } = await db.schema("inference").from("vector_collections").select("*").eq("id", id).eq("org_id", orgId).maybeSingle();
    if (error || !data) return { success: false, error: "Collection not found in this org", status: 404 };
    return { success: true, data };
  },

  async create(orgId: string, userId: string, input: CreateCollectionInput, audit: { ipAddress: string | null; userAgent: string | null }): Promise<SR<unknown>> {
    const db = await createServiceClient();

    // Resolve effective dimensions
    let effectiveDimensions: number;
    if (input.embedding_model_id) {
      const { data: modelRow } = await db.schema("inference").from("models").select("modality, capabilities").eq("model_id", input.embedding_model_id).eq("is_active", true).maybeSingle<{ modality: string; capabilities: { dimensions?: number } | null }>();
      if (!modelRow) return { success: false, error: `Embedding model "${input.embedding_model_id}" not found in catalog.`, status: 400 };
      if (modelRow.modality !== "embedding") return { success: false, error: `"${input.embedding_model_id}" has modality "${modelRow.modality}" — must be "embedding".`, status: 400 };
      if (!modelRow.capabilities?.dimensions) return { success: false, error: `Embedding model "${input.embedding_model_id}" has no declared dimensions in the catalog.`, status: 400 };
      effectiveDimensions = modelRow.capabilities.dimensions;
    } else {
      if (!input.dimensions) return { success: false, error: "`dimensions` is required for a bring-your-own-embeddings collection.", status: 400 };
      effectiveDimensions = input.dimensions;
    }

    // Billing: resolve payer + balance gate
    const { data: orgRow } = await db.schema("inference").from("orgs").select("billing_user_id, owner_user_id").eq("id", orgId).maybeSingle<{ billing_user_id: string | null; owner_user_id: string | null }>();
    const payerUserId = orgRow?.billing_user_id || orgRow?.owner_user_id || userId;
    const bal = await ensureBalance(payerUserId, MIN_VECTOR_BALANCE_USD);
    if (!bal.ok) return { success: false, error: `A managed vector collection is $${VECTOR_COLLECTION_MONTHLY_USD}/month. Add at least $${MIN_VECTOR_BALANCE_USD} in credits to create one.`, code: "insufficient_credits", status: 402 };

    const { data, error } = await db.schema("inference").from("vector_collections").insert({
      org_id: orgId, name: input.name, description: input.description ?? null,
      dimensions: effectiveDimensions, distance_metric: input.distance_metric ?? "cosine",
      embedding_model_id: input.embedding_model_id ?? null,
      index_type: input.index_type ?? "hnsw",
      index_params: input.index_params ?? { m: 16, ef_construction: 64 },
    }).select("id, name, dimensions, distance_metric, embedding_model_id, created_at").single();

    if (error) {
      if (error.code === "23505") return { success: false, error: `A collection named "${input.name}" already exists in this org`, status: 409 };
      return { success: false, error: "Failed to create collection" };
    }

    void recordAudit({ orgId, actorUserId: userId, action: "collection.created", targetType: "vector_collection", targetId: data.id, metadata: { name: data.name, dimensions: data.dimensions, embedding_model_id: data.embedding_model_id }, ...audit });

    // Register in metered billing — rollback on failure
    try {
      await postProvisionBilling({ userId: payerUserId, initialCost: 0, hourlyRate: VECTOR_COLLECTION_HOURLY_USD, serviceId: data.id, serviceType: "inference_vector", addActive: BillingCredits.addActiveVectorCollection });
    } catch (billingErr) {
      console.error("[InferenceVectorService.create] billing wire-up failed, rolling back:", billingErr);
      await db.schema("inference").from("vector_collections").delete().eq("id", data.id);
      return { success: false, error: "Could not set up billing for the collection. Please try again." };
    }

    return { success: true, data };
  },

  async delete(orgId: string, id: string, userId: string, audit: { ipAddress: string | null; userAgent: string | null }): Promise<SR<{ deleted_id: string }>> {
    const db = await createServiceClient();
    const { data: existing } = await db.schema("inference").from("vector_collections").select("id, name").eq("id", id).eq("org_id", orgId).maybeSingle<{ id: string; name: string }>();

    const { error, count } = await db.schema("inference").from("vector_collections").delete({ count: "exact" }).eq("id", id).eq("org_id", orgId);
    if (error) return { success: false, error: "Failed to delete collection" };
    if (!count) return { success: false, error: "Collection not found", status: 404 };

    void recordAudit({ orgId, actorUserId: userId, action: "collection.deleted", targetType: "vector_collection", targetId: id, metadata: { name: existing?.name }, ...audit });

    // Stop billing — best-effort
    try {
      const { data: orgRow } = await db.schema("inference").from("orgs").select("billing_user_id, owner_user_id").eq("id", orgId).maybeSingle<{ billing_user_id: string | null; owner_user_id: string | null }>();
      const payerUserId = orgRow?.billing_user_id || orgRow?.owner_user_id || userId;
      await closeActiveBilling({ userId: payerUserId, serviceId: id, serviceType: "inference_vector", closeActive: () => BillingCredits.closeActiveVectorCollection({ serviceId: id }) });
    } catch (err) { console.warn("[InferenceVectorService.delete] billing close failed:", err); }

    return { success: true, data: { deleted_id: id } };
  },

  async upsert(orgId: string, id: string, rows: Array<{ external_id: string; content?: string; metadata?: Record<string, unknown>; embedding?: number[] }>): Promise<SR<{ upserted: number; rows: unknown[] }>> {
    const db = await createServiceClient();
    const { data: collection } = await db.schema("inference").from("vector_collections").select("id, dimensions, embedding_model_id").eq("id", id).eq("org_id", orgId).maybeSingle<{ id: string; dimensions: number; embedding_model_id: string | null }>();
    if (!collection) return { success: false, error: "Collection not found", status: 404 };

    // Quota check
    const { data: orgCollections } = await db.schema("inference").from("vector_collections").select("row_count").eq("org_id", orgId);
    const currentVectors = (orgCollections ?? []).reduce((s: number, c: { row_count: number | null }) => s + (Number(c.row_count) || 0), 0);
    if (currentVectors + rows.length > MAX_VECTORS_PER_ORG) return { success: false, error: `Vector storage limit reached (${MAX_VECTORS_PER_ORG.toLocaleString()} vectors per org).`, code: "vector_quota_exceeded", status: 403 };

    // Resolve embeddings
    const resolved: Array<{ external_id: string; content: string | null; metadata: Record<string, unknown>; embedding: number[] }> = [];
    for (const r of rows) {
      let embedding = r.embedding;
      if (!embedding) {
        if (!collection.embedding_model_id) return { success: false, error: `Bring-your-own-embeddings collection — provide a pre-computed \`embedding\` array for row "${r.external_id}".`, status: 400 };
        if (!r.content) return { success: false, error: `Row "${r.external_id}" has no \`content\` to embed and no pre-computed \`embedding\`.`, status: 400 };
        try {
          const result = await embedText(r.content, collection.embedding_model_id);
          embedding = result.embedding;
        } catch (err) {
          return { success: false, error: customerSafeErrorMessage(err instanceof Error ? err.message : "Auto-embed failed") || `Failed to embed row "${r.external_id}"`, status: 502 };
        }
      }
      if (embedding.length !== collection.dimensions) return { success: false, error: `Row "${r.external_id}" embedding length ${embedding.length} ≠ collection dimensions ${collection.dimensions}.`, status: 400 };
      resolved.push({ external_id: r.external_id, content: r.content ?? null, metadata: r.metadata ?? {}, embedding });
    }

    const { data: inserted, error: insErr } = await db
      .schema("inference")
      .from("vector_rows")
      .upsert(
        resolved.map((r) => ({
          collection_id: collection.id,
          external_id: r.external_id,
          content: r.content,
          metadata: r.metadata,
          embedding: JSON.stringify(r.embedding),
        })),
        { onConflict: "collection_id,external_id" }
      )
      .select("id, external_id");
    if (insErr) {
      console.error("[InferenceVectorService.upsert]", insErr);
      return { success: false, error: "Failed to upsert rows" };
    }
    return { success: true, data: { upserted: inserted?.length ?? 0, rows: inserted ?? [] } };
  },

  async query(orgId: string, id: string, input: { embedding?: number[]; text?: string; top_k?: number; min_similarity?: number; filter?: Record<string, unknown> }): Promise<SR<{ results: SearchRow[]; count: number }>> {
    const db = await createServiceClient();
    const { data: collection } = await db.schema("inference").from("vector_collections").select("id, dimensions, distance_metric, embedding_model_id").eq("id", id).eq("org_id", orgId).maybeSingle<{ id: string; dimensions: number; distance_metric: string; embedding_model_id: string | null }>();
    if (!collection) return { success: false, error: "Collection not found", status: 404 };

    let queryEmbedding = input.embedding;
    if (!queryEmbedding) {
      if (!input.text) return { success: false, error: "Must provide either `embedding` or `text`", status: 400 };
      if (!collection.embedding_model_id) return { success: false, error: "Bring-your-own-embeddings collection — provide a pre-computed `embedding` for query.", status: 400 };
      try { const r = await embedText(input.text, collection.embedding_model_id); queryEmbedding = r.embedding; }
      catch (err) { return { success: false, error: customerSafeErrorMessage(err instanceof Error ? err.message : "Auto-embed failed") || "Failed to embed query text", status: 502 }; }
    }
    if (!queryEmbedding || queryEmbedding.length !== collection.dimensions) {
      return {
        success: false,
        error: `Query embedding must be ${collection.dimensions} dimensions; got ${queryEmbedding?.length ?? 0}`,
        status: 400,
      };
    }

    const { data, error } = await db.schema("inference").rpc("search_vectors", {
      p_collection_id: collection.id,
      p_query_embedding: JSON.stringify(queryEmbedding),
      p_distance_metric: collection.distance_metric,
      p_limit: input.top_k ?? 10,
      p_min_similarity: input.min_similarity ?? 0,
      ...(input.filter ? { p_metadata_filter: input.filter } : {}),
    });

    if (error) { console.error("[InferenceVectorService.query]", error); return { success: false, error: "Vector search failed" }; }
    const rows = (data as unknown as SearchRow[] | null) ?? [];
    return { success: true, data: { results: rows, count: rows.length } };
  },

  async listRows(orgId: string, collectionId: string, opts: { limit: number; offset: number; q?: string }): Promise<SR<{ rows: unknown[]; total: number; limit: number; offset: number }>> {
    const db = await createServiceClient();
    const { data: col } = await db.schema("inference").from("vector_collections").select("id, row_count").eq("id", collectionId).eq("org_id", orgId).maybeSingle<{ id: string; row_count: number }>();
    if (!col) return { success: false, error: "Collection not found", status: 404 };

    let q = db.schema("inference").from("vector_rows").select("id, external_id, content, metadata, created_at, updated_at", { count: "exact" }).eq("collection_id", collectionId);
    if (opts.q) q = q.ilike("external_id", `%${opts.q}%`);
    const { data, error, count } = await q.order("created_at", { ascending: false }).range(opts.offset, opts.offset + opts.limit - 1);
    if (error) return { success: false, error: "Failed to list rows" };
    return {
      success: true,
      data: {
        rows: (data ?? []).map((r) => ({
          ...r,
          content: r.content ? (r.content.length > 240 ? `${r.content.slice(0, 240)}…` : r.content) : null,
        })),
        total: count ?? col.row_count,
        limit: opts.limit,
        offset: opts.offset,
      },
    };
  },

  async deleteRows(orgId: string, collectionId: string, externalIds: string[], userId: string, audit: { ipAddress: string | null; userAgent: string | null }): Promise<SR<{ deleted: number }>> {
    const db = await createServiceClient();
    const { data: col } = await db.schema("inference").from("vector_collections").select("id, name").eq("id", collectionId).eq("org_id", orgId).maybeSingle<{ id: string; name: string }>();
    if (!col) return { success: false, error: "Collection not found", status: 404 };

    const { error, count } = await db.schema("inference").from("vector_rows").delete({ count: "exact" }).eq("collection_id", collectionId).in("external_id", externalIds);
    if (error) return { success: false, error: "Failed to delete rows" };

    void recordAudit({ orgId, actorUserId: userId, action: "vector_rows.deleted", targetType: "vector_collection", targetId: collectionId, metadata: { collection_name: col.name, deleted: count ?? 0, requested: externalIds.length }, ...audit });
    return { success: true, data: { deleted: count ?? 0 } };
  },

  async getRow(orgId: string, collectionId: string, rowId: string): Promise<SR<unknown>> {
    const db = await createServiceClient();
    const { data: col } = await db.schema("inference").from("vector_collections").select("id").eq("id", collectionId).eq("org_id", orgId).maybeSingle<{ id: string }>();
    if (!col) return { success: false, error: "Collection not found", status: 404 };
    const { data, error } = await db.schema("inference").from("vector_rows").select("id, external_id, content, metadata, embedding, created_at, updated_at").eq("id", rowId).eq("collection_id", collectionId).maybeSingle();
    if (error || !data) return { success: false, error: "Row not found", status: 404 };
    return { success: true, data };
  },

  async deleteRow(orgId: string, collectionId: string, rowId: string, userId: string, audit: { ipAddress: string | null; userAgent: string | null }): Promise<SR<{ deleted_id: string }>> {
    const db = await createServiceClient();
    const { data: col } = await db.schema("inference").from("vector_collections").select("id, name").eq("id", collectionId).eq("org_id", orgId).maybeSingle<{ id: string; name: string }>();
    if (!col) return { success: false, error: "Collection not found", status: 404 };
    const { data: existing } = await db
      .schema("inference")
      .from("vector_rows")
      .select("external_id")
      .eq("id", rowId)
      .eq("collection_id", collectionId)
      .maybeSingle<{ external_id: string }>();
    const { error, count } = await db.schema("inference").from("vector_rows").delete({ count: "exact" }).eq("id", rowId).eq("collection_id", collectionId);
    if (error) return { success: false, error: "Failed to delete row" };
    if (!count) return { success: false, error: "Row not found", status: 404 };
    void recordAudit({ orgId, actorUserId: userId, action: "vector_row.deleted", targetType: "vector_row", targetId: rowId, metadata: { collection_name: col.name, external_id: existing?.external_id }, ...audit });
    return { success: true, data: { deleted_id: rowId } };
  },
};
