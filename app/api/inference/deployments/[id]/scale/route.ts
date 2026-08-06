/**
 * POST /api/inference/deployments/[id]/scale — update autoscale config
 *
 * Updates the row's autoscale jsonb and enqueues a scale action for the
 * deploy-runner to apply against the live RunPod endpoint. The actual
 * PATCH on RunPod happens in the runner so we don't block the user on the
 * RunPod API.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";
import { enqueueDeploymentJob } from "@/lib/inference/deploy-queue";

const scaleSchema = z
  .object({
    min_workers: z.number().int().min(0).max(50),
    max_workers: z.number().int().min(1).max(50),
    idle_timeout_s: z.number().int().min(5).max(3600),
  })
  .refine((v) => v.min_workers <= v.max_workers, {
    message: "min_workers must be <= max_workers",
  });

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await controlPlaneAuth(request, { session: "cookie", org: "bootstrap", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid deployment id" }, { status: 400 });
  }

  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-deploy-scale",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const body = await request.json();
  const parsed = scaleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const org = { org_id: auth.orgId, role: auth.orgRole, org_name: auth.orgName, org_slug: auth.orgSlug };
  if (auth.via === "session" && org.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot scale deployments" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: existing } = await supabase
    .schema("inference")
    .from("deployments")
    .select("id, name, org_id, status, endpoint_id:runpod_endpoint_id")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      name: string;
      org_id: string;
      status: string;
      endpoint_id: string | null;
    }>();

  if (!existing || existing.org_id !== org.org_id) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }
  if (existing.status === "deleted") {
    return NextResponse.json({ error: "Deployment is deleted" }, { status: 409 });
  }

  const { error: updateErr } = await supabase
    .schema("inference")
    .from("deployments")
    .update({ autoscale: parsed.data })
    .eq("id", id);

  if (updateErr) {
    console.error("[Inference Deploy] scale update error:", updateErr);
    return NextResponse.json({ error: "Failed to update autoscale" }, { status: 500 });
  }

  // Audit
  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.userId,
    action: "deployment.updated",
    targetType: "deployment",
    targetId: id,
    metadata: { name: existing.name, autoscale: parsed.data },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  // Tell the runner to PATCH RunPod (no-op if endpoint not yet provisioned —
  // the runner will pick up the new config on next create attempt)
  if (existing.endpoint_id) {
    void enqueueDeploymentJob(id, "scale");
  }

  return NextResponse.json({ success: true, autoscale: parsed.data });
}
