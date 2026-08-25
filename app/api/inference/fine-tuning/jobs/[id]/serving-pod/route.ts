/**
 * POST   /api/inference/fine-tuning/jobs/[id]/serving-pod
 *   Provision a dedicated GPU instance to serve this fine-tune's adapter.
 *   Body: { gpu_sku: "A40" | "L40S" | "A100-80GB" | ... }
 *
 * GET    /api/inference/fine-tuning/jobs/[id]/serving-pod
 *   Current live state of the pod (refreshed from the upstream provider).
 *
 * DELETE /api/inference/fine-tuning/jobs/[id]/serving-pod
 *   Stop and tear down the pod. Returns immediately; pod actually exits
 *   asynchronously upstream. Clears routing on inference.models so the
 *   gateway falls back to the self-serve redirect on next request.
 *
 * Auth: any org member of the FT's org (read), admins/owners + the FT's
 * creator can mutate (provision / stop). Per Tier 1 product spec: this
 * is meant to be customer self-service.
 *
 * Brand discipline: no error message or response field ever names the
 * upstream provider. See lib/inference/serving-pod.ts:sanitizeProvisionError.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { actingUserId, controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { BillingCredits } from "@/lib/billing/credits";
import { limitByUser } from "@/lib/cooldown/userbased";
import {
  provisionServingPod,
  getServingPodStatus,
  terminateServingPod,
  sanitizeProvisionError,
} from "@/lib/inference/serving-pod";
import { settleServingPod } from "@/lib/inference/serving-pod-billing";
import { GPU_SKU_TO_RUNPOD_TYPE } from "@/lib/inference/finetune-runpod";

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

const provisionSchema = z.object({
  gpu_sku: z.string().refine((v) => v in GPU_SKU_TO_RUNPOD_TYPE, {
    message: "Unknown GPU size",
  }),
  /** Optional override for auto-stop window (hours, 1-72). Defaults to 6h. */
  auto_stop_hours: z.number().int().min(1).max(72).optional(),
});

// Minimum credits (USD) required to start a dedicated serving instance —
// roughly an hour of a serving GPU. Auto-stop + metering bound the rest.
const MIN_SERVING_BALANCE_USD = 2;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

interface FtRow {
  id: string;
  org_id: string;
  status: string;
  base_model_id: string;
  output_model_id: string | null;
  output_artifact_url: string | null;
  serving_pod_id: string | null;
  serving_pod_state: string | null;
  serving_pod_gpu_sku: string | null;
  serving_pod_started_at: string | null;
  serving_pod_stopped_at: string | null;
  serving_pod_hourly_cents: number | null;
  serving_pod_auto_stop_at: string | null;
  serving_pod_error_message: string | null;
  serving_url: string | null;
  is_managed: boolean | null;
}

async function loadFt(supabase: Sb, jobId: string, orgId: string): Promise<FtRow | null> {
  const { data } = await supabase
    .schema("inference")
    .from("finetunes")
    .select(
      "id, org_id, status, base_model_id, output_model_id, output_artifact_url, serving_pod_id, serving_pod_state, serving_pod_gpu_sku, serving_pod_started_at, serving_pod_stopped_at, serving_pod_hourly_cents, serving_pod_auto_stop_at, serving_pod_error_message, serving_url, is_managed"
    )
    .eq("id", jobId)
    .eq("org_id", orgId)
    .maybeSingle();
  return (data as FtRow | null) ?? null;
}

function serializePod(ft: FtRow) {
  // Customer-facing shape. No vendor names; no opaque ids.
  return {
    state: ft.serving_pod_state ?? "none",
    gpu_sku: ft.serving_pod_gpu_sku,
    hourly_cost_cents: ft.serving_pod_hourly_cents,
    started_at: ft.serving_pod_started_at,
    stopped_at: ft.serving_pod_stopped_at,
    auto_stop_at: ft.serving_pod_auto_stop_at,
    error: ft.serving_pod_error_message,
    is_managed: !!ft.is_managed,
  };
}

// ─── GET ───────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await controlPlaneAuth(request, { session: "cookie", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

  const org = { org_id: auth.orgId, role: auth.orgRole };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const ft = await loadFt(supabase, id, org.org_id);
  if (!ft) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // If we think a pod exists, freshen its state from upstream so the
  // dashboard reflects reality without a manual refresh.
  if (ft.serving_pod_id && (ft.serving_pod_state === "provisioning" || ft.serving_pod_state === "running")) {
    try {
      const live = await getServingPodStatus(ft.serving_pod_id);
      if (live.state === "gone") {
        // Pod was killed out-of-band (auto-stop watchdog, upstream eviction,
        // or operator console). Reflect locally.
        await supabase
          .schema("inference")
          .from("finetunes")
          .update({
            serving_pod_state: "stopped",
            serving_pod_stopped_at: new Date().toISOString(),
            serving_url: null,
            is_managed: false,
          })
          .eq("id", id);
        if (ft.output_model_id) {
          await supabase
            .schema("inference")
            .from("models")
            .update({ serving_url: null, is_managed: false })
            .eq("id", ft.output_model_id);
        }
        const refreshed = await loadFt(supabase, id, org.org_id);
        return NextResponse.json(refreshed ? serializePod(refreshed) : serializePod(ft));
      }
      // Promote provisioning → running once upstream confirms
      if (live.state === "running" && ft.serving_pod_state !== "running") {
        await supabase
          .schema("inference")
          .from("finetunes")
          .update({ serving_pod_state: "running" })
          .eq("id", id);
        ft.serving_pod_state = "running";
      }
    } catch (err) {
      // Don't fail the GET on an upstream blip; serve cached state.
      console.warn("[serving-pod GET] upstream status check failed:", err);
    }
  }

  return NextResponse.json(serializePod(ft));
}

// ─── POST (provision) ──────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await controlPlaneAuth(request, { session: "cookie", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

  // Light rate-limit. Provisioning is expensive — guard against accidental
  // double-clicks from the dashboard or rogue script.
  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-ft-serving-provision",
    limit: 6,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };
  if (auth.via === "session" && org.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot start serving instances" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = provisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const ft = await loadFt(supabase, id, org.org_id);
  if (!ft) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (ft.status !== "completed") {
    return NextResponse.json(
      { error: `Cannot start serving on a job in status "${ft.status}"` },
      { status: 409 }
    );
  }
  if (!ft.output_artifact_url || !ft.output_model_id) {
    return NextResponse.json(
      {
        error:
          "This fine-tune isn't ready to serve yet. The training output hasn't been registered. Wait a moment and try again.",
      },
      { status: 409 }
    );
  }
  if (ft.serving_pod_id && ft.serving_pod_state !== "stopped" && ft.serving_pod_state !== "failed") {
    return NextResponse.json(
      { error: `A serving instance is already ${ft.serving_pod_state}. Stop it before starting a new one.` },
      { status: 409 }
    );
  }

  // ── Balance gate ──────────────────────────────────────────────────
  // Serving runs a dedicated GPU by the hour. Require the org's billing
  // account to hold a starting minimum before we provision, so a pod can't
  // spin up against an empty balance. Auto-stop bounds the ongoing spend.
  {
    const { data: orgRow } = await supabase
      .schema("inference")
      .from("orgs")
      .select("billing_user_id, owner_user_id")
      .eq("id", org.org_id)
      .maybeSingle();
    const payerUserId = orgRow?.billing_user_id || orgRow?.owner_user_id || auth.userId;
    const funded = await BillingCredits.hasSufficientBalance(payerUserId, MIN_SERVING_BALANCE_USD);
    if (!funded) {
      return NextResponse.json(
        {
          error: `You need at least $${MIN_SERVING_BALANCE_USD.toFixed(2)} in credits to start a serving instance. Please top up and try again.`,
          code: "insufficient_credits",
          required_usd: MIN_SERVING_BALANCE_USD,
        },
        { status: 402 }
      );
    }
  }

  // Mark provisioning BEFORE the upstream call so dashboard polls see the
  // state change immediately, even if provisioning takes 30-60s upstream.
  const autoStopHours = parsed.data.auto_stop_hours ?? 6;
  const autoStopAt = new Date(Date.now() + autoStopHours * 60 * 60 * 1000).toISOString();
  await supabase
    .schema("inference")
    .from("finetunes")
    .update({
      serving_pod_state: "provisioning",
      serving_pod_gpu_sku: parsed.data.gpu_sku,
      serving_pod_started_at: new Date().toISOString(),
      serving_pod_stopped_at: null,
      serving_pod_auto_stop_at: autoStopAt,
      serving_pod_error_message: null,
    })
    .eq("id", id);

  // Mint a fresh presigned adapter URL — the pod will curl it once on boot.
  let adapterUrl: string;
  try {
    adapterUrl = await mintAdapterDownloadUrl(ft);
  } catch (err) {
    await markFailed(supabase, id, ft.output_model_id, "Could not generate adapter download URL");
    return NextResponse.json(
      { error: "Could not prepare the adapter for download" },
      { status: 500 }
    );
  }

  // Provision the pod. On failure, roll back the row to a failed state so
  // the customer can see what went wrong and try again.
  let provisioned;
  try {
    provisioned = await provisionServingPod({
      jobId: ft.id,
      baseModelId: ft.base_model_id,
      adapterDownloadUrl: adapterUrl,
      gpuSku: parsed.data.gpu_sku,
      hfToken: process.env.HUGGINGFACE_HUB_TOKEN,
    });
  } catch (err) {
    const msg = sanitizeProvisionError(err);
    console.error("[serving-pod POST] provision failed:", err);
    await markFailed(supabase, id, ft.output_model_id, msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Pod is up; record everything and flip routing live.
  await supabase
    .schema("inference")
    .from("finetunes")
    .update({
      serving_pod_id: provisioned.podId,
      serving_pod_hourly_cents: provisioned.hourlyCostCents,
      serving_url: provisioned.servingUrl,
      is_managed: true,
    })
    .eq("id", id);

  await supabase
    .schema("inference")
    .from("models")
    .update({ serving_url: provisioned.servingUrl, is_managed: true })
    .eq("id", ft.output_model_id);

  console.log(
    JSON.stringify({
      level: "info",
      message: "serving_pod.provisioned",
      orgId: org.org_id,
      userId: (await actingUserId(auth))!,
      ftId: id,
      gpuSku: parsed.data.gpu_sku,
      hourlyCents: provisioned.hourlyCostCents,
    })
  );

  const refreshed = await loadFt(supabase, id, org.org_id);
  return NextResponse.json(refreshed ? serializePod(refreshed) : serializePod(ft), { status: 201 });
}

// ─── DELETE (stop) ─────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await controlPlaneAuth(request, { session: "cookie", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-ft-serving-stop",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };
  if (auth.via === "session" && org.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot stop serving instances" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const ft = await loadFt(supabase, id, org.org_id);
  if (!ft) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (!ft.serving_pod_id) {
    return NextResponse.json({ error: "No serving instance to stop" }, { status: 409 });
  }

  // Settle billing + flip state atomically. Idempotent: the auto-stop
  // watchdog may race us; whoever wins the transition charges for the
  // uptime, and clears the gateway routing.
  const settled = await settleServingPod(supabase, id);

  // Tear down upstream (best-effort; idempotent — a 404 means already gone).
  try {
    await terminateServingPod(ft.serving_pod_id);
  } catch (err) {
    console.warn("[serving-pod DELETE] tear-down failed (will retry on next GET):", err);
  }

  console.log(
    JSON.stringify({
      level: "info",
      message: "serving_pod.stopped",
      orgId: org.org_id,
      userId: (await actingUserId(auth))!,
      ftId: id,
      chargedUsd: settled.chargedUsd,
    })
  );

  return NextResponse.json({ success: true, state: "stopped", charged_usd: settled.chargedUsd });
}

// ─── Helpers ────────────────────────────────────────────────────────

async function markFailed(supabase: Sb, jobId: string, outputModelId: string | null, msg: string) {
  await supabase
    .schema("inference")
    .from("finetunes")
    .update({
      serving_pod_state: "failed",
      serving_pod_error_message: msg,
      serving_url: null,
      is_managed: false,
    })
    .eq("id", jobId);
  if (outputModelId) {
    await supabase
      .schema("inference")
      .from("models")
      .update({ serving_url: null, is_managed: false })
      .eq("id", outputModelId);
  }
}

/**
 * Mint a short-lived presigned URL for the adapter tarball in R2.
 * Mirrors the logic in /api/inference/fine-tuning/jobs/[id]/adapter-url
 * but inlined here to avoid an HTTP round-trip from this server route.
 */
async function mintAdapterDownloadUrl(ft: FtRow): Promise<string> {
  if (!ft.output_artifact_url) throw new Error("no output_artifact_url");
  const m = ft.output_artifact_url.match(/^(r2|s3):\/\/([^/]+)\/(.+)$/);
  if (!m) throw new Error("malformed output_artifact_url");
  const bucket = m[2]!;
  const prefix = m[3]!;
  const key = prefix.endsWith("/") ? `${prefix}adapter.tar.gz` : `${prefix}/adapter.tar.gz`;

  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;
  if (!accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error("R2 credentials not configured");
  }
  const s3 = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: 6 * 3600,
  });
}
