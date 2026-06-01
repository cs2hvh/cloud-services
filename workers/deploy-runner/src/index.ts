/**
 * deploy-runner entry point. Same shape as ft-runner:
 *   Postgres claimer → BullMQ queue → Worker → RunPod Serverless API.
 *
 * Queue name: ahura-inference-deploy-runner.
 */
import IORedis from "ioredis";
import { Queue, Worker } from "bullmq";
import { loadEnv } from "./env.js";
import { logger } from "./logger.js";
import { makeSupabase } from "./supabase.js";
import { RunPod } from "./runpod.js";
import { Claimer } from "./claimer.js";
import { processJob, type DeployJobPayload } from "./lifecycle.js";
import { startHealthServer, type HealthState } from "./health.js";

const QUEUE_NAME = "ahura-inference-deploy-runner";

async function main(): Promise<void> {
  const env = loadEnv();
  logger.info(
    {
      maxConcurrentJobs: env.maxConcurrentJobs,
      claimPollIntervalMs: env.claimPollIntervalMs,
      readyPollIntervalMs: env.readyPollIntervalMs,
      readyTimeoutMs: env.readyTimeoutMs,
    },
    "deploy-runner booting"
  );

  const connection = new IORedis(env.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  connection.on("error", (err) => logger.error({ err: err.message }, "redis error"));

  const supabase = makeSupabase(env);
  const runpod = new RunPod(env);

  const queue = new Queue<DeployJobPayload>(QUEUE_NAME, { connection });

  const healthState: HealthState = {
    ready: false,
    lastClaimTickAt: null,
    lastWorkerActivityAt: Date.now(),
  };
  const healthServer = startHealthServer(env.healthPort, healthState, logger);

  const claimer = new Claimer(env, supabase, queue, logger);
  const claimTouch = setInterval(() => {
    healthState.lastClaimTickAt = Date.now();
  }, env.claimPollIntervalMs);

  const worker = new Worker<DeployJobPayload>(
    QUEUE_NAME,
    async (job) => {
      healthState.lastWorkerActivityAt = Date.now();
      await processJob({ env, supabase, runpod, logger }, job);
      healthState.lastWorkerActivityAt = Date.now();
    },
    {
      connection,
      concurrency: env.maxConcurrentJobs,
      lockDuration: env.jobLockDurationMs,
      autorun: true,
    }
  );

  worker.on("active", (job) =>
    logger.info({ bullJobId: job.id, deploymentId: job.data.deploymentId, action: job.data.action }, "worker active")
  );
  worker.on("completed", (job) =>
    logger.info({ bullJobId: job.id, deploymentId: job.data.deploymentId, action: job.data.action }, "worker completed")
  );
  worker.on("failed", (job, err) =>
    logger.error(
      { bullJobId: job?.id, deploymentId: job?.data?.deploymentId, action: job?.data?.action, err: err.message },
      "worker failed"
    )
  );
  worker.on("error", (err) => logger.error({ err: err.message }, "worker runtime error"));

  claimer.start();
  healthState.ready = true;
  logger.info("deploy-runner ready");

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
    {
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    },
    "boot failed"
  );
  process.exit(1);
});
