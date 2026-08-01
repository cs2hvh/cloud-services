import { redis } from "../redis";

export type LimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSec: number; remaining: 0 };

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
    return { allowed: false, retryAfterSec: Math.max(ttl, 1), remaining: 0 };
  }

  return { allowed: true, remaining: Math.max(0, limit - count) };
}

/**
 * Give back a slot taken by `limitByUser`.
 *
 * `limitByUser` consumes up front, which is right for abuse protection but
 * wrong for expensive endpoints that can reject a request without doing any
 * work: a user who mistypes a field N times would burn the whole window even
 * though nothing was ever created. Callers that can tell "nothing happened"
 * refund the slot.
 *
 * Best-effort by design: the window key is time-derived, so a refund that
 * lands after a window boundary is simply dropped rather than corrupting the
 * next window. Never throws — a failed refund must not fail the request.
 */
export async function releaseUserLimit(
  userId: string,
  {
    prefix = "rl:user",
    windowMs = 60_000,
  }: { prefix?: string; windowMs?: number } = {}
): Promise<void> {
  try {
    const id = normalize(userId);
    const key = `${prefix}:${id}:${Math.floor(Date.now() / windowMs)}`;
    const current = await redis.get<number | string | null>(key);
    if (current === null || current === undefined) return; // window rolled over
    if (Number(current) > 0) await redis.decr(key);
  } catch {
    // Refunds are an optimization, never a correctness requirement.
  }
}
