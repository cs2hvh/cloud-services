/**
 * ft-runner entry point.
 *
 * Polls inference.finetunes for queued jobs, provisions RunPod pods running the
 * Axolotl training image, and monitors them via heartbeat + pod status. The
 * boot scaffolding (Redis → BullMQ → Postgres claimer → health server →
 * graceful shutdown) is provided by runner-core; this file supplies the
 * ft-specific scan, job handler, and dependencies.
 *
 * Single replica per cluster is fine for v1 — concurrency is per-process
 * (MAX_CONCURRENT_JOBS, default 4).
 */
import { bootRunner } from "@ahura/runner-core";
import { loadEnv } from "./env.js";
import { logger } from "./logger.js";
import { makeSupabase } from "./supabase.js";
import { RunPod } from "./runpod.js";
import { HeartbeatStore } from "./heartbeat.js";
import { runJob, type JobPayload } from "./lifecycle.js";
import { scanFinetunes } from "./scan.js";

const QUEUE_NAME = "ahura-inference-ft-runner";

async function main(): Promise<void> {
  const env = loadEnv();
  const supabase = makeSupabase(env);
  const runpod = new RunPod(env);
  const heartbeats = new HeartbeatStore(env);

  await bootRunner<JobPayload>({
    serviceName: "ft-runner",
    queueName: QUEUE_NAME,
    env,
    logger,
    bootLogFields: {
      maxConcurrentJobs: env.maxConcurrentJobs,
      claimPollIntervalMs: env.claimPollIntervalMs,
      monitorPollIntervalMs: env.monitorPollIntervalMs,
      heartbeatStallMs: env.heartbeatStallMs,
      axolotlImage: env.axolotlImageUri,
    },
    scan: () => scanFinetunes(supabase, logger),
    handler: (job) =>
      runJob({ env, supabase, runpod, heartbeats, logger }, job),
    jobLogFields: (job) => ({ jobId: job?.data.jobId }),
  });
}

main().catch((err) => {
  logger.fatal(
    {
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    },
    "boot failed"
  );
  process.exit(1);
});
