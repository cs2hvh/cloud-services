/**
 * agent-runner entry point.
 *
 * Polls agentcore.runs for queued durable agent runs. For each run:
 *   1. Atomically claims it (queued → running)
 *   2. Resolves config (stored agent or inline request)
 *   3. Executes the pure agent loop (@ahura/agent-core) — model turns via the
 *      inference gateway; hosted tools arrive in S2
 *   4. Persists per-step traces + heartbeats; marks the run completed/failed
 *
 * Like eval-runner, this needs no RunPod — only HTTP calls to our own inference
 * gateway. Single replica per cluster (v1); MAX_CONCURRENT_JOBS controls
 * per-process parallelism. Sharding across replicas is safe later (atomic claim).
 */
import { bootRunner } from "@ahura/runner-core";
import { loadEnv } from "./env.js";
import { logger } from "./logger.js";
import { makeSupabase } from "./supabase.js";
import { scanRuns } from "./scan.js";
import { runAgentJob, type RunContext } from "./lifecycle.js";

const QUEUE_NAME = "ahura-inference-agent-runner";

async function main(): Promise<void> {
  const env = loadEnv();
  const supabase = makeSupabase(env);
  const podId = process.env.HOSTNAME ?? `agent-runner-${process.pid}`;
  const ctx: RunContext = { env, supabase, logger, podId };

  await bootRunner({
    serviceName: "agent-runner",
    queueName: QUEUE_NAME,
    env,
    logger,
    bootLogFields: {
      inferenceBaseUrl: env.inferenceBaseUrl,
      maxConcurrentJobs: env.maxConcurrentJobs,
      podId,
    },
    scan: () => scanRuns(supabase, logger),
    handler: (job) => runAgentJob(ctx, job.data),
    jobLogFields: (job) => ({ runId: job?.data.runId }),
  });
}

main().catch((err) => {
  logger.fatal({ err: err instanceof Error ? err.message : String(err) }, "agent-runner crashed");
  process.exit(1);
});
