/**
 * Per-(api_key, model) token-bucket rate limit, backed by a Durable Object.
 *
 * Why a DO and not Redis: DO state is single-region-consistent and survives
 * Worker isolate eviction. With ~30 RPS average and ~500 RPS bursts (per the
 * platform scale target), a single DO per key handles it comfortably without
 * cross-region coordination.
 *
 * Phase 1.5: the API key can override the platform default via
 * inference.api_keys.rate_limit_rpm (DB-validated to [1, 10000]). Null
 * = use DEFAULT_RPM. Burst is derived as ~6 seconds of capacity, floored
 * at 10, so single-burst spikes are absorbed without being trivially
 * abusable.
 */
import type { MiddlewareHandler } from "hono";
import type { Env, HonoVariables } from "../types.ts";

const DEFAULT_RPM = 600; // 10 RPS — matches the pre-Phase-1.5 hardcoded value

function bucketFromRpm(rpm: number): { rps: number; burst: number } {
  const rps = rpm / 60;
  // Six seconds of capacity, floored at 10 — absorbs short spikes
  // without giving a misconfigured low-cap key zero burst headroom.
  const burst = Math.max(10, Math.ceil(rps * 6));
  return { rps, burst };
}

export const rateLimitMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: HonoVariables;
}> = async (c, next) => {
  const auth = c.get("auth");
  const id = c.env.RATE_LIMITER.idFromName(auth.keyId);
  const stub = c.env.RATE_LIMITER.get(id);

  const effectiveRpm =
    typeof auth.rateLimitRpm === "number" && auth.rateLimitRpm > 0
      ? auth.rateLimitRpm
      : DEFAULT_RPM;
  const { rps, burst } = bucketFromRpm(effectiveRpm);

  const response = await stub.fetch("https://ratelimit.internal/take", {
    method: "POST",
    body: JSON.stringify({ rps, burst, cost: 1 }),
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
