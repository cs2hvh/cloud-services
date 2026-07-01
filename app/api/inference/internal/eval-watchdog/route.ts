/**
 * POST /api/inference/internal/eval-watchdog
 *
 * Backstop sweep for orphaned eval runs. The eval-runner claims a run
 * (queued → running) and bumps `heartbeat_at` after every batch — but if the
 * runner process dies mid-run, the row is left stuck in `running` forever and
 * the claimer (which only scans `queued`) will never touch it again.
 *
 * This sweep is the safety net: it finds runs stuck in `running` with a
 * long-stale heartbeat (or which never sent one and have been around longer
 * than the threshold) and marks them `failed` so the operator sees the failure
 * and can re-run. Unlike the finetune watchdog there is NO pod to terminate and
 * NO GPU cost to settle — an eval run is just gateway HTTP calls that already
 * self-metered through the usage path — so this is a pure status flip.
 *
 * Thresholds are intentionally generous (15 min) so this NEVER races a live
 * runner: a healthy run touches its heartbeat at most ~2 min apart (batch of
 * CONCURRENT_CASES cases, each bounded by CASE_TIMEOUT_MS), so 15 min only
 * fires when the runner is genuinely gone.
 *
 * Auth: header `X-Ahura-Internal-Token: <BATCH_PROCESSOR_TOKEN>` — same trust
 * boundary as the finetune / serving-pod watchdogs. Scheduled the same way
 * (every few minutes via the CF Cron Worker).
 *
 * Idempotency: each run is reaped by *winning* the atomic transition to
 * `failed` (UPDATE matches only rows still in `running`). A concurrent sweep —
 * or a late completion from the runner — that loses the transition does
 * nothing.
 *
 * Returns: { scanned, reaped, errors, errors_detail }.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Minutes a run may go without a heartbeat before the backstop reaps it.
// Generous so it can't race the runner's own per-batch heartbeat.
const REAP_STALE_MINUTES = Number(process.env.EVAL_REAP_STALE_MINUTES ?? 15);

const CANCELLED_MESSAGE =
  "The eval run stopped responding and was cancelled. Re-run it; if it repeats, contact support.";

interface StuckRow {
  id: string;
  org_id: string;
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

  // Runs stuck `running` whose heartbeat is long-stale, or which never sent one
  // and were created longer ago than the threshold.
  const { data: rows, error } = await supabase
    .schema("inference")
    .from("eval_runs")
    .select("id, org_id")
    .eq("status", "running")
    .or(`heartbeat_at.lt.${staleIso},and(heartbeat_at.is.null,created_at.lt.${staleIso})`)
    .limit(50)
    .returns<StuckRow[]>();

  if (error) {
    console.error("[eval-watchdog] scan failed:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }

  let reaped = 0;
  let errors = 0;
  const errDetails: Array<{ id: string; msg: string }> = [];

  for (const row of rows ?? []) {
    try {
      // Win the terminal transition atomically — only the sweep that flips the
      // run out of `running` reaps it.
      const { data: won } = await supabase
        .schema("inference")
        .from("eval_runs")
        .update({ status: "failed", error: CANCELLED_MESSAGE })
        .eq("id", row.id)
        .eq("status", "running")
        .select("id")
        .maybeSingle();
      if (!won) continue; // a concurrent sweep or the runner already finalized it

      reaped++;
      console.log(
        JSON.stringify({
          level: "info",
          message: "eval.reaped",
          orgId: row.org_id,
          runId: row.id,
        })
      );
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      errDetails.push({ id: row.id, msg });
      console.error(`[eval-watchdog] reap failed for run ${row.id}:`, err);
    }
  }

  return NextResponse.json({
    scanned: rows?.length ?? 0,
    reaped,
    errors,
    errors_detail: errDetails,
  });
}
