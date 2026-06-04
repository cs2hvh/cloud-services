import { recordAudit } from "@/lib/inference/audit";
import { createServiceClient } from "@/lib/supabase/server";
import { preflightDeployment } from "@/lib/inference/deploy-validate";
import { enqueueDeploymentJob } from "@/lib/inference/deploy-queue";
import { customerSafeErrorMessage } from "@/lib/inference/error-messages";
import { encryptAesGcm } from "@/lib/inference/crypto";

type SR<T> =
  | { success: true; data: T; meta?: Record<string, unknown> }
  | { success: false; error: string; status?: number; meta?: Record<string, unknown> };

const LEGACY_GPU_SKUS = new Set(["A100-80GB", "A100-40GB", "H100-80GB", "L40S", "A40", "RTX-6000-Ada"]);

export interface CreateDeploymentInput {
  name: string;
  source: "docker" | "huggingface" | "truss";
  source_ref: string;
  source_revision?: string | null;
  gpu_sku: string;
  autoscale?: { min_workers: number; max_workers: number; idle_timeout_s: number };
  hf_token?: string;
}

export const InferenceDeploymentService = {
  async list(orgId: string, statusFilter?: string): Promise<SR<unknown[]>> {
    const db = await createServiceClient();
    let q = db
      .schema("inference")
      .from("deployments")
      .select("id, name, source, source_ref, source_revision, gpu_sku, autoscale, status, endpoint_id:runpod_endpoint_id, image_uri, model_id, error_message, deployed_at, created_at, updated_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (statusFilter) q = q.eq("status", statusFilter);
    const { data, error } = await q;
    if (error) return { success: false, error: "Failed to list deployments" };
    return { success: true, data: (data ?? []).map((r) => ({ ...r, error_message: r.error_message ? customerSafeErrorMessage(r.error_message) : null })) };
  },

  async get(orgId: string, id: string): Promise<SR<unknown>> {
    const db = await createServiceClient();
    const { data, error } = await db
      .schema("inference")
      .from("deployments")
      .select("id, name, source, source_ref, source_revision, gpu_sku, autoscale, status, endpoint_id:runpod_endpoint_id, image_uri, build_log_url, model_id, error_message, deployed_at, created_at, updated_at, org_id")
      .eq("id", id)
      .maybeSingle();
    if (error) return { success: false, error: "Failed to load deployment" };
    if (!data) return { success: false, error: "Deployment not found", status: 404 };
    if (data.org_id !== orgId) return { success: false, error: "Deployment not found", status: 404 };
    return { success: true, data: { ...data, error_message: data.error_message ? customerSafeErrorMessage(data.error_message) : null } };
  },

  async create(orgId: string, userId: string, input: CreateDeploymentInput, audit: { ipAddress: string | null; userAgent: string | null }): Promise<SR<unknown>> {
    if (input.source === "truss") {
      return {
        success: false,
        error:
          "Truss source not yet supported. Build your Truss bundle locally with `truss build`, push the resulting image to a public registry, then deploy here with source = 'docker'. Native Truss support is on the roadmap.",
        status: 400,
      };
    }

    if (input.source !== "huggingface" && input.hf_token) {
      return { success: false, error: "hf_token is only meaningful when source = 'huggingface'", status: 400 };
    }

    const db = await createServiceClient();

    // GPU validation
    if (!LEGACY_GPU_SKUS.has(input.gpu_sku)) {
      const { data: gpuRow, error: gpuErr } = await db.from("gpu_catalog").select("runpod_gpu_id").eq("runpod_gpu_id", input.gpu_sku).eq("is_active", true).maybeSingle();
      if (gpuErr) return { success: false, error: "Could not validate GPU selection" };
      if (!gpuRow) return { success: false, error: "That GPU is not available. Pick one from the list.", status: 400 };
    }

    // Preflight
    const preflight = await preflightDeployment({ source: input.source, source_ref: input.source_ref, source_revision: input.source_revision ?? null });
    if (!preflight.ok) return { success: false, error: "Source failed pre-flight checks", status: 400, meta: { preflight } };

    // Encrypt HF token if provided
    let hfTokenEncrypted: string | null = null;
    if (input.source === "huggingface" && input.hf_token) {
      const dek = process.env.BYOK_DEK;
      if (!dek) return { success: false, error: "BYOK_DEK not configured" };
      try {
        const cipher = await encryptAesGcm(input.hf_token, dek);
        hfTokenEncrypted = Buffer.from(cipher).toString("base64");
      } catch { return { success: false, error: "Could not encrypt HF token" }; }
    }

    const { data, error } = await db.schema("inference").from("deployments").insert({
      org_id: orgId, created_by_user_id: userId, name: input.name,
      source: input.source, source_ref: input.source_ref, source_revision: input.source_revision ?? null,
      gpu_sku: input.gpu_sku, autoscale: input.autoscale ?? { min_workers: 0, max_workers: 4, idle_timeout_s: 60 },
      image_uri: preflight.resolved_image_uri, status: "building", hf_token_encrypted: hfTokenEncrypted,
    }).select("id, name, source, source_ref, gpu_sku, autoscale, status, image_uri, created_at").single();

    if (error) {
      if (error.code === "23505") return { success: false, error: `Deployment named "${input.name}" already exists in this org`, status: 409 };
      return { success: false, error: "Failed to create deployment" };
    }

    void recordAudit({ orgId, actorUserId: userId, action: "deployment.created", targetType: "deployment", targetId: data.id, metadata: { name: data.name, source: data.source, source_ref: data.source_ref, gpu_sku: data.gpu_sku }, ...audit });
    void enqueueDeploymentJob(data.id, "create");
    return { success: true, data, meta: { preflight } };
  },

  async delete(orgId: string, id: string, userId: string, audit: { ipAddress: string | null; userAgent: string | null }): Promise<SR<{ already_deleted?: boolean }>> {
    const db = await createServiceClient();
    const { data: existing } = await db.schema("inference").from("deployments").select("id, name, org_id, status, endpoint_id:runpod_endpoint_id").eq("id", id).maybeSingle<{ id: string; name: string; org_id: string; status: string; endpoint_id: string | null }>();
    if (!existing) return { success: false, error: "Deployment not found", status: 404 };
    if (existing.org_id !== orgId) return { success: false, error: "Deployment not found", status: 404 };
    if (existing.status === "deleted") return { success: true, data: { already_deleted: true } };

    const { error } = await db.schema("inference").from("deployments").update({
      status: existing.endpoint_id ? "paused" : "deleted",
      error_message: existing.endpoint_id ? "Tear-down in progress — workers stop billing within ~30s." : null,
    }).eq("id", id);
    if (error) return { success: false, error: "Failed to mark deletion" };

    void recordAudit({ orgId, actorUserId: userId, action: "deployment.deleted", targetType: "deployment", targetId: id, metadata: { name: existing.name, endpoint_id: existing.endpoint_id }, ...audit });
    if (existing.endpoint_id) void enqueueDeploymentJob(id, "delete");
    return { success: true, data: {} };
  },

  async scale(orgId: string, id: string, userId: string, autoscale: { min_workers: number; max_workers: number; idle_timeout_s: number }, audit: { ipAddress: string | null; userAgent: string | null }): Promise<SR<{ autoscale: unknown }>> {
    const db = await createServiceClient();
    const { data: existing } = await db.schema("inference").from("deployments").select("id, name, org_id, status, endpoint_id:runpod_endpoint_id").eq("id", id).maybeSingle<{ id: string; name: string; org_id: string; status: string; endpoint_id: string | null }>();
    if (!existing || existing.org_id !== orgId) return { success: false, error: "Deployment not found", status: 404 };
    if (existing.status === "deleted") return { success: false, error: "Deployment is deleted", status: 409 };

    const { error } = await db.schema("inference").from("deployments").update({ autoscale }).eq("id", id);
    if (error) return { success: false, error: "Failed to update autoscale" };

    void recordAudit({ orgId, actorUserId: userId, action: "deployment.updated", targetType: "deployment", targetId: id, metadata: { name: existing.name, autoscale }, ...audit });
    if (existing.endpoint_id) void enqueueDeploymentJob(id, "scale");
    return { success: true, data: { autoscale } };
  },
};
