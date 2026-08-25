/**
 * eval-runner entry point.
 *
 * Polls inference.eval_runs for queued runs. For each run:
 *   1. Claims it atomically (queued → running)
 *   2. Loads all test cases from the associated dataset
 *   3. Calls the target model for each case via the inference gateway
 *   4. Scores each output with the configured scorer (llm_judge / exact / contains / regex)
 *   5. Writes per-case results + aggregate scores; marks the run completed or failed
 *
 * Unlike ft-runner, eval-runner does not need RunPod — it only makes HTTP calls
 * to our own inference gateway. Single replica per cluster; CONCURRENT_CASES
 * controls per-run parallelism within one process.
 */
import { bootRunner } from "@ahura/runner-core";
import { loadEnv } from "./env.js";
import { logger } from "./logger.js";
import { makeSupabase } from "./supabase.js";
import { scanRuns } from "./scan.js";
import { runEval } from "./lifecycle.js";

const QUEUE_NAME = "ahura-inference-eval-runner";

async function main(): Promise<void> {
  const env = loadEnv();
  const supabase = makeSupabase(env);

  await bootRunner({
    serviceName: "eval-runner",
    queueName: QUEUE_NAME,
    env,
    logger,
    bootLogFields: {
      inferenceBaseUrl: env.inferenceBaseUrl,
      concurrentCases: env.concurrentCases,
      caseTimeoutMs: env.caseTimeoutMs,
      maxConcurrentJobs: env.maxConcurrentJobs,
    },
    scan: () => scanRuns(supabase, logger),
    handler: (job) => runEval({ env, supabase, logger }, job.data),
    jobLogFields: (job) => ({ runId: job?.data.runId }),
  });
}

main().catch((err) => {
  logger.fatal({ err: err instanceof Error ? err.message : String(err) }, "eval-runner crashed");
  process.exit(1);
});
