/**
 * Token-bucket rate limiter Durable Object.
 *
 * One DO instance per API key. State persists across isolate evictions
 * via DO storage. Refill computed lazily on each request.
 *
 * Algorithm: classic token bucket
 *   • capacity = burst
 *   • refill rate = rps tokens/sec
 *   • each take(cost) deducts `cost` tokens; rejects if not enough
 */

interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

export class RateLimiter implements DurableObject {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== "/take") {
      return new Response("Not found", { status: 404 });
    }

    const { rps, burst, cost } = (await request.json()) as {
      rps: number;
      burst: number;
      cost: number;
    };

    const now = Date.now();
    const stored = (await this.state.storage.get<BucketState>("bucket")) ?? {
      tokens: burst,
      lastRefillMs: now,
    };

    // Refill since last call
    const elapsedSec = (now - stored.lastRefillMs) / 1000;
    const refilled = Math.min(burst, stored.tokens + elapsedSec * rps);

    if (refilled < cost) {
      const deficit = cost - refilled;
      const retryAfterMs = Math.ceil((deficit / rps) * 1000);
      await this.state.storage.put("bucket", {
        tokens: refilled,
        lastRefillMs: now,
      });
      return Response.json({
        allowed: false,
        retryAfterMs,
        remaining: Math.floor(refilled),
      });
    }

    const remaining = refilled - cost;
    await this.state.storage.put("bucket", {
      tokens: remaining,
      lastRefillMs: now,
    });
    return Response.json({
      allowed: true,
      retryAfterMs: 0,
      remaining: Math.floor(remaining),
    });
  }
}
