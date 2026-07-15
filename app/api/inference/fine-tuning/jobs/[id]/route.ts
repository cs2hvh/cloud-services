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
import { RunPodClient } from "@/lib/services/runpod/client";
import { chargeFinetuneUsage, computeFinetuneCostCents } from "@/lib/inference/finetune-billing";

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

/** Tear down a cancelled job's GPU pod from the control plane. Best-effort +
 *  logged — the ft-runner monitor + watchdog are backstops, but doing it here
 *  means teardown doesn't depend on the worker monitor being alive. */
async function terminateFinetunePod(podId: string, jobId: string): Promise<void> {
  try {
    await RunPodClient.rest("DELETE", `/pods/${podId}`);
    console.log(`[FT cancel] terminated pod ${podId} for job ${jobId}`);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "NOT_FOUND") return;
    console.error(`[FT cancel] FAILED to terminate pod ${podId} for job ${jobId}:`, err);
  }
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
    .select("id, name, status, pod_id:runpod_job_id, hourly_cost_cents, started_at")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<{
      id: string;
      name: string;
      status: string;
      pod_id: string | null;
      hourly_cost_cents: number | null;
      started_at: string | null;
    }>();

  if (!existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (!["queued", "preparing", "running"].includes(existing.status)) {
    return NextResponse.json(
      { error: `Job is in state "${existing.status}" and cannot be cancelled` },
      { status: 400 }
    );
  }

  // Cost still applies: if the pod ever started, RunPod billed us for every
  // second it was up regardless of who stopped it or why (found live,
  // 2026-07-15 — this path used to cancel for free, same "GPU time consumed,
  // never charged" gap the webhook's failure path already closes). No
  // started_at means the job never left the queue — nothing was ever billed
  // (confirmed: ft-runner sets started_at in the same write that flips status
  // to 'preparing', workers/ft-runner/src/lifecycle.ts:62-63, so there's no
  // window where the pod is up but started_at is still null) —
  // computeFinetuneCostCents' own trainingSeconds<=0 guard returns 0 for that
  // case, so this is safe to always compute rather than branch on it.
  // Rounded to a whole second — training_seconds is an INTEGER column
  // (20260523000001_create_inference_schema.sql:449) and Date.now() math
  // almost never lands on an exact 1000ms boundary; an unrounded float here
  // would fail the UPDATE below on essentially every real cancel.
  const elapsedSeconds = existing.started_at
    ? Math.max(0, Math.round((Date.now() - new Date(existing.started_at).getTime()) / 1000))
    : 0;
  const costCents = computeFinetuneCostCents(existing.hourly_cost_cents, elapsedSeconds);

  // Atomic-win transition — same pattern the webhook uses, so a cancel
  // racing a concurrent webhook/watchdog terminal transition can only charge
  // once (whichever call actually flips the status out of queued/preparing/
  // running; the loser matches zero rows and skips billing entirely). Checks
  // `error` explicitly (unlike a bare `{data: won}`) so a genuine DB failure
  // is logged and reported as a 500, not silently collapsed into the same
  // 409 a legitimate lost race returns.
  const { data: won, error: cancelErr } = await supabase
    .schema("inference")
    .from("finetunes")
    .update({
      status: "cancelled",
      training_seconds: elapsedSeconds,
      cost_cents: costCents,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("org_id", org.org_id)
    .in("status", ["queued", "preparing", "running"])
    .select("id")
    .maybeSingle();

  if (cancelErr) {
    console.error("[Inference FT] cancel transition error:", cancelErr);
    return NextResponse.json({ error: "Failed to cancel job" }, { status: 500 });
  }
  if (!won) {
    return NextResponse.json({ error: "Job was already in a terminal state" }, { status: 409 });
  }

  if (costCents > 0) {
    await chargeFinetuneUsage(supabase, org.org_id, id, existing.name, costCents, elapsedSeconds);
  }

  // Tear the GPU pod down now from the control plane. The ft-runner monitor
  // also reacts to status='cancelled', but doing it here means a cancelled job
  // stops billing immediately even if the worker monitor was orphaned (e.g. by
  // a rollout). Fire-and-forget; the watchdog is the final backstop.
  if (existing.pod_id) void terminateFinetunePod(existing.pod_id, id);

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
      pod_id: existing.pod_id,
      cost_cents: costCents,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, cancelled_id: id, cost_cents: costCents });
}
