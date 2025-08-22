// lib/rate-limit.ts

import { redis } from "../redis";


export type LimitResult = { allowed: true } | { allowed: false; retryAfterSec: number };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function limitByEmail(
  email: string,
  {
    prefix = "rl:email",
    limit = 5,           // e.g. 5 requests
    windowMs = 60_000,   // per 1 minute
  } = {}
): Promise<LimitResult> {
  const id = normalizeEmail(email);
  const key = `${prefix}:${id}:${Math.floor(Date.now() / windowMs)}`;

  // INCR in this time bucket
  const count = await redis.incr(key);
  if (count === 1) {
    // first hit in bucket: set TTL to window size (seconds)
    await redis.expire(key, Math.ceil(windowMs / 1000));
  }

  if (count > limit) {
    // how long until bucket expires?
    const ttl = await redis.ttl(key);
    return { allowed: false, retryAfterSec: Math.max(ttl, 1) };
  }

  return { allowed: true };
}
