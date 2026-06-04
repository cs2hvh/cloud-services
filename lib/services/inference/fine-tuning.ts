/**
 * Inference Fine-Tuning Service
 *
 * Business logic for inference.finetunes — including the
 * balance gate, concurrency quota, GPU-fit check, and
 * dataset preflight. Route handlers call these methods.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { BillingCredits } from "@/lib/billing/credits";
import { recordAudit } from "@/lib/inference/audit";
import { preflightDataset } from "@/lib/inference/finetune-validate";
import { enqueueFinetuneJob } from "@/lib/inference/finetune-queue";
import { ftBaseGpuFit, ftBaseIsGated, resolveHuggingFaceId } from "@/lib/inference/ft-base-models";
import { checkHuggingFaceAccess } from "@/lib/inference/hf-access";

const MAX_CONCURRENT_JOBS = 3;
const MIN_BALANCE_USD = 1;

const ALLOWED_BASE_MODELS = new Set([
  "meta-llama/llama-4-scout",
  "meta-llama/llama-4-maverick",
  "meta-llama/llama-3.3-70b-instruct",
  "meta-llama/llama-3.3-8b-instruct",
  "deepseek/deepseek-v3.2",
  "qwen/qwen-3-235b-instruct",
  "qwen/qwen-3-32b-instruct",
  "qwen/qwen-3-14b-instruct",
  "qwen/qwen-3-8b-instruct",
  "mistralai/mistral-large-3",
  "mistralai/mistral-nemo",
  "microsoft/phi-4",
  "google/gemma-4-27b-it",
]);

const DEFAULT_HYPERPARAMS = {
  rank: 16, alpha: 32, lr: 0.0002, epochs: 3,
  batch_size: 4, gradient_accumulation_steps: 4,
  max_seq_length: 4096, warmup_steps: 100,
};

const LEGACY_GPU_MEMORY: Record<string, number> = {
  "A100-80GB": 80, "A100-40GB": 40, "H100-80GB": 80,
  "L40S": 48, "A40": 48, "RTX-6000-Ada": 48,
};

type ServiceResult<T> =
  | { success: true; data: T; meta?: Record<string, unknown> }
  | { success: false; error: string; code?: string; status?: number; meta?: Record<string, unknown> };

export interface CreateFineTuneInput {
  name: string;
  base_model_id: string;
  method?: "lora" | "qlora" | "full";
  dataset_url: string;
  validation_dataset_url?: string | null;
  gpu_sku: string;
  hyperparams?: Record<string, unknown>;
}

export const InferenceFineTuneService = {
  async list(orgId: string, statusFilter?: string): Promise<ServiceResult<unknown[]>> {
    const db = await createServiceClient();
    let q = db
      .schema("inference")
      .from("finetunes")
      .select(
        "id, name, base_model_id, method, hyperparams, dataset_url, validation_dataset_url, status, gpu_sku, pod_id:runpod_job_id, output_model_id, output_artifact_url, training_seconds, cost_cents, error_message, queued_at, started_at, completed_at, created_at, updated_at, current_step, max_steps, current_epoch, latest_loss, last_heartbeat_at, hourly_cost_cents"
        + ", training_log_url, is_managed, serving_url, serving_pod_state, serving_pod_gpu_sku, serving_pod_started_at, serving_pod_stopped_at, serving_pod_hourly_cents, serving_pod_auto_stop_at, serving_pod_error_message"
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (statusFilter) q = q.eq("status", statusFilter);

    const { data, error } = await q;
    if (error) {
      console.error("[InferenceFineTuneService.list]", error);
      return { success: false, error: "Failed to list fine-tuning jobs" };
    }
    return { success: true, data: data ?? [] };
  },

  async create(
    orgId: string,
    userId: string,
    input: CreateFineTuneInput,
    audit: { ipAddress: string | null; userAgent: string | null }
  ): Promise<ServiceResult<unknown>> {
    // 1. Base model allowed?
    if (!ALLOWED_BASE_MODELS.has(input.base_model_id)) {
      return {
        success: false,
        error: `Base model "${input.base_model_id}" is not fine-tunable. Allowed: ${[...ALLOWED_BASE_MODELS].join(", ")}`,
        status: 400,
      };
    }

    const db = await createServiceClient();

    // 2. GPU validation
    let gpuMemoryGb: number | null = LEGACY_GPU_MEMORY[input.gpu_sku] ?? null;
    if (gpuMemoryGb === null) {
      const { data: gpuRow, error: gpuErr } = await db
        .from("gpu_catalog")
        .select("runpod_gpu_id, memory_gb")
        .eq("runpod_gpu_id", input.gpu_sku)
        .eq("is_active", true)
        .maybeSingle<{ runpod_gpu_id: string; memory_gb: number }>();
      if (gpuErr) return { success: false, error: "Could not validate GPU selection", status: 500 };
      if (!gpuRow) return { success: false, error: "That GPU is not available. Pick one from the list.", status: 400 };
      gpuMemoryGb = gpuRow.memory_gb;
    }

    // 3. GPU-fit guard — fail before burning any GPU time
    const fit = ftBaseGpuFit(input.base_model_id, gpuMemoryGb);
    if (!fit.ok) {
      return {
        success: false,
        error: fit.reason === "too-large"
          ? `${input.base_model_id} is too large to fine-tune on a single GPU. Pick a smaller base model.`
          : `This base model needs a GPU with at least ${fit.minGpuGb} GB. Pick a larger GPU.`,
        code: "ft_gpu_unfit",
        status: 400,
      };
    }

    // 4. Gated access check
    if (ftBaseIsGated(input.base_model_id)) {
      const access = await checkHuggingFaceAccess(resolveHuggingFaceId(input.base_model_id));
      if (access === "denied" || access === "no-token") {
        return {
          success: false,
          error: "This base model isn't available for fine-tuning yet. Try a different base or contact support.",
          code: "ft_base_access_pending",
          status: 400,
        };
      }
    }

    // 5. Concurrency quota
    const { count: activeJobs, error: countErr } = await db
      .schema("inference")
      .from("finetunes")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .in("status", ["queued", "preparing", "running"]);
    if (countErr) return { success: false, error: "Could not check job quota", status: 500 };
    if ((activeJobs ?? 0) >= MAX_CONCURRENT_JOBS) {
      return {
        success: false,
        error: `You have ${activeJobs} jobs queued/running (limit ${MAX_CONCURRENT_JOBS}). Wait for one to finish.`,
        code: "ft_concurrency_limit",
        status: 429,
      };
    }

    const mergedHyperparams = { ...DEFAULT_HYPERPARAMS, ...(input.hyperparams ?? {}) };

    // 6. Dataset preflight
    const preflight = await preflightDataset({
      datasetUrl: input.dataset_url,
      baseModelId: input.base_model_id,
      sequenceLen: (mergedHyperparams.max_seq_length as number) ?? 4096,
      epochs: (mergedHyperparams.epochs as number) ?? 3,
    });
    if (!preflight.ok) {
      return { success: false, error: "Dataset failed pre-flight checks", status: 400, meta: { preflight } };
    }

    // 7. Balance gate — billing responsibility lives in service, not route
    const requiredUsd = Math.max((preflight.estimated_cost_cents ?? 0) / 100, MIN_BALANCE_USD);
    const { data: orgRow } = await db
      .schema("inference")
      .from("orgs")
      .select("billing_user_id, owner_user_id")
      .eq("id", orgId)
      .maybeSingle();
    const payerUserId = orgRow?.billing_user_id || orgRow?.owner_user_id || userId;
    const funded = await BillingCredits.hasSufficientBalance(payerUserId, requiredUsd);
    if (!funded) {
      return {
        success: false,
        error: `Insufficient credits. Estimated cost ~$${requiredUsd.toFixed(2)}. Please top up.`,
        code: "insufficient_credits",
        status: 402,
        meta: { required_usd: Number(requiredUsd.toFixed(2)) },
      };
    }

    // 8. Insert
    const { data, error } = await db
      .schema("inference")
      .from("finetunes")
      .insert({
        org_id: orgId,
        created_by_user_id: userId,
        name: input.name,
        base_model_id: input.base_model_id,
        method: input.method ?? "lora",
        hyperparams: mergedHyperparams,
        dataset_url: input.dataset_url,
        validation_dataset_url: input.validation_dataset_url ?? null,
        gpu_sku: input.gpu_sku,
        status: "queued",
      })
      .select("id, name, base_model_id, method, hyperparams, status, gpu_sku, dataset_url, queued_at, created_at")
      .single();

    if (error) {
      console.error("[InferenceFineTuneService.create]", error);
      return { success: false, error: "Failed to create fine-tuning job" };
    }

    void recordAudit({
      orgId,
      actorUserId: userId,
      action: "finetune.created",
      targetType: "finetune",
      targetId: data.id,
      metadata: { name: data.name, base_model_id: data.base_model_id, method: data.method, gpu_sku: data.gpu_sku },
      ...audit,
    });

    void enqueueFinetuneJob(data.id);

    return { success: true, data, meta: { preflight } };
  },

  async get(orgId: string, jobId: string): Promise<ServiceResult<unknown>> {
    const db = await createServiceClient();
    const { data, error } = await db
      .schema("inference")
      .from("finetunes")
      .select("*")
      .eq("id", jobId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (error || !data) return { success: false, error: "Job not found in this org", status: 404 };
    return { success: true, data };
  },

  async cancel(
    orgId: string,
    jobId: string,
    userId: string,
    audit: { ipAddress: string | null; userAgent: string | null }
  ): Promise<ServiceResult<{ cancelled_id: string }>> {
    const db = await createServiceClient();
    const { data: job } = await db
      .schema("inference")
      .from("finetunes")
      .select("id, name, status, pod_id:runpod_job_id")
      .eq("id", jobId)
      .eq("org_id", orgId)
      .maybeSingle<{ id: string; name: string; status: string; pod_id: string | null }>();

    if (!job) return { success: false, error: "Job not found in this org", status: 404 };
    if (!["queued", "preparing", "running"].includes(job.status)) {
      return { success: false, error: `Job is in state "${job.status}" and cannot be cancelled`, status: 400 };
    }

    const { error } = await db
      .schema("inference")
      .from("finetunes")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("org_id", orgId);

    if (error) {
      console.error("[InferenceFineTuneService.cancel]", error);
      return { success: false, error: "Failed to cancel job" };
    }

    void recordAudit({
      orgId,
      actorUserId: userId,
      action: "finetune.cancelled",
      targetType: "finetune",
      targetId: jobId,
      metadata: { name: job.name, previous_status: job.status, pod_id: job.pod_id },
      ...audit,
    });

    // Best-effort pod termination — watchdog is the backstop
    if (job.pod_id) {
      const { RunPodClient } = await import("@/lib/services/runpod/client");
      void RunPodClient.rest("DELETE", `/pods/${job.pod_id}`).catch((err) =>
        console.error(`[InferenceFineTuneService.cancel] pod teardown failed for ${job.pod_id}:`, err)
      );
    }

    return { success: true, data: { cancelled_id: jobId } };
  },
};
