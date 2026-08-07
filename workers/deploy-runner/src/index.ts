/**
 * deploy-runner entry point.
 *
 * Polls inference.deployments and drives RunPod Serverless create/delete. The
 * boot scaffolding (Redis → BullMQ → Postgres claimer → health server →
 * graceful shutdown) is provided by runner-core; this file supplies the
 * deploy-specific scan, job handler, and dependencies.
 *
 * Queue name: ahura-inference-deploy-runner.
 */
import { bootRunner } from "@ahura/runner-core";
import { loadEnv } from "./env.js";
import { logger } from "./logger.js";
import { makeSupabase } from "./supabase.js";
import { RunPod } from "./runpod.js";
import { processJob, type DeployJobPayload } from "./lifecycle.js";
import { scanDeployments } from "./scan.js";

const QUEUE_NAME = "ahura-inference-deploy-runner";

async function main(): Promise<void> {
  const env = loadEnv();
  const supabase = makeSupabase(env);
  const runpod = new RunPod(env);

  await bootRunner<DeployJobPayload>({
    serviceName: "deploy-runner",
    queueName: QUEUE_NAME,
    env,
    logger,
    bootLogFields: {
      maxConcurrentJobs: env.maxConcurrentJobs,
      claimPollIntervalMs: env.claimPollIntervalMs,
      readyPollIntervalMs: env.readyPollIntervalMs,
      readyTimeoutMs: env.readyTimeoutMs,
    },
    scan: () => scanDeployments(supabase, logger),
    handler: (job) =>
      processJob({ env, supabase, runpod, logger }, job),
    jobLogFields: (job) => ({ deploymentId: job?.data.deploymentId, action: job?.data.action }),
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
