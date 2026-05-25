/**
 * Per-job orchestration: claim → provision pod → monitor → cleanup.
 *
 * The training container reports completion via the HMAC-signed webhook
 * (app/api/inference/fine-tuning/jobs/[id]/webhook), so this loop's only
 * jobs are:
 *  - bring the pod up
 *  - watch heartbeats for liveness
 *  - watch DB status for external cancellation
 *  - if pod dies without webhook (no heartbeat + pod EXITED) → mark failed
 *
 * Idempotent across runner restarts: every state transition is gated on the
 * current row value, so a duplicate replay is a no-op.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Job } from "bullmq";
import type { RunnerEnv } from "./env.js";
import { resolveHuggingFaceId } from "./ft-base-models.js";
import type { HeartbeatStore } from "./heartbeat.js";
import type { Logger } from "./logger.js";
import type { RunPod } from "./runpod.js";

interface FinetuneRow {
  id: string;
  org_id: string;
  base_model_id: string;
  method: "lora" | "qlora" | "full";
  hyperparams: Record<string, unknown>;
  dataset_url: string;
  validation_dataset_url: string | null;
  gpu_sku: string;
  status: string;
  runpod_job_id: string | null;
}

export interface LifecycleDeps {
  env: RunnerEnv;
  supabase: SupabaseClient;
  runpod: RunPod;
  heartbeats: HeartbeatStore;
  logger: Logger;
}

export interface JobPayload {
  jobId: string;
}

export async function runJob(
  deps: LifecycleDeps,
  bullJob: Job<JobPayload>
): Promise<void> {
  const { env, supabase, runpod, logger } = deps;
  const { jobId } = bullJob.data;
  const log = logger.child({ jobId, bullJobId: bullJob.id });

  // ── 1. Claim ──────────────────────────────────────────────────────
  // Atomic: only one runner replica can move queued → preparing
  const { data: claimed, error: claimErr } = await supabase
    .schema("inference")
    .from("finetunes")
    .update({
      status: "preparing",
      started_at: new Date().toISOString(),
      bullmq_job_id: String(bullJob.id ?? ""),
    })
    .eq("id", jobId)
    .eq("status", "queued")
    .select(
      "id, org_id, base_model_id, method, hyperparams, dataset_url, validation_dataset_url, gpu_sku, status, runpod_job_id"
    )
    .maybeSingle<FinetuneRow>();

  if (claimErr) {
    log.error({ err: claimErr.message }, "claim query failed");
    throw new Error(`Claim failed: ${claimErr.message}`);
  }

  if (!claimed) {
    // Already claimed (another replica) OR not in queued state — check what it is
    const { data: cur } = await supabase
      .schema("inference")
      .from("finetunes")
      .select("id, status, runpod_job_id")
      .eq("id", jobId)
      .maybeSingle<{ id: string; status: string; runpod_job_id: string | null }>();

    if (!cur) {
      log.warn("job row not found — dropping");
      return;
    }
    if (cur.status === "preparing" || cur.status === "running") {
      // We're mid-flight from a previous claim — adopt the pod and continue
      if (!cur.runpod_job_id) {
        log.warn({ status: cur.status }, "job in-flight without runpod_job_id — refusing to claim");
        return;
      }
      log.info({ status: cur.status, podId: cur.runpod_job_id }, "adopting in-flight job");
      // Adopted job: we don't know when it was actually provisioned, so
      // assume the boot grace already elapsed (worst case = some stalls
      // counted that "shouldn't" be, but adopted jobs are by definition
      // already past the bootstrap window).
      const adoptedProvisionedAt = Date.now() - deps.env.bootGraceMs;
      await monitorUntilDone(deps, jobId, cur.runpod_job_id, adoptedProvisionedAt, log);
      return;
    }
    log.info({ status: cur.status }, "job no longer queued — skipping");
    return;
  }

  // Resolve our internal model id (e.g. "qwen/qwen-3-8b-instruct") to the
  // actual HuggingFace name axolotl needs ("Qwen/Qwen3-8B"). If we passed
  // the internal id straight through, every non-phi-4 base would 404 on HF.
  const hfModelId = resolveHuggingFaceId(claimed.base_model_id);
  log.info(
    { baseModel: claimed.base_model_id, hfModelId, gpuSku: claimed.gpu_sku },
    "claimed"
  );

  // ── 2. Provision pod ─────────────────────────────────────────────
  const provisionedAt = Date.now();
  let podId: string;
  let hourlyCostCents: number | null = null;
  try {
    const provisioned = await runpod.createPod({
      jobId,
      baseModelId: hfModelId,
      method: claimed.method,
      datasetUrl: claimed.dataset_url,
      hyperparams: claimed.hyperparams,
      gpuSku: claimed.gpu_sku,
      outputR2Prefix: `r2://ahura-ft-adapters/${claimed.org_id}/${jobId}/`,
      webhookUrl: `${env.controlPlaneUrl}/api/inference/fine-tuning/jobs/${jobId}/webhook`,
      heartbeatUrl: `${env.controlPlaneUrl}/api/inference/fine-tuning/jobs/${jobId}/heartbeat`,
      webhookSecret: env.ftWebhookSecret,
      r2: {
        accessKeyId: env.r2AccessKeyId,
        secretAccessKey: env.r2SecretAccessKey,
        endpoint: env.r2Endpoint,
      },
      hfToken: env.hfToken,
      imageUri: env.axolotlImageUri,
      templateId: env.runpodTemplateId,
    });
    podId = provisioned.podId;
    if (provisioned.hourlyCostUsd && provisioned.hourlyCostUsd > 0) {
      hourlyCostCents = Math.round(provisioned.hourlyCostUsd * 100);
    }
    log.info(
      { podId, gpuTypeId: provisioned.gpuTypeId, hourlyCostUsd: provisioned.hourlyCostUsd, hourlyCostCents },
      "pod provisioned"
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, "provisioning failed");
    await supabase
      .schema("inference")
      .from("finetunes")
      .update({
        status: "failed",
        error_message: `Pod provisioning failed: ${msg.slice(0, 500)}`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .in("status", ["preparing", "queued"]);
    throw err;
  }

  // Persist pod id + hourly cost so the completion webhook can compute
  // final cost_cents = hourlyCostCents × elapsed/3600. Flip to running so
  // cancellations have something to terminate.
  await supabase
    .schema("inference")
    .from("finetunes")
    .update({
      status: "running",
      runpod_job_id: podId,
      hourly_cost_cents: hourlyCostCents,
    })
    .eq("id", jobId)
    .eq("status", "preparing");

  // ── 3. Monitor ───────────────────────────────────────────────────
  await monitorUntilDone(deps, jobId, podId, provisionedAt, log);
}

async function monitorUntilDone(
  deps: LifecycleDeps,
  jobId: string,
  podId: string,
  provisionedAt: number,
  log: Logger
): Promise<void> {
  const { env, supabase, runpod, heartbeats } = deps;
  let consecutiveStalls = 0;
  let consecutivePodDown = 0;
  let bootGraceLogged = false;

  while (true) {
    await sleep(env.monitorPollIntervalMs);

    // ── DB-side terminal-state check ──────────────────────────────
    // Cheap: catches webhook-driven completions, external cancellation, and
    // duplicate-runner racing.
    const { data: cur, error } = await supabase
      .schema("inference")
      .from("finetunes")
      .select("status")
      .eq("id", jobId)
      .maybeSingle<{ status: string }>();

    if (error) {
      log.warn({ err: error.message }, "status poll failed — keeping pod alive, retrying");
      continue;
    }
    if (!cur) {
      log.warn("job row vanished — terminating pod and exiting");
      await runpod.terminatePod(podId).catch((err) => {
        log.warn({ err: errStr(err) }, "terminate failed (pod may already be gone)");
      });
      return;
    }
    if (cur.status === "cancelled") {
      log.info("job cancelled externally — terminating pod");
      await runpod.terminatePod(podId).catch((err) => {
        log.warn({ err: errStr(err) }, "terminate failed");
      });
      return;
    }
    if (cur.status === "completed" || cur.status === "failed") {
      log.info({ finalStatus: cur.status }, "webhook already marked terminal — done");
      // Pod is responsible for self-shutdown after webhook POST; we still
      // GC-terminate as a belt-and-braces against zombie pods.
      await runpod.terminatePod(podId).catch(() => undefined);
      return;
    }

    // ── Pod-side liveness ────────────────────────────────────────
    let podStatus: string;
    try {
      podStatus = await runpod.getPodStatus(podId);
    } catch (err) {
      log.warn({ err: errStr(err) }, "pod status poll failed — assuming UNKNOWN, will recheck");
      continue;
    }

    if (podStatus === "EXITED" || podStatus === "TERMINATED") {
      consecutivePodDown += 1;
      // Give the webhook a couple of monitor ticks to land — the container
      // POSTs at the very end of train.sh and we might just be racing it.
      if (consecutivePodDown < 2) {
        log.info({ podStatus }, "pod down — waiting one more tick for webhook");
        continue;
      }
      log.error({ podStatus }, "pod down + no completion webhook — marking failed");
      await markFailedIfStillRunning(
        supabase,
        jobId,
        `Pod ${podStatus.toLowerCase()} without completion webhook`
      );
      await runpod.terminatePod(podId).catch(() => undefined);
      return;
    }
    consecutivePodDown = 0;

    // ── Heartbeat / stall detection ──────────────────────────────
    // Boot grace: skip stall counting for the first BOOT_GRACE_MS after
    // provision. RunPod's 22GB image pull on a cold node takes 5-10 min,
    // during which the training container literally doesn't exist yet
    // and can't send heartbeats. Without this window we'd kill every pod
    // mid-pull. Once grace elapses, the normal stall-count→kill logic
    // kicks in for real "container started but heartbeat.py crashed"
    // situations.
    const sinceProvisionMs = Date.now() - provisionedAt;
    if (sinceProvisionMs < env.bootGraceMs) {
      if (!bootGraceLogged) {
        const remainingMs = env.bootGraceMs - sinceProvisionMs;
        log.info(
          { bootGraceRemainingMs: remainingMs, podStatus },
          "in boot grace window — skipping heartbeat-stall counting"
        );
        bootGraceLogged = true;
      }
      continue;
    }

    const stale = await heartbeats.isStale(jobId, env.heartbeatStallMs);
    if (stale) {
      consecutiveStalls += 1;
      log.warn(
        { consecutiveStalls, threshold: env.consecutiveStallsToKill, podStatus },
        "heartbeat stale"
      );
    } else {
      if (consecutiveStalls > 0) log.info("heartbeat recovered");
      consecutiveStalls = 0;
    }

    if (consecutiveStalls >= env.consecutiveStallsToKill) {
      log.error(
        { consecutiveStalls, podStatus },
        "heartbeat stall threshold exceeded — killing pod"
      );
      await markFailedIfStillRunning(
        supabase,
        jobId,
        `No heartbeat for >${(env.heartbeatStallMs * env.consecutiveStallsToKill) / 1000}s (pod ${podStatus})`
      );
      await runpod.terminatePod(podId).catch(() => undefined);
      return;
    }
  }
}

async function markFailedIfStillRunning(
  supabase: SupabaseClient,
  jobId: string,
  reason: string
): Promise<void> {
  await supabase
    .schema("inference")
    .from("finetunes")
    .update({
      status: "failed",
      error_message: reason.slice(0, 500),
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .in("status", ["preparing", "running"]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errStr(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
