/**
 * GET  /api/inference/fine-tuning/jobs — list jobs in the active org
 * POST /api/inference/fine-tuning/jobs — create a new LoRA / qLoRA / full-FT job
 *
 * Created jobs land in status='queued'. A BullMQ worker on k8s picks them up,
 * provisions a RunPod pod with the training image, runs axolotl/unsloth, then
 * webhooks back to this service with the output adapter location.
 *
 * See docs/inference/fine-tuning-runner.md for the runner contract.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { BillingCredits } from "@/lib/billing/credits";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";
import { preflightDataset } from "@/lib/inference/finetune-validate";
import { enqueueFinetuneJob } from "@/lib/inference/finetune-queue";
import { internalError, tooManyRequests } from "@/lib/inference/api-errors";
import {
  ftBaseGpuFit,
  ftBaseIsGated,
  resolveHuggingFaceId,
} from "@/lib/inference/ft-base-models";
import { checkHuggingFaceAccess } from "@/lib/inference/hf-access";

const createSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, "Use letters, digits, hyphens, underscores"),
  base_model_id: z.string().min(1),
  method: z.enum(["lora", "qlora", "full"]).default("lora"),
  dataset_url: z
    .string()
    .url("Dataset URL must be a valid https:// or s3:// URL")
    .refine(
      (u) => u.startsWith("https://") || u.startsWith("s3://") || u.startsWith("r2://"),
      "Use https://, s3://, or r2:// URL"
    ),
  validation_dataset_url: z.string().url().optional().nullable(),
  // Verbatim RunPod gpuTypeId (gpu_catalog.runpod_gpu_id), validated against
  // the live catalog below. Legacy short SKUs are still accepted for back-compat.
  gpu_sku: z.string().min(1, "Select a GPU"),
  hyperparams: z
    .object({
      rank: z.number().int().min(1).max(256).optional(),
      alpha: z.number().int().min(1).max(512).optional(),
      lr: z.number().positive().max(1).optional(),
      epochs: z.number().int().min(1).max(50).optional(),
      batch_size: z.number().int().min(1).max(64).optional(),
      gradient_accumulation_steps: z.number().int().min(1).max(64).optional(),
      max_seq_length: z.number().int().min(128).max(131072).optional(),
      warmup_steps: z.number().int().min(0).max(10000).optional(),
      target_modules: z.array(z.string()).optional(),
    })
    .passthrough()
    .default({}),
});

// Fair-use + cost-safety guards for GPU-backed fine-tuning. A customer org
// can't saturate the fleet (or its own bill) with unbounded concurrent jobs,
// and can't launch a job it has no credits to pay for.
const MAX_CONCURRENT_FT_JOBS_PER_ORG = 3;
const MIN_FT_BALANCE_USD = 1;

const DEFAULT_HYPERPARAMS = {
  rank: 16,
  alpha: 32,
  lr: 0.0002,
  epochs: 3,
  batch_size: 4,
  gradient_accumulation_steps: 4,
  max_seq_length: 4096,
  warmup_steps: 100,
};

const ALLOWED_FT_BASE_MODELS = new Set([
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

export async function GET(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-ft-list",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return internalError("Org resolution failed", err, "org_resolution_failed");
  }

  const statusFilter = request.nextUrl.searchParams.get("status");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  let q = supabase
    .schema("inference")
    .from("finetunes")
    .select(
      "id, name, base_model_id, method, hyperparams, dataset_url, validation_dataset_url, status, gpu_sku, pod_id:runpod_job_id, output_model_id, output_artifact_url, training_seconds, cost_cents, error_message, queued_at, started_at, completed_at, created_at, updated_at, current_step, max_steps, current_epoch, latest_loss, last_heartbeat_at, hourly_cost_cents, training_log_url, is_managed, serving_url, serving_pod_state, serving_pod_gpu_sku, serving_pod_started_at, serving_pod_stopped_at, serving_pod_hourly_cents, serving_pod_auto_stop_at, serving_pod_error_message"
      /* dashboard expansion uses output_artifact_url + hyperparams + pod_id;
         keep them in the list response so we don't need a second fetch.
         is_managed + serving_url + serving_pod_* drive the Phase 11.B
         managed-serving panel (state pill, cost meter, controls). */
    )
    .eq("org_id", org.org_id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (statusFilter) q = q.eq("status", statusFilter);

  const { data, error } = await q;

  if (error) {
    console.error("[Inference FT] list error:", error);
    return NextResponse.json({ error: "Failed to list jobs" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    org: { id: org.org_id, slug: org.org_slug, name: org.org_name, role: org.role },
    data: data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-ft-create",
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.issues },
      { status: 400 }
    );
  }

  // Base model must be an open-weight model we can actually fine-tune on
  if (!ALLOWED_FT_BASE_MODELS.has(parsed.data.base_model_id)) {
    return NextResponse.json(
      {
        error: `Base model "${parsed.data.base_model_id}" is not fine-tunable. Allowed bases: ${[...ALLOWED_FT_BASE_MODELS].join(", ")}`,
      },
      { status: 400 }
    );
  }

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return internalError("Org resolution failed", err, "org_resolution_failed");
  }
  if (org.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot create fine-tuning jobs" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // ── GPU validation ────────────────────────────────────────────────
  // gpu_sku is the verbatim RunPod gpuTypeId; it must match an active row in
  // the live GPU catalog (the same source the deploy picker uses). Legacy
  // short SKUs from older clients are still accepted.
  const LEGACY_GPU_MEMORY_GB: Record<string, number> = {
    "A100-80GB": 80,
    "A100-40GB": 40,
    "H100-80GB": 80,
    "L40S": 48,
    "A40": 48,
    "RTX-6000-Ada": 48,
  };
  let gpuMemoryGb: number | null = LEGACY_GPU_MEMORY_GB[parsed.data.gpu_sku] ?? null;
  if (gpuMemoryGb === null) {
    const { data: gpuRow, error: gpuErr } = await supabase
      .from("gpu_catalog")
      .select("runpod_gpu_id, memory_gb")
      .eq("runpod_gpu_id", parsed.data.gpu_sku)
      .eq("is_active", true)
      .maybeSingle<{ runpod_gpu_id: string; memory_gb: number }>();
    if (gpuErr) {
      return internalError("Could not validate GPU selection", gpuErr, "ft_gpu_validate_failed");
    }
    if (!gpuRow) {
      return NextResponse.json(
        { error: "That GPU is not available. Pick one from the list." },
        { status: 400 }
      );
    }
    gpuMemoryGb = gpuRow.memory_gb;
  }

  // ── GPU-fit guard ─────────────────────────────────────────────────
  // Block model/GPU combos that can't physically train before a pod is ever
  // provisioned — otherwise the job boots, OOMs (or can't load the weights)
  // several minutes into a paid GPU and fails with a cryptic error.
  const fit = ftBaseGpuFit(parsed.data.base_model_id, gpuMemoryGb);
  if (!fit.ok) {
    const msg =
      fit.reason === "too-large"
        ? `${parsed.data.base_model_id} is too large to fine-tune on a single GPU right now. Pick a smaller base model.`
        : `This base model needs a GPU with at least ${fit.minGpuGb} GB of memory. Pick a larger GPU.`;
    return NextResponse.json({ error: msg, code: "ft_gpu_unfit" }, { status: 400 });
  }

  // ── Gated-access guard ────────────────────────────────────────────
  // Gated bases (Meta / Google) 403 deep inside the pod unless the platform's
  // HF account is approved for the exact repo. Verify up front so we never burn
  // GPU time on a download we can't complete. "unknown" (HF unreachable) does
  // NOT block — the pod is the final gate.
  if (ftBaseIsGated(parsed.data.base_model_id)) {
    const access = await checkHuggingFaceAccess(resolveHuggingFaceId(parsed.data.base_model_id));
    if (access === "denied" || access === "no-token") {
      return NextResponse.json(
        {
          error:
            "This base model isn't available for fine-tuning yet — it needs access approval. Try a different base, or contact support to enable it.",
          code: "ft_base_access_pending",
        },
        { status: 400 }
      );
    }
  }

  // ── Per-org concurrency quota ─────────────────────────────────────
  // Fair-use guard: one org can't tie up the GPU fleet (or run up its bill)
  // with unbounded concurrent jobs. Counts jobs still consuming, or about to
  // consume, a GPU.
  const { count: activeJobs, error: countErr } = await supabase
    .schema("inference")
    .from("finetunes")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org.org_id)
    .in("status", ["queued", "preparing", "running"]);
  if (countErr) {
    return internalError("Could not check job quota", countErr, "ft_quota_check_failed");
  }
  if ((activeJobs ?? 0) >= MAX_CONCURRENT_FT_JOBS_PER_ORG) {
    return NextResponse.json(
      {
        error: `You already have ${activeJobs} fine-tuning jobs queued or running (limit ${MAX_CONCURRENT_FT_JOBS_PER_ORG}). Wait for one to finish, or contact support to raise your limit.`,
        code: "ft_concurrency_limit",
      },
      { status: 429 }
    );
  }

  const mergedHyperparams: Record<string, unknown> = {
    ...DEFAULT_HYPERPARAMS,
    ...parsed.data.hyperparams,
  };

  // ── Pre-flight validation ─────────────────────────────────────────
  // Catches ~80% of failure modes (bad URL, malformed JSONL, oversized
  // examples, too few examples) without burning a GPU-second. Errors
  // block the create; warnings flow back in the response for the UI.
  const preflight = await preflightDataset({
    datasetUrl: parsed.data.dataset_url,
    baseModelId: parsed.data.base_model_id,
    sequenceLen: (mergedHyperparams.max_seq_length as number) ?? 4096,
    epochs: (mergedHyperparams.epochs as number) ?? 3,
  });

  if (!preflight.ok) {
    return NextResponse.json(
      { error: "Dataset failed pre-flight checks", preflight },
      { status: 400 }
    );
  }

  // ── Balance gate ──────────────────────────────────────────────────
  // A fine-tune burns real GPU time, so require the org's billing account to
  // hold at least the estimated job cost before launch. Stops a job starting
  // against an empty balance and surfacing later as a surprise debt. Billed
  // to the org payer (billing_user_id), not necessarily the member launching.
  const requiredUsd = Math.max(
    (preflight.estimated_cost_cents ?? 0) / 100,
    MIN_FT_BALANCE_USD
  );
  let payerUserId = auth.user!.id;
  {
    const { data: orgRow } = await supabase
      .schema("inference")
      .from("orgs")
      .select("billing_user_id, owner_user_id")
      .eq("id", org.org_id)
      .maybeSingle();
    payerUserId = orgRow?.billing_user_id || orgRow?.owner_user_id || auth.user!.id;
  }
  const funded = await BillingCredits.hasSufficientBalance(payerUserId, requiredUsd);
  if (!funded) {
    return NextResponse.json(
      {
        error: `Insufficient credits to start this job. Estimated cost is about $${requiredUsd.toFixed(2)} — please top up and try again.`,
        code: "insufficient_credits",
        required_usd: Number(requiredUsd.toFixed(2)),
      },
      { status: 402 }
    );
  }

  const { data, error } = await supabase
    .schema("inference")
    .from("finetunes")
    .insert({
      org_id: org.org_id,
      created_by_user_id: auth.user!.id,
      name: parsed.data.name,
      base_model_id: parsed.data.base_model_id,
      method: parsed.data.method,
      hyperparams: mergedHyperparams,
      dataset_url: parsed.data.dataset_url,
      validation_dataset_url: parsed.data.validation_dataset_url ?? null,
      gpu_sku: parsed.data.gpu_sku,
      status: "queued",
    })
    .select(
      "id, name, base_model_id, method, hyperparams, status, gpu_sku, dataset_url, queued_at, created_at"
    )
    .single();

  if (error) {
    console.error("[Inference FT] insert error:", error);
    return NextResponse.json({ error: "Failed to create fine-tuning job" }, { status: 500 });
  }

  // Audit event
  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "finetune.created",
    targetType: "finetune",
    targetId: data.id,
    metadata: {
      name: data.name,
      base_model_id: data.base_model_id,
      method: data.method,
      gpu_sku: data.gpu_sku,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  // Push to the BullMQ queue so the ft-runner claims it immediately. If
  // REDIS_URL isn't configured or Redis is down this no-ops — the runner's
  // 5s Postgres claimer poll picks it up either way.
  void enqueueFinetuneJob(data.id);

  return NextResponse.json(
    { success: true, data, preflight },
    { status: 201 }
  );
}
