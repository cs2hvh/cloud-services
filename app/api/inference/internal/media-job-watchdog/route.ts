/**
 * POST /api/inference/internal/media-job-watchdog
 *
 * Two-pass sweep over inference.media_jobs:
 *
 * Pass 1 — Reaper: jobs still queued/running past their deadline_at
 *   → mark failed (error_code: watchdog_timeout). Covers cases where
 *   the CF Worker died before settleVideoJob finished.
 *
 * Pass 2 — Recoverer: running jobs with an upstream_job_id whose
 *   heartbeat is stale (> 5 min). The Worker may have died mid-poll.
 *   We re-poll OpenRouter once; if completed we save the output and
 *   mark the job done; if still pending we leave it for the next sweep.
 *   This gives jobs a second chance before the deadline reaper kills them.
 *
 * Auth: X-Ahura-Internal-Token (reuses BATCH_PROCESSOR_TOKEN).
 * Schedule: every 1 minute via Cloudflare Cron Trigger (wrangler.toml: "* * * * *").
 * Idempotency: state transitions use .eq("status", "running/queued") so
 *   concurrent sweeps skip rows already processed.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { usageApiKeyId } from "@/lib/inference/usage-attribution";

export const dynamic  = "force-dynamic";
export const revalidate = 0;

const HEARTBEAT_STALE_MS = 5 * 60 * 1000; // 5 min with no heartbeat = Worker died
const SWEEP_LIMIT        = 50;             // max rows per pass to keep sweeps bounded


interface MediaJobRow {
  id:              string;
  org_id:          string;
  model_id:        string;
  status:          string;
  upstream_job_id: string | null;
  heartbeat_at:    string | null;
  deadline_at:     string | null;
  request_params:  Record<string, unknown>;
  api_key_id:      string | null;
}

/**
 * Write the usage row a recovered job never got.
 *
 * Mirrors the gateway's computeUnitCost for the one unit label this route can
 * produce (video_second → cents_per_media_second). Deliberately NOT a general
 * pricing engine: the recovery path only ever settles video jobs, and a second
 * half-copy of the full price table is how the two drift apart.
 *
 * Returns 1 if a usage row was written, 0 otherwise. Never throws — a billing
 * hiccup must not abort the sweep and leave later jobs unrecovered (same
 * reasoning as the batch processor's usage insert).
 */
async function billRecoveredJob(
  supabase: SupabaseClient,
  row: MediaJobRow,
  durationSeconds: number
): Promise<number> {
  try {
    const { data: model } = await supabase
      .schema("inference")
      .from("models")
      .select("pricing")
      .eq("model_id", row.model_id)
      .maybeSingle<{ pricing: Record<string, number> | null }>();

    const perSecond = Number(model?.pricing?.cents_per_media_second ?? 0);
    // Math.ceil matches the gateway so a recovered job costs exactly what the
    // same job would have cost had the customer kept polling.
    const costCents = Math.ceil(durationSeconds * perSecond);

    const { error } = await supabase.schema("inference").from("usage").insert({
      org_id:       row.org_id,
      api_key_id:   usageApiKeyId(row.api_key_id),
      model_id:     row.model_id,
      modality:     "video",
      request_id:   `watchdog-${row.id}`,
      billed_to:    "platform",
      num_units:    durationSeconds,
      unit_label:   "video_second",
      cost_cents:   costCents,
      status:       "success",
      is_batch:     false,
    });
    if (error) {
      console.error(JSON.stringify({
        level: "error", event: "media_job.bill_failed",
        jobId: row.id, orgId: row.org_id, err: error.message,
      }));
      return 0;
    }
    return 1;
  } catch (err) {
    console.error(JSON.stringify({
      level: "error", event: "media_job.bill_failed",
      jobId: row.id, orgId: row.org_id, err: String(err),
    }));
    return 0;
  }
}

export async function POST(request: NextRequest) {
  const token    = request.headers.get("x-ahura-internal-token");
  const expected = process.env.BATCH_PROCESSOR_TOKEN;
  if (!expected || !token || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const nowIso  = new Date().toISOString();
  const summary = { reaped: 0, recovered: 0, billed: 0, still_running: 0, errors: 0 };

  // ── Pass 1: Reaper ────────────────────────────────────────────────────────
  // Any job that is still queued or running but has blown past its deadline.

  const { data: timedOut, error: reapErr } = await supabase
    .schema("inference")
    .from("media_jobs")
    .select("id, org_id, model_id, status")
    .in("status", ["queued", "running"])
    .lt("deadline_at", nowIso)
    .limit(SWEEP_LIMIT)
    .returns<Pick<MediaJobRow, "id" | "org_id" | "model_id" | "status">[]>();

  if (reapErr) {
    console.error("[media-watchdog] reaper scan failed:", reapErr);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }

  for (const row of timedOut ?? []) {
    const { error } = await supabase
      .schema("inference")
      .from("media_jobs")
      .update({ status: "failed", error_code: "watchdog_timeout" })
      .eq("id", row.id)
      .in("status", ["queued", "running"]); // idempotency gate

    if (error) {
      summary.errors++;
      console.error("[media-watchdog] reap failed", row.id, error);
    } else {
      summary.reaped++;
      console.log(JSON.stringify({ level: "info", event: "media_job.reaped", jobId: row.id, orgId: row.org_id, modelId: row.model_id }));
    }
  }

  // ── Pass 2: Recoverer ─────────────────────────────────────────────────────
  // Running jobs whose Worker heartbeat is stale but still within deadline.
  // Only jobs with an upstream_job_id can be recovered (we can re-poll OR).

  const staleBeforeIso = new Date(Date.now() - HEARTBEAT_STALE_MS).toISOString();

  const { data: stale, error: staleErr } = await supabase
    .schema("inference")
    .from("media_jobs")
    .select("id, org_id, model_id, status, upstream_job_id, heartbeat_at, deadline_at, request_params, api_key_id")
    .eq("status", "running")
    .not("upstream_job_id", "is", null)
    .gt("deadline_at", nowIso)          // still within deadline
    .lt("heartbeat_at", staleBeforeIso) // Worker hasn't pinged in 5+ min
    .limit(SWEEP_LIMIT)
    .returns<MediaJobRow[]>();

  if (staleErr) {
    console.error("[media-watchdog] recovery scan failed:", staleErr);
    // Don't fail the whole request — reaper already ran fine
  }

  const orBase   = (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const orKey    = process.env.OPENROUTER_PLATFORM_KEY ?? "";

  for (const row of stale ?? []) {
    try {
      const pollResp = await fetch(`${orBase}/videos/${row.upstream_job_id}`, {
        headers: { Authorization: `Bearer ${orKey}` },
      });

      if (!pollResp.ok) {
        // Upstream error — leave it running; the next sweep or reaper will handle it
        summary.still_running++;
        continue;
      }

      const pollData = (await pollResp.json()) as {
        status:        string;
        unsigned_urls?: string[];
      };

      if (pollData.status === "completed" && pollData.unsigned_urls?.[0]) {
        const duration = Number(row.request_params?.duration ?? 5);
        const { data: settled } = await supabase.schema("inference").from("media_jobs")
          .update({
            status:      "completed",
            output_url:  pollData.unsigned_urls[0],
            num_units:   duration,
            unit_label:  "video_second",
          })
          .eq("id", row.id)
          .eq("status", "running") // idempotency gate
          .select("id");

        // BILL IT. The gateway charges at every one of its own settle points
        // (video-generations.ts calls enqueueUsage three times), but this
        // recovery path only flipped the status — so a job the customer stopped
        // polling was delivered FREE. Latent until now only because this route
        // 404s in production and has never actually recovered a job.
        //
        // The `.select()` above is what makes this safe to run repeatedly: the
        // idempotency gate means a second sweep updates zero rows, so no usage
        // row is written twice.
        const didSettle = (settled?.length ?? 0) > 0;
        if (didSettle) {
          summary.billed += await billRecoveredJob(supabase, row, duration);
        }

        summary.recovered++;
        console.log(JSON.stringify({ level: "info", event: "media_job.recovered", jobId: row.id, orgId: row.org_id, billed: didSettle }));

      } else if (
        pollData.status === "failed" ||
        pollData.status === "cancelled" ||
        pollData.status === "expired"
      ) {
        await supabase.schema("inference").from("media_jobs")
          .update({ status: "failed", error_code: `upstream_${pollData.status}` })
          .eq("id", row.id)
          .eq("status", "running");

        summary.reaped++;
        console.log(JSON.stringify({ level: "info", event: "media_job.failed_upstream", jobId: row.id, upstreamStatus: pollData.status }));

      } else {
        // Still pending — bump heartbeat so it doesn't trigger again immediately
        await supabase.schema("inference").from("media_jobs")
          .update({ heartbeat_at: new Date().toISOString() })
          .eq("id", row.id);

        summary.still_running++;
      }
    } catch (err) {
      summary.errors++;
      console.error("[media-watchdog] recovery failed for job", row.id, err);
    }
  }

  return NextResponse.json({
    ok:           true,
    scanned:      (timedOut?.length ?? 0) + (stale?.length ?? 0),
    reaped:       summary.reaped,
    recovered:    summary.recovered,
    billed:       summary.billed,
    still_running: summary.still_running,
    errors:       summary.errors,
  });
}
