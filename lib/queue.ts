// lib/queue.ts
import { Queue } from "bullmq";
import IORedis from "ioredis";

// Define a more specific type for globalThis
declare global {
  var __provisionQueue: Queue | undefined;
  var __redisConnection: IORedis | undefined;
}

/**
 * Lazy Redis connection getter - prevents build-time connection attempts
 * Only instantiates when actually accessed at runtime
 */
function getRedisConnection(): IORedis {
  if (!globalThis.__redisConnection) {
    if (!process.env.REDIS_URL) {
      throw new Error('REDIS_URL environment variable is not set');
    }
    globalThis.__redisConnection = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true, // Don't connect immediately
    });
  }
  return globalThis.__redisConnection;
}

/**
 * Export redis as a getter function to prevent immediate instantiation
 */
export const getRedis = getRedisConnection;

/**
 * Lazy provision queue getter - only creates queue when accessed
 * Prevents build-time Redis connection attempts
 */
function getProvisionQueue(): Queue {
  if (!globalThis.__provisionQueue) {
    globalThis.__provisionQueue = new Queue(
      process.env.QUEUE_NAME ?? "provision-queue",
      {
        connection: getRedisConnection(),
        defaultJobOptions: { removeOnComplete: true, attempts: 1 },
      }
    );
  }
  return globalThis.__provisionQueue;
}

/**
 * Export as getter function instead of direct export
 * This ensures lazy initialization only at runtime
 */
export const getQueue = getProvisionQueue;

// For backward compatibility, export a proxy that lazily initializes
export const provisionQueue = new Proxy({} as Queue, {
  get(target, prop) {
    const queue = getProvisionQueue();
    const value = queue[prop as keyof Queue];
    if (typeof value === 'function') {
      return value.bind(queue);
    }
    return value;
  },
});
