/**
 * Throttle for the panel's own sign-in endpoints.
 *
 * Moving the password grant server-side removed a browser dependency on a
 * third-party domain, but it also turned this origin into an unauthenticated
 * endpoint that will try credentials against Supabase on request. Supabase
 * rate-limits per source IP, and every attempt now arrives from ONE IP — the
 * panel's — so its protection no longer separates one admin from an attacker.
 * This replaces it at our door: per-IP and per-email sliding windows.
 *
 * In-memory on purpose: the panel is a single systemd service on one host, so
 * a shared store would add a dependency for no gain. If it is ever run as
 * more than one process, this needs to move to the database.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 20;
const MAX_PER_EMAIL = 8;

type Hit = { count: number; resetAt: number };

const byIp = new Map<string, Hit>();
const byEmail = new Map<string, Hit>();

function bump(store: Map<string, Hit>, key: string, max: number) {
  const now = Date.now();
  const hit = store.get(key);
  if (!hit || hit.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { limited: false, retryAfterSec: 0 };
  }
  hit.count += 1;
  if (hit.count > max) {
    return {
      limited: true,
      retryAfterSec: Math.max(1, Math.ceil((hit.resetAt - now) / 1000)),
    };
  }
  return { limited: false, retryAfterSec: 0 };
}

/** Sweep expired entries so a long-lived process does not grow unbounded. */
function sweep(store: Map<string, Hit>) {
  const now = Date.now();
  for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

export function checkLoginThrottle(
  request: Request,
  email: string,
): { limited: boolean; retryAfterSec: number } {
  if (byIp.size > 500) sweep(byIp);
  if (byEmail.size > 500) sweep(byEmail);

  const ip = bump(byIp, clientIp(request), MAX_PER_IP);
  if (ip.limited) return ip;
  if (!email) return { limited: false, retryAfterSec: 0 };
  return bump(byEmail, email.trim().toLowerCase(), MAX_PER_EMAIL);
}

/** A successful sign-in clears that email's budget; the IP window stands. */
export function clearEmailThrottle(email: string) {
  byEmail.delete(email.trim().toLowerCase());
}
