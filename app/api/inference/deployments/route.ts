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
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";
import { preflightDeployment } from "@/lib/inference/deploy-validate";
import { enqueueDeploymentJob } from "@/lib/inference/deploy-queue";

const createSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, "Use letters, digits, hyphens, underscores"),
  source: z.enum(["docker", "huggingface", "truss"]),
  source_ref: z.string().min(1).max(500),
  source_revision: z.string().max(200).optional().nullable(),
  gpu_sku: z
    .enum(["A100-80GB", "A100-40GB", "H100-80GB", "L40S", "A40", "RTX-6000-Ada"])
    .default("A100-80GB"),
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
});

export async function GET(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-deploy-list",
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
    .from("deployments")
    .select(
      "id, name, source, source_ref, source_revision, gpu_sku, autoscale, status, runpod_endpoint_id, image_uri, model_id, error_message, deployed_at, created_at, updated_at"
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
    return NextResponse.json(
      { error: "Viewers cannot create deployments" },
      { status: 403 }
    );
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

  const { data, error } = await supabase
    .schema("inference")
    .from("deployments")
    .insert({
      org_id: org.org_id,
      created_by_user_id: auth.user!.id,
      name: parsed.data.name,
      source: parsed.data.source,
      source_ref: parsed.data.source_ref,
      source_revision: parsed.data.source_revision ?? null,
      gpu_sku: parsed.data.gpu_sku,
      autoscale: parsed.data.autoscale,
      image_uri: preflight.resolved_image_uri,
      status: "building",
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
    actorUserId: auth.user!.id,
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
