/**
 * POST /api/inference/internal/serving-pod-watchdog
 *
 * Scheduled sweep — finds running serving pods whose auto_stop_at has
 * elapsed and tears them down. Cron-driven, not user-facing.
 *
 * Auth: header `X-Ahura-Internal-Token: <BATCH_PROCESSOR_TOKEN>`.
 * (We reuse the existing batch-processor token env rather than minting
 * a second internal-cron secret — same trust boundary.)
 *
 * Schedule: every minute. Suggested:
 *   - Cloudflare Cron Trigger on the Worker calling this URL
 *   - or a k8s CronJob on LKE
 *   - or `* * * * * curl ...` from any always-on host
 *
 * Idempotency: each scan flips a pod's state to "stopped" BEFORE calling
 * the upstream tear-down. If the watchdog runs twice in parallel, the
 * second sweep sees state != "running" and skips the row. Safe to
 * over-fire.
 *
 * Returns: a small summary { scanned, stopped, errors } that the cron
 * platform can log/alert on.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  terminateServingPod,
  sanitizeProvisionError,
} from "@/lib/inference/serving-pod";
import { settleServingPod } from "@/lib/inference/serving-pod-billing";

export const dynamic = "force-dynamic";
// Defensive: don't let the watchdog be cached.
export const revalidate = 0;

interface RowToReap {
  id: string;
  org_id: string;
  output_model_id: string | null;
  serving_pod_id: string | null;
  serving_pod_auto_stop_at: string;
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

  // Find running pods whose auto-stop has elapsed. LIMIT 50 keeps a
  // single sweep bounded; if there's ever more than that backlog the
  // next minute's cron picks up the rest.
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await supabase
    .schema("inference")
    .from("finetunes")
    .select("id, org_id, output_model_id, serving_pod_id, serving_pod_auto_stop_at")
    .eq("serving_pod_state", "running")
    .not("serving_pod_id", "is", null)
    .lt("serving_pod_auto_stop_at", nowIso)
    .limit(50)
    .returns<RowToReap[]>();

  if (error) {
    console.error("[watchdog] scan failed:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }

  let stopped = 0;
  let errors = 0;
  const errDetails: Array<{ id: string; msg: string }> = [];

  for (const row of rows ?? []) {
    try {
      // Settle billing + flip state atomically, and clear gateway routing.
      // Winning the transition is the idempotency gate — a concurrent sweep
      // (or a manual stop) that loses it skips the row, so the uptime is
      // charged exactly once.
      const settled = await settleServingPod(supabase, row.id);
      if (!settled.settled) continue;

      // Fire the upstream tear-down. If the pod is already gone (404),
      // terminateServingPod swallows it.
      if (row.serving_pod_id) {
        await terminateServingPod(row.serving_pod_id);
      }
      stopped++;

      console.log(
        JSON.stringify({
          level: "info",
          message: "serving_pod.auto_stopped",
          orgId: row.org_id,
          ftId: row.id,
          podId: row.serving_pod_id,
          autoStopAt: row.serving_pod_auto_stop_at,
        })
      );
    } catch (err) {
      errors++;
      const msg = sanitizeProvisionError(err);
      errDetails.push({ id: row.id, msg });
      console.error(`[watchdog] tear-down failed for ft ${row.id}:`, err);
    }
  }

  return NextResponse.json({
    scanned: rows?.length ?? 0,
    stopped,
    errors,
    errors_detail: errDetails,
  });
}
