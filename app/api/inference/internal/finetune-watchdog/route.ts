/**
 * POST /api/inference/internal/finetune-watchdog
 *
 * Backstop sweep for orphaned fine-tuning jobs. The ft-runner normally
 * monitors each job's heartbeat and kills stalled pods itself — but if the
 * runner process dies, a training pod can keep running (and billing us)
 * with nothing watching it. This sweep is the safety net: it finds jobs
 * stuck running/preparing with a long-stale heartbeat, terminates the GPU
 * pod, marks the job failed, and settles the GPU cost.
 *
 * Thresholds are intentionally generous (30 min) so this NEVER races the
 * runner's own stall detection (90s × 3) — it only fires when the runner is
 * genuinely gone. Boot grace is ~10-15 min, so 30 min also safely covers
 * jobs that are stuck in `preparing` having never sent a first heartbeat.
 *
 * Auth: header `X-Ahura-Internal-Token: <BATCH_PROCESSOR_TOKEN>` — same trust
 * boundary as the serving-pod watchdog. Schedule it the same way (every
 * few minutes via the CF Cron Worker / k8s CronJob / curl).
 *
 * Idempotency: each job is reaped by *winning* the atomic transition to
 * `failed` (UPDATE matches only non-terminal rows). A concurrent sweep — or a
 * late completion webhook — that loses the transition does nothing and never
 * double-charges.
 *
 * Returns: { scanned, reaped, errors, errors_detail }.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { RunPodClient } from "@/lib/services/runpod/client";
import { chargeFinetuneUsage } from "@/lib/inference/finetune-billing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Minutes a job may go without a heartbeat (or sit in preparing) before the
// backstop reaps it. Generous so it can't race the runner's own monitoring.
const REAP_STALE_MINUTES = Number(process.env.FT_REAP_STALE_MINUTES ?? 30);

const CANCELLED_MESSAGE =
  "Training stopped responding and was cancelled. Re-run the job; if it repeats, try a different GPU size or contact support.";

interface StuckRow {
  id: string;
  org_id: string;
  name: string;
  runpod_job_id: string | null;
  hourly_cost_cents: number | null;
  started_at: string | null;
  created_at: string | null;
}

/** Terminate a training pod by id; a 404 (already gone) is success. */
async function terminatePod(podId: string): Promise<void> {
  try {
    await RunPodClient.rest("DELETE", `/pods/${podId}`);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "NOT_FOUND") return;
    throw err;
  }
}

export async function POST(request: NextRequest) {
  const token = request.headers.get("x-ahura-internal-token");
  const expected = process.env.BATCH_PROCESSOR_TOKEN;
  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const now = Date.now();
  const staleIso = new Date(now - REAP_STALE_MINUTES * 60_000).toISOString();

  // Active jobs whose heartbeat is long-stale, or which never sent one and
  // have been around longer than the threshold (stuck in preparing).
  const { data: rows, error } = await supabase
    .schema("inference")
    .from("finetunes")
    .select("id, org_id, name, runpod_job_id, hourly_cost_cents, started_at, created_at")
    .in("status", ["preparing", "running"])
    .or(`last_heartbeat_at.lt.${staleIso},and(last_heartbeat_at.is.null,created_at.lt.${staleIso})`)
    .limit(50)
    .returns<StuckRow[]>();

  if (error) {
    console.error("[ft-watchdog] scan failed:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }

  let reaped = 0;
  let errors = 0;
  const errDetails: Array<{ id: string; msg: string }> = [];

  for (const row of rows ?? []) {
    try {
      const startMs = row.started_at
        ? Date.parse(row.started_at)
        : row.created_at
          ? Date.parse(row.created_at)
          : now;
      const elapsedSeconds = Math.max(0, Math.round((now - startMs) / 1000));
      const hourly = Number(row.hourly_cost_cents) || 0;
      const costCents = hourly > 0 ? Math.ceil((hourly * elapsedSeconds) / 3600) : 0;

      // Win the terminal transition atomically — only the sweep that flips the
      // job out of a non-terminal state reaps + charges it.
      const { data: won } = await supabase
        .schema("inference")
        .from("finetunes")
        .update({
          status: "failed",
          error_message: CANCELLED_MESSAGE,
          training_seconds: elapsedSeconds,
          cost_cents: costCents,
          completed_at: new Date(now).toISOString(),
        })
        .eq("id", row.id)
        .in("status", ["preparing", "running"])
        .select("id")
        .maybeSingle();
      if (!won) continue; // a concurrent sweep or the webhook already finalized it

      // Tear down the orphaned pod (best-effort; 404 = already gone).
      if (row.runpod_job_id) {
        await terminatePod(row.runpod_job_id);
      }

      // Settle the GPU cost through the shared path (exactly-once: we won above).
      await chargeFinetuneUsage(supabase, row.org_id, row.id, row.name, costCents, elapsedSeconds);
      reaped++;

      console.log(
        JSON.stringify({
          level: "info",
          message: "finetune.reaped",
          orgId: row.org_id,
          ftId: row.id,
          podId: row.runpod_job_id,
          elapsedSeconds,
          costCents,
        })
      );
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      errDetails.push({ id: row.id, msg });
      console.error(`[ft-watchdog] reap failed for ft ${row.id}:`, err);
    }
  }

  return NextResponse.json({
    scanned: rows?.length ?? 0,
    reaped,
    errors,
    errors_detail: errDetails,
  });
}
