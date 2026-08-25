/**
 * data-runner entry point.
 *
 * Polls inference.connectors for queued syncs. For each connector:
 *   1. Claims it atomically (queued → syncing)
 *   2. Lists the source (S3 bucket / web crawl)
 *   3. Incrementally ingests it into the bound vector collection —
 *      fetch → extract → chunk → batch-embed → upsert, skipping unchanged
 *      documents (content-hash / ETag) and tombstoning deleted ones
 *   4. Settles the connector (counters, next_sync_at) + optional webhook
 *
 * Like eval-runner, this needs NO GPU — it only makes HTTP calls to our own
 * inference gateway for embeddings and OCR. Single replica per cluster;
 * MAX_CONCURRENT_JOBS controls how many connectors sync in parallel within one
 * process, and FETCH_CONCURRENCY / EMBED_BATCH control per-sync parallelism.
 *
 * Doc: nextstespsAI/20-rag-connectors-and-data-runner.md.
 */
import { hostname } from "node:os";
import { bootRunner } from "@ahura/runner-core";
import { loadEnv } from "./env.js";
import { logger } from "./logger.js";
import { makeSupabase } from "./supabase.js";
import { scanConnectors } from "./scan.js";
import { runSync } from "./lifecycle.js";

const QUEUE_NAME = "ahura-inference-data-runner";

async function main(): Promise<void> {
  const env = loadEnv();
  const supabase = makeSupabase(env);
  const podId = `data-runner-${hostname()}-${process.pid}`;

  await bootRunner({
    serviceName: "data-runner",
    queueName: QUEUE_NAME,
    env,
    logger,
    bootLogFields: {
      inferenceBaseUrl: env.inferenceBaseUrl,
      maxConcurrentJobs: env.maxConcurrentJobs,
      fetchConcurrency: env.fetchConcurrency,
      embedBatch: env.embedBatch,
    },
    scan: () => scanConnectors(supabase, logger, env.maxConcurrentJobs),
    handler: (job) => runSync({ env, supabase, logger, podId }, job.data),
    jobLogFields: (job) => ({ connectorId: job?.data.connectorId }),
  });
}

main().catch((err) => {
  logger.fatal({ err: err instanceof Error ? err.message : String(err) }, "data-runner crashed");
  process.exit(1);
});
