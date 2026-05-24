/**
 * BullMQ enqueue helper for fine-tuning jobs.
 *
 * The POST /api/inference/fine-tuning/jobs handler calls this after inserting
 * the row, so the ft-runner picks it up immediately instead of waiting up to
 * 5s for its Postgres claimer poll.
 *
 * This is a best-effort enqueue. If REDIS_URL isn't configured, or Redis is
 * unreachable, we swallow the error — the claimer-poll in workers/ft-runner
 * is the source of truth and will catch the row on the next tick.
 *
 * Uses the finetune row's UUID as the BullMQ jobId for natural deduplication
 * with the claimer (BullMQ rejects duplicate jobIds on `add`).
 */
import { Queue } from "bullmq";
import IORedis from "ioredis";

const QUEUE_NAME = "ahura-inference-ft-runner";

let cachedQueue: Queue | null = null;
let cachedConnection: IORedis | null = null;
let warnedOnce = false;

function getQueue(): Queue | null {
  if (cachedQueue) return cachedQueue;

  const url = process.env.REDIS_URL;
  if (!url) {
    if (!warnedOnce) {
      console.warn(
        "[ft-queue] REDIS_URL not set — ft-runner will pick up jobs via the 5s DB poll instead. Set REDIS_URL to enable instant enqueue."
      );
      warnedOnce = true;
    }
    return null;
  }

  try {
    cachedConnection = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    cachedConnection.on("error", (err) => {
      console.warn("[ft-queue] redis error:", err.message);
    });
    cachedQueue = new Queue(QUEUE_NAME, { connection: cachedConnection });
    return cachedQueue;
  } catch (err) {
    console.warn(
      "[ft-queue] failed to initialize queue:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * Add a fine-tuning job to the runner queue. Idempotent — duplicate jobId
 * (same finetune row enqueued twice) is silently ignored.
 *
 * Never throws. Logs warnings on failure; the runner's DB-poll catches
 * anything we miss.
 */
export async function enqueueFinetuneJob(finetuneId: string): Promise<void> {
  const queue = getQueue();
  if (!queue) return;

  try {
    await queue.add(
      "ft-job",
      { jobId: finetuneId },
      {
        jobId: finetuneId, // deterministic dedup
        attempts: 1, // runner handles all retry semantics itself
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 86_400 * 7, count: 1_000 },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("already exists")) return;
    console.warn("[ft-queue] enqueue failed (claimer will retry):", msg);
  }
}
