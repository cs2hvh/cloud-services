/**
 * The shared runner boot path. Wires IORedis → BullMQ Queue + Worker →
 * Postgres Claimer → health server → graceful shutdown, exactly as ft-runner
 * and deploy-runner did by hand. Each runner instantiates this with its own
 * queue name, scan(), and job handler — nothing about the lifecycle is forked.
 *
 * Single replica per cluster is fine for v1 — concurrency is per-process
 * (maxConcurrentJobs). Sharding across replicas can come later once we hit
 * BullMQ's single-Redis ceiling.
 */
import IORedis from "ioredis";
import { Queue, Worker } from "bullmq";
import type { CoreRunnerEnv } from "./env.js";
import type { Logger } from "./logger.js";
import { Claimer, type EnqueueRequest, type RunnerJob } from "./claimer.js";
import { startHealthServer, type HealthState } from "./health.js";

export interface BootRunnerOptions<T> {
  /** Human label for boot/ready log lines, e.g. "ft-runner". */
  serviceName: string;
  /** BullMQ queue name, e.g. "ahura-inference-ft-runner". */
  queueName: string;
  env: CoreRunnerEnv;
  logger: Logger;
  /** Claimer scan — query Postgres and return jobs to enqueue. */
  scan: () => Promise<EnqueueRequest<T>[]>;
  /** Process one claimed job. The runner closes over its own ctx (supabase, etc.). */
  handler: (job: RunnerJob<T>) => Promise<void>;
  /** Extra fields logged on worker active/completed/failed events. */
  jobLogFields?: (job: RunnerJob<T> | undefined) => Record<string, unknown>;
  /** Extra fields logged on the boot line. */
  bootLogFields?: Record<string, unknown>;
}

/**
 * Boot a runner. Resolves once everything is wired and ready; the process then
 * stays alive on the worker + health server + redis connection. Registers
 * SIGTERM/SIGINT/uncaughtException handlers for graceful shutdown.
 */
export async function bootRunner<T>(opts: BootRunnerOptions<T>): Promise<void> {
  const { serviceName, queueName, env, logger } = opts;
  const jobFields = opts.jobLogFields ?? (() => ({}));

  logger.info({ ...opts.bootLogFields, queueName }, `${serviceName} booting`);

  // BullMQ requires maxRetriesPerRequest: null on the Worker's connection.
  const connection = new IORedis(env.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  connection.on("error", (err) => logger.error({ err: err.message }, "redis error"));

  const queue = new Queue<T, unknown, string>(queueName, { connection });

  const healthState: HealthState = {
    ready: false,
    lastClaimTickAt: null,
    lastWorkerActivityAt: Date.now(),
  };
  const healthServer = startHealthServer(env.healthPort, healthState, logger);

  const claimer = new Claimer<T>({
    queue,
    logger,
    intervalMs: env.claimPollIntervalMs,
    scan: opts.scan,
    onTickSuccess: () => { healthState.lastClaimTickAt = Date.now(); },
  });

  const worker = new Worker<T, unknown, string>(
    queueName,
    async (job) => {
      healthState.lastWorkerActivityAt = Date.now();
      // BullMQ Job is a superset of RunnerJob — the cast is safe.
      await opts.handler(job as RunnerJob<T>);
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
    logger.info({ bullJobId: job.id, ...jobFields(job as RunnerJob<T>) }, "worker active")
  );
  worker.on("completed", (job) =>
    logger.info({ bullJobId: job.id, ...jobFields(job as RunnerJob<T>) }, "worker completed")
  );
  worker.on("failed", (job, err) =>
    logger.error({ bullJobId: job?.id, ...jobFields(job as RunnerJob<T> | undefined), err: err.message }, "worker failed")
  );
  worker.on("error", (err) => logger.error({ err: err.message }, "worker runtime error"));

  claimer.start();
  healthState.ready = true;
  logger.info(`${serviceName} ready`);

  // ── Graceful shutdown ────────────────────────────────────────────
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    healthState.ready = false;
    logger.info({ signal }, "shutting down");
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
