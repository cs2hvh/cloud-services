/**
 * GET  /api/inference/deployments — list active org's BYO deployments
 * POST /api/inference/deployments — create a new deployment from docker/HF/truss
 *
 * A created deployment lands in status='building'. The deploy-runner
 * (workers/deploy-runner/, Phase 6.G) picks it up via BullMQ, provisions a
 * RunPod Serverless endpoint, polls until READY, registers the resulting
 * model in inference.models with serving_type='runpod_byo', then flips the
 * row to status='active'.
 *
 * Until the deploy-runner ships, rows sit in 'building' indefinitely —
 * the dashboard already handles that gracefully.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { actingUserId, controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";
import { preflightDeployment } from "@/lib/inference/deploy-validate";
import { enqueueDeploymentJob } from "@/lib/inference/deploy-queue";
import { internalError } from "@/lib/inference/api-errors";
import { customerSafeErrorMessage } from "@/lib/inference/error-messages";
import { encryptAesGcm } from "@/lib/inference/crypto";

const createSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, "Use letters, digits, hyphens, underscores"),
  source: z.enum(["docker", "huggingface", "truss"]),
  source_ref: z.string().min(1).max(500),
  source_revision: z.string().max(200).optional().nullable(),
  // Verbatim RunPod gpuTypeId (gpu_catalog.runpod_gpu_id), validated against
  // the live catalog below. Legacy short SKUs are still accepted for back-compat.
  gpu_sku: z.string().min(1, "Select a GPU"),
  autoscale: z
    .object({
      min_workers: z.number().int().min(0).max(50).default(0),
      max_workers: z.number().int().min(1).max(50).default(4),
      idle_timeout_s: z.number().int().min(5).max(3600).default(60),
    })
    .default({ min_workers: 0, max_workers: 4, idle_timeout_s: 60 })
    .refine(
      (v) => v.min_workers <= v.max_workers,
      "min_workers must be <= max_workers"
    ),
  /** Optional Hugging Face token — only meaningful when source =
   *  'huggingface'. Required in practice for gated bases (most Meta +
   *  Google models). Encrypted server-side before persisting; never
   *  echoed back in any list/get response. */
  hf_token: z.string().min(1).max(200).optional(),
});

export async function GET(request: NextRequest) {
  const authResult = await controlPlaneAuth(request, { session: "cookie", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-deploy-list",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole, org_name: auth.orgName, org_slug: auth.orgSlug };

  const statusFilter = request.nextUrl.searchParams.get("status");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  let q = supabase
    .schema("inference")
    .from("deployments")
    .select(
      "id, name, source, source_ref, source_revision, gpu_sku, autoscale, status, endpoint_id:runpod_endpoint_id, image_uri, model_id, error_message, deployed_at, created_at, updated_at"
    )
    .eq("org_id", org.org_id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (statusFilter) q = q.eq("status", statusFilter);

  const { data, error } = await q;
  if (error) {
    console.error("[Inference Deploy] list error:", error);
    return NextResponse.json({ error: "Failed to list deployments" }, { status: 500 });
  }

  // Sanitize error_message before handing rows to the customer — covers
  // back-compat for older rows that may contain leaky upstream copy.
  const sanitized = (data ?? []).map((row) => ({
    ...row,
    error_message: row.error_message ? customerSafeErrorMessage(row.error_message) : null,
  }));

  return NextResponse.json({
    success: true,
    org: { id: org.org_id, slug: org.org_slug, name: org.org_name, role: org.role },
    data: sanitized,
  });
}

export async function POST(request: NextRequest) {
  const authResult = await controlPlaneAuth(request, { session: "cookie", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-deploy-create",
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

  const org = { org_id: auth.orgId, role: auth.orgRole, org_name: auth.orgName, org_slug: auth.orgSlug };
  if (auth.via === "session" && org.role === "viewer") {
    return NextResponse.json(
      { error: "Viewers cannot create deployments" },
      { status: 403 }
    );
  }

  // Source-specific gating ─────────────────────────────────────────
  //
  // docker     → fully supported by the deploy-runner.
  // huggingface → supported via the runtime-materialization shortcut
  //               (runpod/worker-vllm + MODEL_NAME + HF_TOKEN env);
  //               token optional at API layer but practically required
  //               for gated bases.
  // truss      → DEFERRED — needs a real OCI builder. Reject at the
  //               API boundary so the row never enters 'building' and
  //               then sits in 'failed' for the user.
  if (parsed.data.source === "truss") {
    return NextResponse.json(
      {
        error:
          "Truss source not yet supported. Build your Truss bundle locally with " +
          "`truss build`, push the resulting image to a public registry, then " +
          "deploy here with source = 'docker'. Native Truss support is on the roadmap.",
      },
      { status: 400 }
    );
  }
  if (parsed.data.source !== "huggingface" && parsed.data.hf_token) {
    return NextResponse.json(
      { error: "hf_token is only meaningful when source = 'huggingface'" },
      { status: 400 }
    );
  }

  // Encrypt the HF token at create time so the plaintext never sits in
  // the BullMQ payload. The deploy-runner decrypts with the shared
  // BYOK_DEK at endpoint-provision time.
  let hfTokenEncrypted: string | null = null;
  if (parsed.data.source === "huggingface" && parsed.data.hf_token) {
    const dek = process.env.BYOK_DEK;
    if (!dek) {
      return internalError(
        "BYOK_DEK not configured on the dashboard process",
        new Error("BYOK_DEK missing"),
        "byok_dek_missing"
      );
    }
    try {
      const cipher = await encryptAesGcm(parsed.data.hf_token, dek);
      hfTokenEncrypted = Buffer.from(cipher).toString("base64");
    } catch (err) {
      return internalError("Could not encrypt HF token", err, "hf_token_encrypt_failed");
    }
  }

  // ── Pre-flight ─────────────────────────────────────────────────
  const preflight = await preflightDeployment({
    source: parsed.data.source,
    source_ref: parsed.data.source_ref,
    source_revision: parsed.data.source_revision ?? null,
  });

  if (!preflight.ok) {
    return NextResponse.json(
      { error: "Source failed pre-flight checks", preflight },
      { status: 400 }
    );
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
  const LEGACY_GPU_SKUS = new Set([
    "A100-80GB",
    "A100-40GB",
    "H100-80GB",
    "L40S",
    "A40",
    "RTX-6000-Ada",
  ]);
  if (!LEGACY_GPU_SKUS.has(parsed.data.gpu_sku)) {
    const { data: gpuRow, error: gpuErr } = await supabase
      .from("gpu_catalog")
      .select("runpod_gpu_id")
      .eq("runpod_gpu_id", parsed.data.gpu_sku)
      .eq("is_active", true)
      .maybeSingle();
    if (gpuErr) {
      return internalError("Could not validate GPU selection", gpuErr, "deploy_gpu_validate_failed");
    }
    if (!gpuRow) {
      return NextResponse.json(
        { error: "That GPU is not available. Pick one from the list." },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabase
    .schema("inference")
    .from("deployments")
    .insert({
      org_id: org.org_id,
      created_by_user_id: (await actingUserId(auth))!,
      name: parsed.data.name,
      source: parsed.data.source,
      source_ref: parsed.data.source_ref,
      source_revision: parsed.data.source_revision ?? null,
      gpu_sku: parsed.data.gpu_sku,
      autoscale: parsed.data.autoscale,
      image_uri: preflight.resolved_image_uri,
      status: "building",
      hf_token_encrypted: hfTokenEncrypted,
    })
    .select(
      "id, name, source, source_ref, gpu_sku, autoscale, status, image_uri, created_at"
    )
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `Deployment named "${parsed.data.name}" already exists in this org` },
        { status: 409 }
      );
    }
    console.error("[Inference Deploy] insert error:", error);
    return NextResponse.json({ error: "Failed to create deployment" }, { status: 500 });
  }

  // Audit
  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.userId,
    action: "deployment.created",
    targetType: "deployment",
    targetId: data.id,
    metadata: {
      name: data.name,
      source: data.source,
      source_ref: data.source_ref,
      gpu_sku: data.gpu_sku,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  // Best-effort enqueue (deploy-runner DB-poll picks it up either way)
  void enqueueDeploymentJob(data.id, "create");

  return NextResponse.json({ success: true, data, preflight }, { status: 201 });
}
