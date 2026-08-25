// GET /api/admin/inference/cron — are the scheduled sweeps actually running?
//
// The AI Overview answers "is any capability failing" from the rows customers
// created. It cannot answer "is the machinery that RECOVERS those rows still
// alive", because a sweep that stops running produces no rows at all — it just
// stops fixing things. This is that missing half.
//
// Thin by design: read the heartbeats, delegate every judgement to
// lib/admin/cron-registry.ts.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { inferenceAdminClient } from "@/lib/admin/inference-client";
import {
  CRON_JOBS,
  judgeCron,
  sortCronByConcern,
  summarizeCron,
  type CronRunRow,
} from "@/lib/admin/cron-registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = inferenceAdminClient();
  const { data, error } = await supabase
    .schema("inference")
    .from("cron_runs")
    .select(
      "job, last_run_at, last_status, last_ok_at, last_error, last_duration_ms, last_result, consecutive_failures, runs_total"
    )
    .returns<CronRunRow[]>();

  // A missing table means the migration has not been applied. Say so, rather
  // than rendering nine "never run" rows that would send an operator hunting a
  // Worker outage that isn't there.
  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        hint: "If this says cron_runs does not exist, apply supabase/migrations/20260804000001_ai_admin_operations.sql.",
      },
      { status: 500 }
    );
  }

  const byJob = new Map((data ?? []).map((r) => [r.job, r]));
  const now = Date.now();
  const rows = sortCronByConcern(CRON_JOBS.map((spec) => judgeCron(spec, byJob.get(spec.job), now)));

  return NextResponse.json({
    summary: summarizeCron(rows),
    jobs: rows,
    note:
      "These sweeps are fired by the gateway Worker's cron. A job with no recent " +
      "heartbeat usually means the Worker cron is not deployed, or the running " +
      "build does not have that endpoint — not that the sweep itself is broken.",
  });
}
