/**
 * ft-runner entry point.
 *
 * Boots:
 *  - BullMQ Queue + Worker pointed at REDIS_URL
 *  - Claimer that polls Postgres for queued jobs and enqueues them
 *  - HTTP health server for k8s probes
 *
 * Single replica per cluster is fine for v1 — concurrency is per-process
 * (MAX_CONCURRENT_JOBS, default 4). Sharding across replicas can come later
 * once we hit BullMQ's single-Redis ceiling.
 */
import IORedis from "ioredis";
import { Queue, Worker } from "bullmq";
import { loadEnv } from "./env.js";
import { logger } from "./logger.js";
import { makeSupabase } from "./supabase.js";
import { RunPod } from "./runpod.js";
import { HeartbeatStore } from "./heartbeat.js";
import { Claimer } from "./claimer.js";
import { runJob, type JobPayload } from "./lifecycle.js";
import { startHealthServer, type HealthState } from "./health.js";

const QUEUE_NAME = "ahura-inference-ft-runner";

async function main(): Promise<void> {
  const env = loadEnv();
  logger.info(
    {
      maxConcurrentJobs: env.maxConcurrentJobs,
      claimPollIntervalMs: env.claimPollIntervalMs,
      monitorPollIntervalMs: env.monitorPollIntervalMs,
      heartbeatStallMs: env.heartbeatStallMs,
      axolotlImage: env.axolotlImageUri,
    },
    "ft-runner booting"
  );

  // BullMQ requires maxRetriesPerRequest: null on the Worker's connection
  const connection = new IORedis(env.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  connection.on("error", (err) => logger.error({ err: err.message }, "redis error"));

  const supabase = makeSupabase(env);
  const runpod = new RunPod(env);
  const heartbeats = new HeartbeatStore(env);

  const queue = new Queue<JobPayload>(QUEUE_NAME, { connection });

  const healthState: HealthState = {
    ready: false,
    lastClaimTickAt: null,
    lastWorkerActivityAt: Date.now(),
  };
  const healthServer = startHealthServer(env.healthPort, healthState, logger);

  const claimer = new Claimer(env, supabase, queue, logger);
  // Side-channel ticker keeps the /health endpoint's "last claim tick" fresh
  // without coupling the claimer to the health server.
  const claimTouch = setInterval(() => {
    healthState.lastClaimTickAt = Date.now();
  }, env.claimPollIntervalMs);

  const worker = new Worker<JobPayload>(
    QUEUE_NAME,
    async (job) => {
      healthState.lastWorkerActivityAt = Date.now();
      await runJob(
        { env, supabase, runpod, heartbeats, logger },
        job
      );
      healthState.lastWorkerActivityAt = Date.now();
    },
    {
      connection,
      concurrency: env.maxConcurrentJobs,
      lockDuration: env.jobLockDurationMs,
      autorun: true,
    }
  );

  worker.on("active", (job) => {
    logger.info({ bullJobId: job.id, jobId: job.data.jobId }, "worker active");
  });
  worker.on("completed", (job) => {
    logger.info({ bullJobId: job.id, jobId: job.data.jobId }, "worker completed");
  });
  worker.on("failed", (job, err) => {
    logger.error(
      { bullJobId: job?.id, jobId: job?.data?.jobId, err: err.message },
      "worker failed"
    );
  });
  worker.on("error", (err) => {
    logger.error({ err: err.message }, "worker runtime error");
  });

  claimer.start();
  healthState.ready = true;
  logger.info("ft-runner ready");

  // ── Graceful shutdown ────────────────────────────────────────────
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    healthState.ready = false;
    logger.info({ signal }, "shutting down");
    clearInterval(claimTouch);
    await claimer.stop().catch(() => undefined);
    await worker.close().catch(() => undefined);
    await queue.close().catch(() => undefined);
    await connection.quit().catch(() => undefined);
    healthServer.close();
    logger.info("shutdown complete");
    setTimeout(() => process.exit(0), 200).unref();
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("uncaughtException", (err) => {
    logger.fatal({ err: err.message, stack: err.stack }, "uncaughtException");
    void shutdown("uncaughtException");
  });
  process.on("unhandledRejection", (reason) => {
    logger.error({ reason: String(reason) }, "unhandledRejection");
  });
}

main().catch((err) => {
  logger.fatal(
    { err: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined },
    "boot failed"
  );
  process.exit(1);
});
