// lib/redis.ts
import { Redis } from "@upstash/redis";

let redisInstance: Redis | null = null;

/**
 * Lazy Redis client getter - instantiates only when accessed
 * Prevents build failures when Redis env vars are missing at build time
 */
function getRedis(): Redis {
  if (!redisInstance) {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      console.warn('[Upstash Redis] Missing environment variables (url or token)');
      throw new Error('Redis configuration missing: UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set');
    }
    redisInstance = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redisInstance;
}

/**
 * Export redis as a Proxy that lazily instantiates on property access
 * This allows existing code to continue using `redis.get()`, `redis.set()`, etc.
 */
export const redis = new Proxy({} as Redis, {
  get(target, prop) {
    const instance = getRedis();
    const value = instance[prop as keyof Redis];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  }
});
