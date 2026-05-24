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
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";
import { preflightDataset } from "@/lib/inference/finetune-validate";
import { enqueueFinetuneJob } from "@/lib/inference/finetune-queue";

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
  gpu_sku: z
    .enum(["A100-80GB", "A100-40GB", "H100-80GB", "L40S", "A40", "RTX-6000-Ada"])
    .default("A100-80GB"),
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Org resolution failed" },
      { status: 500 }
    );
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
      "id, name, base_model_id, method, hyperparams, dataset_url, validation_dataset_url, status, gpu_sku, runpod_job_id, output_model_id, output_artifact_url, training_seconds, cost_cents, error_message, queued_at, started_at, completed_at, created_at, updated_at"
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Org resolution failed" },
      { status: 500 }
    );
  }
  if (org.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot create fine-tuning jobs" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

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
