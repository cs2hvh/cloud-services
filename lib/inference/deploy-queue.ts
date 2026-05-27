/**
 * BullMQ enqueue helper for BYO deployment jobs.
 *
 * Mirrors lib/inference/finetune-queue.ts. The deploy-runner (separate
 * Node project on k8s, mirror of ft-runner) consumes this queue, but its
 * Postgres claimer also polls — so this is a best-effort optimization to
 * avoid the 5s poll delay.
 */
import { Queue } from "bullmq";
import IORedis from "ioredis";

const QUEUE_NAME = "ahura-inference-deploy-runner";

let cachedQueue: Queue | null = null;
let cachedConnection: IORedis | null = null;
let warnedOnce = false;

function getQueue(): Queue | null {
  if (cachedQueue) return cachedQueue;

  const url = process.env.REDIS_URL;
  if (!url) {
    if (!warnedOnce) {
      console.warn(
        "[deploy-queue] REDIS_URL not set — deploy-runner will pick up jobs via the 5s DB poll instead."
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
      console.warn("[deploy-queue] redis error:", err.message);
    });
    cachedQueue = new Queue(QUEUE_NAME, { connection: cachedConnection });
    return cachedQueue;
  } catch (err) {
    console.warn(
      "[deploy-queue] failed to initialize queue:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

export type DeployAction = "create" | "scale" | "delete";

export interface DeployJobPayload {
  deploymentId: string;
  action: DeployAction;
}

/**
 * Idempotent — jobId encodes deployment + action so the same operation
 * isn't double-processed. Never throws.
 */
export async function enqueueDeploymentJob(
  deploymentId: string,
  action: DeployAction
): Promise<void> {
  const queue = getQueue();
  if (!queue) return;

  try {
    await queue.add(
      "deploy-job",
      { deploymentId, action } satisfies DeployJobPayload,
      {
        jobId: `${deploymentId}:${action}`,
        attempts: 1,
        removeOnComplete: { age: 86_400, count: 1_000 },
        removeOnFail: { age: 86_400 * 7, count: 1_000 },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("already exists")) return;
    console.warn("[deploy-queue] enqueue failed (claimer will retry):", msg);
  }
}
