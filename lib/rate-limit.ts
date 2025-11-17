import { NextRequest } from "next/server";

export interface RateLimitConfig {
  interval: number; // Time window in milliseconds
  uniqueTokenPerInterval: number; // Max number of unique tokens
}

interface RateLimitStore {
  count: number;
  resetTime: number;
}

// In-memory store for rate limiting
// Note: This will reset on server restart. For production, consider Redis
const store = new Map<string, RateLimitStore>();

/**
 * Simple rate limiter for API routes
 * @param config - Rate limit configuration
 * @returns Rate limiter function
 */
export function rateLimit(config: RateLimitConfig) {
  const { interval, uniqueTokenPerInterval } = config;

  return {
    check: async (
      req: NextRequest,
      limit: number = 5,
      token?: string
    ): Promise<void> => {
      // Use provided token or generate from IP/headers
      const identifier =
        token ||
        req.headers.get("x-forwarded-for") ||
        req.headers.get("x-real-ip") ||
        "anonymous";

      const now = Date.now();
      const key = `${identifier}:${Math.floor(now / interval)}`;

      const record = store.get(key);

      if (!record) {
        // First request in this interval
        store.set(key, {
          count: 1,
          resetTime: now + interval,
        });
        
        // Clean up old entries
        cleanup(now);
        return;
      }

      if (record.count >= limit) {
        throw new Error("Rate limit exceeded");
      }

      record.count += 1;
      store.set(key, record);
    },
  };
}

/**
 * Clean up expired entries from the store
 */
function cleanup(now: number) {
  // Only run cleanup occasionally to avoid performance impact
  if (Math.random() > 0.1) return;

  for (const [key, value] of store.entries()) {
    if (value.resetTime < now) {
      store.delete(key);
    }
  }
}

/**
 * Clear all rate limit records (useful for testing)
 */
export function clearRateLimits() {
  store.clear();
}
