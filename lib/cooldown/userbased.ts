import { redis } from "../redis";

export type LimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

function normalize(id: string): string {
  return id.trim().toLowerCase();
}

/**
 * Per-user fixed window rate limit using Upstash Redis.
 * Example defaults: 5 req / 60s per user per prefix.
 */
export async function limitByUser(
  userId: string,
  {
    prefix = "rl:user",
    limit = 5,
    windowMs = 60_000,
  }: { prefix?: string; limit?: number; windowMs?: number } = {}
): Promise<LimitResult> {
  const id = normalize(userId);
  const key = `${prefix}:${id}:${Math.floor(Date.now() / windowMs)}`;

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, Math.ceil(windowMs / 1000));
  }

  if (count > limit) {
    const ttl = await redis.ttl(key);
    return { allowed: false, retryAfterSec: Math.max(ttl, 1) };
  }

  return { allowed: true };
}
