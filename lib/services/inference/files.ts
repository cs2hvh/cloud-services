import { recordAudit } from "@/lib/inference/audit";
import { createServiceClient } from "@/lib/supabase/server";
import { uploadBytes, deleteObject, downloadText, presignDownload, BATCH_BUCKET, fileKey } from "@/lib/inference/batch-storage";
import { customerSafeErrorMessage } from "@/lib/inference/error-messages";

type SR<T> = { success: true; data: T } | { success: false; error: string; status?: number };

const MAX_BYTES = 200 * 1024 * 1024;

function makeFileId() { return `file_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`; }

function toOaiShape(f: { id: string; purpose: string; filename: string; bytes: number; created_at: string; produced_by_batch_id?: string | null }) {
  return { id: f.id, object: "file", purpose: f.purpose, filename: f.filename, bytes: Number(f.bytes), created_at: Math.floor(new Date(f.created_at).getTime() / 1000), produced_by_batch_id: f.produced_by_batch_id ?? null };
}

export const InferenceFileService = {
  async list(orgId: string, purposeFilter?: string): Promise<SR<unknown[]>> {
    const db = await createServiceClient();
    let q = db.schema("inference").from("files").select("id, purpose, filename, bytes, produced_by_batch_id, created_at").eq("org_id", orgId).is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
    if (purposeFilter) q = q.eq("purpose", purposeFilter);
    const { data, error } = await q;
    if (error) return { success: false, error: "Failed to list files" };
    return { success: true, data: (data ?? []).map(toOaiShape) };
  },

  async get(orgId: string, fileId: string): Promise<SR<unknown>> {
    const db = await createServiceClient();
    const { data } = await db.schema("inference").from("files").select("id, purpose, filename, bytes, produced_by_batch_id, created_at, deleted_at").eq("id", fileId).eq("org_id", orgId).maybeSingle<{ id: string; purpose: string; filename: string; bytes: number; produced_by_batch_id: string | null; created_at: string; deleted_at: string | null }>();
    if (!data || data.deleted_at) return { success: false, error: "File not found", status: 404 };
    return { success: true, data: toOaiShape(data) };
  },

  async upload(orgId: string, userId: string, body: Buffer, filename: string, purpose: "batch", audit: { ipAddress: string | null; userAgent: string | null }): Promise<SR<unknown>> {
    if (body.length === 0) return { success: false, error: "Empty body", status: 400 };
    if (body.length > MAX_BYTES) return { success: false, error: `File exceeds ${MAX_BYTES / 1024 / 1024}MB limit`, status: 413 };

    const fileId = makeFileId();
    const key = fileKey(orgId, fileId);
    const db = await createServiceClient();

    const { error: insertErr } = await db.schema("inference").from("files").insert({ id: fileId, org_id: orgId, created_by: userId, purpose, filename, bytes: body.length, r2_bucket: BATCH_BUCKET, r2_key: key });
    if (insertErr) return { success: false, error: "Failed to register file" };

    try { await uploadBytes(orgId, fileId, body); }
    catch (err) {
      await db.schema("inference").from("files").delete().eq("id", fileId);
      return { success: false, error: customerSafeErrorMessage(err instanceof Error ? err.message : "Upload failed") || "Upload to object storage failed. Please retry.", status: 502 };
    }

    void recordAudit({ orgId, actorUserId: userId, action: "file.uploaded", targetType: "file", targetId: fileId, metadata: { purpose, bytes: body.length, filename }, ...audit });
    return { success: true, data: { id: fileId, object: "file", purpose, filename, bytes: body.length, created_at: Math.floor(Date.now() / 1000) } };
  },

  async delete(orgId: string, fileId: string, userId: string, audit: { ipAddress: string | null; userAgent: string | null }): Promise<SR<{ deleted: true }>> {
    const db = await createServiceClient();
    const { data: existing } = await db.schema("inference").from("files").select("id, filename, purpose, deleted_at").eq("id", fileId).eq("org_id", orgId).maybeSingle<{ id: string; filename: string; purpose: string; deleted_at: string | null }>();
    if (!existing || existing.deleted_at) return { success: false, error: "File not found", status: 404 };

    await db.schema("inference").from("files").update({ deleted_at: new Date().toISOString() }).eq("id", fileId).eq("org_id", orgId);
    void deleteObject(orgId, fileId).catch((err) => console.warn("[InferenceFileService.delete] R2 purge failed:", err));
    void recordAudit({ orgId, actorUserId: userId, action: "file.deleted", targetType: "file", targetId: fileId, metadata: { filename: existing.filename, purpose: existing.purpose }, ...audit });
    return { success: true, data: { deleted: true } };
  },

  async content(orgId: string, fileId: string, wantPresignedUrl: boolean): Promise<SR<{ type: "stream"; text: string; filename: string } | { type: "url"; url: string }>> {
    const db = await createServiceClient();
    const { data } = await db.schema("inference").from("files").select("id, filename, deleted_at").eq("id", fileId).eq("org_id", orgId).maybeSingle<{ id: string; filename: string; deleted_at: string | null }>();
    if (!data || data.deleted_at) return { success: false, error: "File not found", status: 404 };

    if (wantPresignedUrl) {
      try {
        const url = await presignDownload(orgId, fileId);
        return { success: true, data: { type: "url", url } };
      } catch (err) {
        console.error("[InferenceFileService.content] presign failed:", err);
        return { success: false, error: "Failed to sign download URL" };
      }
    }

    try {
      const text = await downloadText(orgId, fileId);
      return { success: true, data: { type: "stream", text, filename: data.filename } };
    } catch (err) {
      return { success: false, error: customerSafeErrorMessage(err instanceof Error ? err.message : "Download failed") || "Could not retrieve file from object storage. Please retry.", status: 502 };
    }
  },
};
