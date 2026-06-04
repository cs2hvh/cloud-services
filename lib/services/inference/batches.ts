import { recordAudit } from "@/lib/inference/audit";
import { createServiceClient } from "@/lib/supabase/server";
import { serializeBatch, type BatchRow, type BatchStatus } from "@/lib/inference/batches";
import { downloadText } from "@/lib/inference/batch-storage";

type SR<T> = { success: true; data: T } | { success: false; error: string; status?: number };

const TERMINAL: BatchStatus[] = ["failed", "completed", "expired", "cancelled"];
const CANCELLABLE: BatchStatus[] = ["validating", "in_progress", "finalizing"];
const ENDPOINTS = ["/v1/chat/completions", "/v1/embeddings"] as const;

function makeBatchId() { return `batch_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`; }

export const InferenceBatchService = {
  async list(orgId: string): Promise<SR<unknown[]>> {
    const db = await createServiceClient();
    const { data, error } = await db.schema("inference").from("batches").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(100).returns<BatchRow[]>();
    if (error) return { success: false, error: "Failed to list batches" };
    return { success: true, data: (data ?? []).map(serializeBatch) };
  },

  async get(orgId: string, batchId: string): Promise<SR<unknown>> {
    const db = await createServiceClient();
    const { data } = await db.schema("inference").from("batches").select("*").eq("id", batchId).eq("org_id", orgId).maybeSingle<BatchRow>();
    if (!data) return { success: false, error: "Batch not found", status: 404 };
    return { success: true, data: serializeBatch(data) };
  },

  async create(
    orgId: string, userId: string,
    input: { input_file_id: string; endpoint: typeof ENDPOINTS[number]; completion_window: "24h"; metadata?: Record<string, string> },
    audit: { ipAddress: string | null; userAgent: string | null }
  ): Promise<SR<unknown>> {
    const db = await createServiceClient();

    const { data: file } = await db.schema("inference").from("files").select("id, purpose, bytes, deleted_at").eq("id", input.input_file_id).eq("org_id", orgId).maybeSingle<{ id: string; purpose: string; bytes: number; deleted_at: string | null }>();
    if (!file || file.deleted_at) return { success: false, error: "input_file_id not found in this org", status: 404 };
    if (file.purpose !== "batch") return { success: false, error: `input_file_id has purpose "${file.purpose}" — expected "batch"`, status: 400 };

    // Count lines for request_counts.total (lightweight — no full JSON parse)
    let lineCount = 0;
    try {
      const text = await downloadText(orgId, input.input_file_id);
      lineCount = text.split("\n").filter((l) => l.trim().length > 0).length;
    } catch (err) {
      console.error("[InferenceBatchService.create] R2 line-count failed:", err);
      return { success: false, error: "Could not read input file from storage", status: 502 };
    }

    if (lineCount === 0) return { success: false, error: "Input file is empty", status: 400 };

    const batchId = makeBatchId();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: batch, error } = await db.schema("inference").from("batches").insert({
      id: batchId, org_id: orgId, created_by: userId,
      input_file_id: input.input_file_id, endpoint: input.endpoint,
      completion_window: input.completion_window,
      metadata: input.metadata ?? {}, status: "validating",
      request_counts: { total: lineCount, completed: 0, failed: 0 },
      expires_at: expiresAt,
    }).select("*").single<BatchRow>();

    if (error) return { success: false, error: "Failed to create batch" };

    void recordAudit({ orgId, actorUserId: userId, action: "batch.created", targetType: "batch", targetId: batchId, metadata: { endpoint: input.endpoint, input_file_id: input.input_file_id, lines: lineCount }, ...audit });
    return { success: true, data: serializeBatch(batch) };
  },

  async cancel(
    orgId: string, batchId: string, userId: string,
    audit: { ipAddress: string | null; userAgent: string | null }
  ): Promise<SR<unknown>> {
    const db = await createServiceClient();
    const { data: existing } = await db.schema("inference").from("batches").select("*").eq("id", batchId).eq("org_id", orgId).maybeSingle<BatchRow>();
    if (!existing) return { success: false, error: "Batch not found", status: 404 };
    if (existing.status === "cancelling" || existing.status === "cancelled") return { success: true, data: serializeBatch(existing) };
    if (!CANCELLABLE.includes(existing.status)) return { success: false, error: `Cannot cancel batch in terminal status "${existing.status}"`, status: 409 };

    const now = new Date().toISOString();
    const { data: updated, error } = await db.schema("inference").from("batches").update({ status: "cancelling", cancelling_at: now }).eq("id", batchId).eq("org_id", orgId).select("*").single<BatchRow>();
    if (error || !updated) return { success: false, error: "Failed to cancel batch" };

    void recordAudit({ orgId, actorUserId: userId, action: "batch.cancelled", targetType: "batch", targetId: batchId, metadata: { prior_status: existing.status }, ...audit });
    return { success: true, data: serializeBatch(updated) };
  },

  async softDelete(orgId: string, batchId: string): Promise<SR<{ id: string; object: "batch"; deleted: true }>> {
    const db = await createServiceClient();
    const { data: existing } = await db.schema("inference").from("batches").select("id, status").eq("id", batchId).eq("org_id", orgId).maybeSingle<{ id: string; status: BatchStatus }>();
    if (!existing) return { success: false, error: "Batch not found", status: 404 };
    if (!TERMINAL.includes(existing.status)) return { success: false, error: `Cannot delete a batch in status "${existing.status}" — cancel it first`, status: 409 };
    await db.schema("inference").from("batches").delete().eq("id", batchId).eq("org_id", orgId);
    return { success: true, data: { id: batchId, object: "batch", deleted: true } };
  },
};
