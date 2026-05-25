/**
 * POST /api/inference/fine-tuning/jobs/[id]/webhook
 *
 * Receives completion callbacks from the training container's train.sh.
 * HMAC-verified, idempotent, applies the eval gate, registers the output
 * model in inference.models, marks the job as completed/failed.
 *
 * Authentication: HMAC-SHA256 over the raw body, header X-Ahura-Webhook-Signature.
 * Secret is FT_WEBHOOK_SECRET env var (must match what the ft-runner sets on
 * the pod's WEBHOOK_SECRET env). Without a match, returns 401.
 *
 * This endpoint is intentionally NOT user-authenticated — the HMAC is
 * the only auth. It's only ever called from inside our training pods.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";

const WEBHOOK_SECRET = process.env.FT_WEBHOOK_SECRET ?? "";

interface WebhookPayload {
  job_id: string;
  status: "completed" | "failed";
  adapter_url?: string;
  /** R2 URL of the full training.log (uploaded by train.sh post-success). */
  training_log_url?: string;
  elapsed_seconds: number;
  final_loss?: number;
  sample_outputs?: Array<{ prompt: string; output: string }>;
  error?: string;
}

/** Hourly $/hr from RunPod → final cost_cents based on actual training_seconds. */
function computeCostCents(hourlyCostCents: number | null, trainingSeconds: number): number {
  if (!hourlyCostCents || hourlyCostCents <= 0 || trainingSeconds <= 0) return 0;
  return Math.ceil((hourlyCostCents * trainingSeconds) / 3600);
}

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

function verifySignature(body: string, providedB64: string): boolean {
  if (!WEBHOOK_SECRET) return false;
  const expected = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("base64");
  // Need equal-length buffers for timingSafeEqual or it throws
  const a = Buffer.from(providedB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!WEBHOOK_SECRET) {
    console.error("[FT Webhook] FT_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Webhook receiver not configured" },
      { status: 500 }
    );
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  // Verify signature against the raw body
  const sig = request.headers.get("x-ahura-webhook-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  const body = await request.text();
  if (!verifySignature(body, sig)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(body) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.job_id !== id) {
    return NextResponse.json(
      { error: "job_id in payload doesn't match URL" },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Idempotency — if already marked completed/failed, accept and return
  const { data: existing } = await supabase
    .schema("inference")
    .from("finetunes")
    .select("id, status, org_id, base_model_id, name, hyperparams, output_model_id, hourly_cost_cents")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      status: string;
      org_id: string;
      base_model_id: string;
      name: string;
      hyperparams: Record<string, unknown>;
      output_model_id: string | null;
      hourly_cost_cents: number | null;
    }>();

  if (!existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (existing.status === "completed" || existing.status === "failed") {
    return NextResponse.json({
      ok: true,
      idempotent: true,
      already_status: existing.status,
    });
  }

  // ── Failure path ──────────────────────────────────────────────────
  // Cost still applies to failed runs — RunPod billed us for the pod-up
  // time, customer should see what they paid for.
  if (payload.status === "failed") {
    const costCents = computeCostCents(existing.hourly_cost_cents, payload.elapsed_seconds);
    await supabase
      .schema("inference")
      .from("finetunes")
      .update({
        status: "failed",
        error_message: payload.error ?? "training_container_reported_failure",
        training_seconds: payload.elapsed_seconds,
        cost_cents: costCents,
        completed_at: new Date().toISOString(),
      })
      .eq("id", id);

    // TODO Phase 7: trigger Svix customer webhook fine_tuning.job.failed
    return NextResponse.json({ ok: true, cost_cents: costCents });
  }

  // ── Success path ──────────────────────────────────────────────────
  if (!payload.adapter_url) {
    return NextResponse.json(
      { error: "Completed payload missing adapter_url" },
      { status: 400 }
    );
  }

  // EVAL GATE — compare against baseline_loss if it was recorded at pre-flight
  const baselineLoss =
    typeof (existing.hyperparams as { baseline_loss?: unknown })?.baseline_loss === "number"
      ? ((existing.hyperparams as { baseline_loss?: number }).baseline_loss as number)
      : null;

  if (
    baselineLoss !== null &&
    typeof payload.final_loss === "number" &&
    payload.final_loss > baselineLoss * 1.1
  ) {
    await supabase
      .schema("inference")
      .from("finetunes")
      .update({
        status: "failed",
        error_message: `Eval gate: final_loss ${payload.final_loss.toFixed(4)} > baseline ${baselineLoss.toFixed(4)} × 1.1. Adapter not registered (likely diverged).`,
        training_seconds: payload.elapsed_seconds,
        completed_at: new Date().toISOString(),
      })
      .eq("id", id);
    return NextResponse.json({ ok: true, gated: true });
  }

  // Smoke test: any sample_outputs at all + non-empty assistant text
  const samples = payload.sample_outputs ?? [];
  const hasUsableSample =
    samples.length > 0 &&
    samples.some((s) => typeof s.output === "string" && s.output.trim().length > 0);
  if (samples.length > 0 && !hasUsableSample) {
    await supabase
      .schema("inference")
      .from("finetunes")
      .update({
        status: "failed",
        error_message: "Eval gate: all sample generations were empty or whitespace.",
        training_seconds: payload.elapsed_seconds,
        completed_at: new Date().toISOString(),
      })
      .eq("id", id);
    return NextResponse.json({ ok: true, gated: true });
  }

  // ── Register output model in catalog ──────────────────────────────
  const baseShort = existing.base_model_id.split("/")[1] ?? existing.base_model_id;
  const shortId = id.slice(0, 8);
  const modelId = `ahura/${baseShort}:ft-${shortId}`;

  const { data: insertedModel, error: modelErr } = await supabase
    .schema("inference")
    .from("models")
    .insert({
      model_id: modelId,
      display_name: `${existing.name} (LoRA of ${baseShort})`,
      description: `Private LoRA adapter from job ${shortId}. Trained on ${existing.base_model_id}.`,
      modality: "chat",
      serving_type: "runpod_ft",
      org_id: existing.org_id,
      upstream_provider: "openrouter",
      upstream_model_id: modelId,
      runpod_endpoint_id: process.env.LORA_SERVING_ENDPOINT_ID ?? null,
      capabilities: {
        streaming: true,
        tools: true,
        json_mode: true,
        context_window: 8192,
      },
      pricing: { input_cents_per_mtok: 100, output_cents_per_mtok: 500 },
      is_active: true,
    })
    .select("id")
    .single();

  // Compute final cost from the training duration and the hourly rate we
  // recorded at provision time. Applies to both the model-registration-
  // failed branch and the happy path.
  const costCents = computeCostCents(existing.hourly_cost_cents, payload.elapsed_seconds);

  if (modelErr || !insertedModel) {
    console.error("[FT Webhook] Failed to register output model", modelErr);
    // Don't fail the webhook — mark the job as completed but log the
    // registration failure. Operator can re-register from inference.finetunes.
    await supabase
      .schema("inference")
      .from("finetunes")
      .update({
        status: "completed",
        output_artifact_url: payload.adapter_url,
        training_log_url: payload.training_log_url ?? null,
        training_seconds: payload.elapsed_seconds,
        cost_cents: costCents,
        completed_at: new Date().toISOString(),
        error_message: `WARN: model registration failed: ${modelErr?.message ?? "unknown"}`,
      })
      .eq("id", id);
    return NextResponse.json({ ok: true, model_registration_failed: true, cost_cents: costCents });
  }

  await supabase
    .schema("inference")
    .from("finetunes")
    .update({
      status: "completed",
      output_artifact_url: payload.adapter_url,
      output_model_id: insertedModel.id,
      training_log_url: payload.training_log_url ?? null,
      training_seconds: payload.elapsed_seconds,
      cost_cents: costCents,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);

  // TODO Phase 7: trigger Svix customer webhook fine_tuning.job.succeeded
  return NextResponse.json({
    ok: true,
    model_id: modelId,
    output_model_uuid: insertedModel.id,
    cost_cents: costCents,
  });
}
