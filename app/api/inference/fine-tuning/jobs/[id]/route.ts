/**
 * GET    /api/inference/fine-tuning/jobs/[id] — job details
 * DELETE /api/inference/fine-tuning/jobs/[id] — cancel (queued/running only)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("finetunes")
    .select("*")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Job not found in this org" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-ft-cancel",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });
  if (org.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot cancel jobs" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Only cancel from queued/preparing/running states
  const { data: existing } = await supabase
    .schema("inference")
    .from("finetunes")
    .select("id, name, status, runpod_job_id")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<{ id: string; name: string; status: string; runpod_job_id: string | null }>();

  if (!existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (!["queued", "preparing", "running"].includes(existing.status)) {
    return NextResponse.json(
      { error: `Job is in state "${existing.status}" and cannot be cancelled` },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .schema("inference")
    .from("finetunes")
    .update({
      status: "cancelled",
      completed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("org_id", org.org_id);

  if (error) {
    console.error("[Inference FT] cancel error:", error);
    return NextResponse.json({ error: "Failed to cancel job" }, { status: 500 });
  }

  // TODO (Phase 5.B): signal the BullMQ runner to terminate the RunPod pod
  // if one was already provisioned. For now the runner is responsible for
  // re-checking the DB status before each long-running step.

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "finetune.cancelled",
    targetType: "finetune",
    targetId: id,
    metadata: {
      name: existing.name,
      previous_status: existing.status,
      runpod_job_id: existing.runpod_job_id,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, cancelled_id: id });
}
