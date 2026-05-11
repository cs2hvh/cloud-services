import { Queue } from "bullmq";
import { getRedis } from "./queue";

declare global {
  var __buildQueue: Queue | undefined;
  var __quickBuildQueue: Queue | undefined;
}

// Standard queue for all application builds
export const buildQueue = new Proxy({} as Queue, {
  get(_target, prop) {
    if (!globalThis.__buildQueue) {
      globalThis.__buildQueue = new Queue("app-build-queue", {
        connection: getRedis(),
        defaultJobOptions: {
          removeOnComplete: true,
          attempts: 1,
        },
      });
    }
    const queue = globalThis.__buildQueue as Queue;
    const value = queue[prop as keyof Queue];
    return typeof value === "function" ? value.bind(queue) : value;
  },
});

// High-priority queue for hotfixes / production patches
export const quickBuildQueue = new Proxy({} as Queue, {
  get(_target, prop) {
    if (!globalThis.__quickBuildQueue) {
      globalThis.__quickBuildQueue = new Queue("quick-build-queue", {
        connection: getRedis(),
        defaultJobOptions: {
          removeOnComplete: true,
          attempts: 1,
        },
      });
    }
    const queue = globalThis.__quickBuildQueue as Queue;
    const value = queue[prop as keyof Queue];
    return typeof value === "function" ? value.bind(queue) : value;
  },
});
