/**
 * Idempotency Helper
 * Uses Redis to prevent duplicate operations based on Idempotency-Key header
 */
import { redis } from "./redis";

export type IdempotencyResult = 
  | {
      status: "new";
      reserve: () => Promise<boolean>;
      complete: (data: unknown) => Promise<void>;
      abort: () => Promise<void>;
    }
  | { status: "in-progress"; retryAfter: number }
  | { status: "completed"; data: unknown };

/**
 * Check idempotency key and return status
 * @param key - Idempotency key from header
 * @param ttlSeconds - TTL for the idempotency record (default 24 hours)
 */
export async function checkIdempotency(
  key: string,
  ttlSeconds: number = 86400
): Promise<IdempotencyResult> {
  const redisKey = `idemp:${key}`;

  try {
    // Check if key exists
    const existing = await redis.get(redisKey);

    if (existing) {
      const data = JSON.parse(existing as string);

      if (data.status === "in-progress") {
        return {
          status: "in-progress",
          retryAfter: 5, // Retry after 5 seconds
        };
      }

      if (data.status === "completed") {
        return {
          status: "completed",
          data: data.result,
        };
      }
    }

    // New operation - return reserve and complete functions
    return {
      status: "new",
      reserve: async () => {
        // Use NX flag for atomic reservation (returns "OK" if set, null if exists)
        const result = await redis.set(
          redisKey,
          JSON.stringify({ status: "in-progress", created_at: Date.now() }),
          { ex: ttlSeconds, nx: true }
        );
        return result === "OK";
      },
      complete: async (result: unknown) => {
        await redis.set(
          redisKey,
          JSON.stringify({ status: "completed", result, completed_at: Date.now() }),
          { ex: ttlSeconds }
        );
      },
      abort: async () => {
        await redis.del(redisKey);
      },
    };
  } catch (error) {
    console.error("[Idempotency] Redis error:", error);
    // On Redis failure, allow the operation (fail open)
    return {
      status: "new",
      reserve: async () => true,
      complete: async () => {},
      abort: async () => {},
    };
  }
}

/**
 * Extract idempotency key from request headers
 */
export function getIdempotencyKey(headers: Headers): string | null {
  return headers.get("idempotency-key") || headers.get("Idempotency-Key");
}
