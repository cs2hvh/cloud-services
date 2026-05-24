/**
 * Per-(api_key, model) token-bucket rate limit, backed by a Durable Object.
 *
 * Why a DO and not Redis: DO state is single-region-consistent and survives
 * Worker isolate eviction. With ~30 RPS average and ~500 RPS bursts (per the
 * platform scale target), a single DO per key handles it comfortably without
 * cross-region coordination.
 */
import type { MiddlewareHandler } from "hono";
import type { Env, HonoVariables } from "../types.ts";

const DEFAULT_RPS = 10;
const DEFAULT_BURST = 60;

export const rateLimitMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: HonoVariables;
}> = async (c, next) => {
  const auth = c.get("auth");
  const id = c.env.RATE_LIMITER.idFromName(auth.keyId);
  const stub = c.env.RATE_LIMITER.get(id);

  const response = await stub.fetch("https://ratelimit.internal/take", {
    method: "POST",
    body: JSON.stringify({ rps: DEFAULT_RPS, burst: DEFAULT_BURST, cost: 1 }),
  });
  const result = (await response.json()) as {
    allowed: boolean;
    retryAfterMs: number;
    remaining: number;
  };

  c.header("X-Ahura-RateLimit-Remaining", String(result.remaining));

  if (!result.allowed) {
    c.header("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
    return c.json(
      {
        error: {
          message: "Rate limit exceeded",
          type: "rate_limit_error",
          code: "rate_limit_exceeded",
          retry_after_ms: result.retryAfterMs,
        },
      },
      429
    );
  }

  await next();
};
