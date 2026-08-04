/**
 * Heartbeat for the scheduled sweeps.
 *
 * WHY THIS EXISTS: the nine control-plane sweeps (watchdogs, the connector
 * scheduler, the deployment meter) are fired by the gateway Worker's cron and
 * their only output was `console.log` into Cloudflare. Nothing was written
 * anywhere the admin could read, so a sweep that stopped running was invisible.
 * That is not hypothetical — six of the internal cron endpoints returned 404 in
 * production for roughly two months (a stale deploy) while the AI Overview
 * reported the platform healthy, because the jobs those sweeps recover simply
 * sat there and nothing counts a recovery that never happened.
 *
 * A sweep that cannot reach its endpoint at all cannot write its own heartbeat —
 * that is the point. `lib/admin/cron-registry.ts` judges a job by the AGE of its
 * last heartbeat against the interval it is supposed to run at, so a 404, a token
 * mismatch, a Worker that was never deployed and a crashed handler all surface
 * the same way: no recent heartbeat.
 *
 * BEST EFFORT, ALWAYS. A heartbeat write must never fail a sweep — the sweep is
 * the thing that actually recovers customer work. Every failure here is logged
 * and swallowed, the same posture as lib/inference/audit.ts.
 */
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export interface CronOutcome {
  ok: boolean;
  durationMs: number;
  /** Whatever the sweep reported — scanned/reaped/errors. Shown in the admin table. */
  result?: Record<string, unknown>;
  error?: string | null;
}

/**
 * Record one sweep's outcome.
 *
 * Read-modify-write rather than an atomic RPC: `consecutive_failures` is the
 * figure an operator actually acts on (one failure is noise, twenty in a row is
 * an outage) and it cannot be derived from a table that keeps no history. Each
 * job has exactly one writer firing every 1–5 minutes, so the race this trades
 * away cannot realistically happen, and losing one heartbeat would be harmless
 * anyway — the next one overwrites it.
 */
export async function recordCronRun(job: string, outcome: CronOutcome): Promise<void> {
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });

    const { data: prev } = await supabase
      .schema("inference")
      .from("cron_runs")
      .select("consecutive_failures, runs_total, last_ok_at")
      .eq("job", job)
      .maybeSingle<{ consecutive_failures: number | null; runs_total: number | null; last_ok_at: string | null }>();

    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .schema("inference")
      .from("cron_runs")
      .upsert(
        {
          job,
          last_run_at: nowIso,
          last_status: outcome.ok ? "ok" : "error",
          // Kept from the previous row on failure, so "when did this last
          // actually work?" survives a run of failures.
          last_ok_at: outcome.ok ? nowIso : (prev?.last_ok_at ?? null),
          last_error: outcome.ok ? null : (outcome.error ?? "unknown error"),
          last_duration_ms: Math.round(outcome.durationMs),
          last_result: outcome.result ?? {},
          consecutive_failures: outcome.ok ? 0 : (prev?.consecutive_failures ?? 0) + 1,
          runs_total: (prev?.runs_total ?? 0) + 1,
          updated_at: nowIso,
        },
        { onConflict: "job" }
      );
    if (error) console.error("[cron-heartbeat] failed to record", job, error.message);
  } catch (err) {
    console.error("[cron-heartbeat] failed to record", job, err);
  }
}

/**
 * Wrap a sweep handler so it heartbeats whatever it does.
 *
 * One edit per route: the existing handler becomes the callback. The response
 * body is read from a CLONE, so the caller still receives an unconsumed stream.
 *
 * 401s are deliberately NOT recorded. An unauthenticated caller must not be able
 * to mark a healthy job as failing, and a genuine token mismatch already surfaces
 * as a stale heartbeat — which is the same signal, arrived at safely.
 */
export async function withCronRun(
  job: string,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const started = Date.now();
  try {
    const res = await handler();
    if (res.status === 401) return res;

    let body: Record<string, unknown> = {};
    try {
      body = (await res.clone().json()) as Record<string, unknown>;
    } catch {
      /* a sweep that returns no JSON still ran */
    }
    const ok = res.status < 400;
    void recordCronRun(job, {
      ok,
      durationMs: Date.now() - started,
      result: ok ? body : {},
      error: ok ? null : String(body.error ?? `HTTP ${res.status}`),
    });
    return res;
  } catch (err) {
    // A thrown handler is the worst case and the one most worth recording.
    void recordCronRun(job, {
      ok: false,
      durationMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
