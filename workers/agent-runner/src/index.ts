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
import type { SupabaseClient } from "@supabase/supabase-js";
import { bootRunner } from "@ahura/runner-core";
import { loadEnv, type RunnerEnv } from "./env.js";
import { logger } from "./logger.js";
import { makeSupabase } from "./supabase.js";
import { scanRuns } from "./scan.js";
import { runAgentJob, type RunContext } from "./lifecycle.js";
import { refreshAllMcpServers } from "./tools/mcp-schema-refresh.js";

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

  startMcpSchemaRefreshLoop(env, supabase);
}

/**
 * Periodic MCP server health-check (doc 14 M4 follow-up) — runs in THIS
 * process (not a Next.js reaper route, unlike session-reaper/run-reaper)
 * because the MCP SDK only lives here (§2b rule 4). `.unref()`'d: the
 * worker/redis connection already keep the process alive, so this timer
 * alone should never block a clean shutdown.
 */
function startMcpSchemaRefreshLoop(env: RunnerEnv, supabase: SupabaseClient): void {
  if (env.mcpSchemaRefreshIntervalMs <= 0) return;

  const sweep = async () => {
    try {
      const summary = await refreshAllMcpServers({
        supabase,
        dek: env.mcpTokenDek,
        timeoutMs: env.toolTimeoutMs,
        allowPrivate: env.allowPrivateWebhooks,
        logger,
      });
      logger.info(summary, "mcp-schema-refresh: sweep complete");
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "mcp-schema-refresh: sweep failed");
    }
  };

  void sweep(); // once at boot, so status is fresh without waiting a full interval
  setInterval(() => void sweep(), env.mcpSchemaRefreshIntervalMs).unref();
}

main().catch((err) => {
  logger.fatal({ err: err instanceof Error ? err.message : String(err) }, "agent-runner crashed");
  process.exit(1);
});
