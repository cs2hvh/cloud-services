// lib/queue.ts
import { Queue } from "bullmq";
import IORedis from "ioredis";

// Define a more specific type for globalThis
declare global {
  var __provisionQueue: Queue | undefined;
}

export const redis = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const provisionQueue: Queue =
  globalThis.__provisionQueue ||
  (globalThis.__provisionQueue = new Queue(process.env.QUEUE_NAME ?? "provision-queue", {
    connection: redis,
    defaultJobOptions: { removeOnComplete: true, attempts: 1 },
  }));
