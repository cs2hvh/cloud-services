/**
 * GET    /api/inference/deployments/[id] — detail (with current RunPod state, if endpoint is up)
 * DELETE /api/inference/deployments/[id] — tear down (terminate RunPod endpoint + mark deleted)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";
import { enqueueDeploymentJob } from "@/lib/inference/deploy-queue";
import { customerSafeErrorMessage } from "@/lib/inference/error-messages";

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

export async function GET(
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
    prefix: "rl:inf-deploy-detail",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole, org_name: auth.orgName, org_slug: auth.orgSlug };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("deployments")
    .select(
      "id, name, source, source_ref, source_revision, gpu_sku, autoscale, status, endpoint_id:runpod_endpoint_id, image_uri, build_log_url, model_id, error_message, deployed_at, created_at, updated_at, org_id"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[Inference Deploy] get error:", error);
    return NextResponse.json({ error: "Failed to load deployment" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }
  if (data.org_id !== org.org_id) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }

  // Sanitize error_message before handing it to the customer (back-compat
  // for rows written by older code paths that may have leaked upstream copy).
  const sanitized = {
    ...data,
    error_message: data.error_message ? customerSafeErrorMessage(data.error_message) : null,
  };
  return NextResponse.json({ success: true, data: sanitized });
}

export async function DELETE(
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
    prefix: "rl:inf-deploy-delete",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole, org_name: auth.orgName, org_slug: auth.orgSlug };
  if (auth.via === "session" && org.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot delete deployments" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Mark deleted in DB first — the actual RunPod endpoint teardown happens
  // asynchronously via the deploy-runner so we don't block the request on a
  // possibly-slow RunPod API call.
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

  if (!existing) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }
  if (existing.org_id !== org.org_id) {
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  }
  if (existing.status === "deleted") {
    return NextResponse.json({ success: true, already_deleted: true });
  }

  const { error: updateErr } = await supabase
    .schema("inference")
    .from("deployments")
    .update({
      status: existing.endpoint_id ? "paused" : "deleted",
      error_message: existing.endpoint_id
        ? "Tear-down in progress — workers stop billing within ~30s."
        : null,
    })
    .eq("id", id);

  if (updateErr) {
    console.error("[Inference Deploy] delete update error:", updateErr);
    return NextResponse.json({ error: "Failed to mark deletion" }, { status: 500 });
  }

  // Audit
  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.userId,
    action: "deployment.deleted",
    targetType: "deployment",
    targetId: id,
    metadata: { name: existing.name, endpoint_id: existing.endpoint_id },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  // Tell the runner to tear down the RunPod endpoint
  if (existing.endpoint_id) {
    void enqueueDeploymentJob(id, "delete");
  }

  return NextResponse.json({ success: true });
}
