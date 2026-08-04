/**
 * POST /api/agents/internal/run-reaper
 *
 * Backstop sweep for orphaned agentcore runs. The agent-runner claims a run
 * (queued → running) and bumps `heartbeat_at` after every step — but if the
 * runner process dies mid-run, the row is stuck in `running` forever (the
 * claimer only scans `queued`). Separately, any run may sit past its
 * `expires_at` (30-min wall clock by default) and must be reaped.
 *
 * This sweep marks such runs `expired`:
 *   - any run still `queued`/`running` past its `expires_at`, OR
 *   - a `running` run whose heartbeat is long-stale (runner gone).
 *
 * There is NO sandbox to tear down here (that's the S3 session-reaper) and NO
 * money settled (agent billing is Phase-0-gated) — a pure status flip.
 *
 * Auth: header `X-Ahura-Internal-Token: <BATCH_PROCESSOR_TOKEN>` — same trust
 * boundary as the finetune / eval / serving-pod watchdogs, scheduled the same
 * way (every few minutes via the CF Cron Worker).
 *
 * Idempotency: each run is reaped by *winning* the atomic transition to
 * `expired` (UPDATE matches only rows still queued/running). A concurrent sweep
 * — or a late finalize from the runner — that loses the transition does nothing.
 *
 * Returns: { scanned, reaped, errors, errors_detail }.
 */
import { NextRequest, NextResponse } from "next/server";
import { withCronRun } from "@/lib/inference/cron-heartbeat";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Minutes a running run may go without a heartbeat before the backstop reaps
// it. Generous so it can't race the runner's own per-step heartbeat.
const REAP_STALE_MINUTES = Number(process.env.AGENT_REAP_STALE_MINUTES ?? 15);

const EXPIRED_MESSAGE =
  "The agent run exceeded its time budget or the worker stopped responding, and was expired. Re-run it; if it repeats, contact support.";

interface StuckRow {
  id: string;
  org_id: string;
}

async function sweep(request: NextRequest) {
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
  const nowIso = new Date(now).toISOString();
  const staleIso = new Date(now - REAP_STALE_MINUTES * 60_000).toISOString();

  // Runs past their wall-clock expiry, OR running runs whose heartbeat is
  // long-stale (orphaned runner).
  const { data: rows, error } = await supabase
    .schema("agentcore")
    .from("runs")
    .select("id, org_id")
    .in("status", ["queued", "running"])
    .or(`expires_at.lt.${nowIso},heartbeat_at.lt.${staleIso}`)
    .limit(50)
    .returns<StuckRow[]>();

  if (error) {
    console.error("[agent run-reaper] scan failed:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }

  let reaped = 0;
  let errors = 0;
  const errDetails: Array<{ id: string; msg: string }> = [];

  for (const row of rows ?? []) {
    try {
      // Win the terminal transition atomically — only the sweep that flips the
      // run out of queued/running reaps it.
      const { data: won } = await supabase
        .schema("agentcore")
        .from("runs")
        .update({ status: "expired", error: EXPIRED_MESSAGE })
        .eq("id", row.id)
        .in("status", ["queued", "running"])
        .select("id")
        .maybeSingle();
      if (!won) continue; // a concurrent sweep or the runner already finalized it

      reaped++;
      console.log(
        JSON.stringify({
          level: "info",
          message: "agent.run.reaped",
          orgId: row.org_id,
          runId: row.id,
        })
      );
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      errDetails.push({ id: row.id, msg });
      console.error(`[agent run-reaper] reap failed for run ${row.id}:`, err);
    }
  }

  return NextResponse.json({
    scanned: rows?.length ?? 0,
    reaped,
    errors,
    errors_detail: errDetails,
  });
}

// Heartbeat wrapper. Without it this sweep's only trace is a Cloudflare log line,
// which no admin page can read — see lib/inference/cron-heartbeat.ts.
export async function POST(request: NextRequest) {
  return withCronRun("agent-run-reaper", () => sweep(request));
}
