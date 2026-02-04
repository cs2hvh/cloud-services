import { updateSession } from "@/lib/supabase/middleware";
import { type NextRequest } from "next/server";
import { NextResponse } from "next/server"; // added

// ---------- IP cooldown config ----------
const IS_DEV = process.env.NODE_ENV === 'development';
const WINDOW_MS = 60_000; // 1 minute window
const MAX_REQUESTS = IS_DEV ? 500 : 30; // Higher limit in dev, stricter in production
const COOLDOWN_MS = IS_DEV ? 30_000 : 5 * 60_000; // 30s dev, 5min production

type IpRecord = {
  count: number;
  windowStart: number;
  cooldownUntil: number | null;
};

// In-memory store (single instance only; use Redis/Upstash for multi-instance)
const ipStore = new Map<string, IpRecord>();

function getClientIp(req: NextRequest): string {
  return (
    // req.ip ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function applyIpCooldown(req: NextRequest): NextResponse | null {
  const ip = getClientIp(req);
  const now = Date.now();
  const path = req.nextUrl.pathname;

  const rec = ipStore.get(ip);

  // still cooling down?
  if (rec?.cooldownUntil && now < rec.cooldownUntil) {
    const msLeft = rec.cooldownUntil - now;
    console.log(`[RATE-LIMIT] IP ${ip} still in cooldown (${msLeft}ms left). Blocked path: ${path}`);
    return new NextResponse(
      JSON.stringify({
        error: "Too many requests. Try again later.",
        cooldown_ms: msLeft,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": Math.ceil(msLeft / 1000).toString(),
        },
      },
    );
  }

  // new window
  if (!rec || now - rec.windowStart > WINDOW_MS) {
    ipStore.set(ip, { count: 1, windowStart: now, cooldownUntil: null });
    return null;
  }

  // same window: increment
  rec.count += 1;

  // exceeded -> start cooldown
  if (rec.count > MAX_REQUESTS) {
    rec.cooldownUntil = now + COOLDOWN_MS;
    ipStore.set(ip, rec);
    console.log(`[RATE-LIMIT] IP ${ip} exceeded limit (${rec.count} requests). Last path: ${path}`);
    return new NextResponse(
      JSON.stringify({
        error: "Too many requests. Try again later.",
        cooldown_ms: COOLDOWN_MS,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": Math.ceil(COOLDOWN_MS / 1000).toString(),
        },
      },
    );
  }

  ipStore.set(ip, rec);
  return null;
}
// ---------------------------------------

export async function middleware(request: NextRequest) {
  // IP cooldown check (early return if limited)
  const limited = applyIpCooldown(request);
  if (limited) return limited;

  // Update session (handles session refresh to prevent 30-min logout)
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets
     * 
     * IMPORTANT: The matcher MUST include dashboard routes and API routes
     * for session refresh to work properly. Without this, users get logged
     * out after 30 minutes because sessions aren't being refreshed.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
