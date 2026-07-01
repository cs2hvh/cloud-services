import { updateSession } from "@/lib/supabase/middleware";
import { type NextRequest } from "next/server";
import { NextResponse } from "next/server";

// ---------- IP rate limiting config ----------
// Two-tier strategy:
// 1. Strict IP-based limits for public/auth routes (prevent abuse)
// 2. Relaxed/no IP limits for authenticated routes (rely on per-user rate limits in API handlers)

const IS_DEV = process.env.NODE_ENV === 'development';

// Rate limits for AUTH routes only (login, signup, password reset)
const AUTH_WINDOW_MS = 60_000; // 1 minute
const AUTH_MAX_REQUESTS = IS_DEV ? 50 : 20; // Strict for auth endpoints
const AUTH_COOLDOWN_MS = IS_DEV ? 30_000 : 2 * 60_000; // 30s dev, 2min production

type IpRecord = {
  count: number;
  windowStart: number;
  cooldownUntil: number | null;
};

// In-memory store for IP rate limiting (use Redis/Upstash for multi-instance in future)
const ipStore = new Map<string, IpRecord>();
const IP_STORE_MAX_SIZE = 10_000;
const IP_STORE_CLEANUP_INTERVAL_MS = 5 * 60_000; // 5 minutes

// Periodic cleanup of stale entries to prevent memory leaks
function cleanupIpStore() {
  const now = Date.now();
  for (const [ip, rec] of ipStore) {
    const windowExpired = now - rec.windowStart > AUTH_WINDOW_MS * 2;
    const cooldownExpired = !rec.cooldownUntil || now > rec.cooldownUntil;
    if (windowExpired && cooldownExpired) {
      ipStore.delete(ip);
    }
  }
}

// Periodic cleanup interval — unref so it doesn't keep the process alive
const _cleanupInterval = setInterval(cleanupIpStore, IP_STORE_CLEANUP_INTERVAL_MS);
if (typeof _cleanupInterval === 'object' && _cleanupInterval?.unref) {
  _cleanupInterval.unref();
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function shouldApplyIpRateLimit(pathname: string): boolean {
  // Only apply strict IP rate limiting to public authentication routes
  // These are the endpoints vulnerable to credential stuffing and brute force attacks
  const authRoutes = [
    '/api/auth/signin',
    '/api/auth/signup', 
    '/api/auth/reset-password',
    '/api/auth/verify-email',
    '/api/auth/forgot-password',
  ];
  
  return authRoutes.some(route => pathname.startsWith(route));
}

function applyIpCooldown(req: NextRequest): NextResponse | null {
  const pathname = req.nextUrl.pathname;
  
  // Skip IP rate limiting for authenticated dashboard and most API routes
  // These routes have their own per-user rate limiting via limitByUser()
  if (!shouldApplyIpRateLimit(pathname)) {
    return null;
  }

  // Evict oldest entries if store grows too large (memory safety valve)
  if (ipStore.size > IP_STORE_MAX_SIZE) {
    cleanupIpStore();
    // If still over limit after cleanup, drop oldest half
    if (ipStore.size > IP_STORE_MAX_SIZE) {
      const entries = [...ipStore.entries()].sort((a, b) => a[1].windowStart - b[1].windowStart);
      const toRemove = Math.floor(entries.length / 2);
      for (let i = 0; i < toRemove; i++) ipStore.delete(entries[i][0]);
    }
  }

  const ip = getClientIp(req);
  const now = Date.now();
  const rec = ipStore.get(ip);

  // Check if still in cooldown
  if (rec?.cooldownUntil && now < rec.cooldownUntil) {
    const msLeft = rec.cooldownUntil - now;
    console.log(`[AUTH-RATE-LIMIT] IP ${ip} in cooldown (${msLeft}ms left). Path: ${pathname}`);
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

  // Start new window or continue counting
  if (!rec || now - rec.windowStart > AUTH_WINDOW_MS) {
    ipStore.set(ip, { count: 1, windowStart: now, cooldownUntil: null });
    return null;
  }

  // Increment count in current window
  rec.count += 1;

  // Exceeded limit - trigger cooldown
  if (rec.count > AUTH_MAX_REQUESTS) {
    rec.cooldownUntil = now + AUTH_COOLDOWN_MS;
    ipStore.set(ip, rec);
    console.log(`[AUTH-RATE-LIMIT] IP ${ip} exceeded limit (${rec.count} requests). Path: ${pathname}`);
    return new NextResponse(
      JSON.stringify({
        error: "Too many requests. Try again later.",
        cooldown_ms: AUTH_COOLDOWN_MS,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": Math.ceil(AUTH_COOLDOWN_MS / 1000).toString(),
        },
      },
    );
  }

  ipStore.set(ip, rec);
  return null;
}
// ---------------------------------------

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hasAuthorizationHeader = request.headers.has('authorization');
  
  // STREAMING ROUTES: Completely bypass middleware to prevent response buffering
  // These routes use Server-Sent Events (SSE) which must not be touched by middleware
  if (pathname.startsWith('/api/ai-agents/') && pathname.endsWith('/test')) {
    return NextResponse.next();
  }
  if (pathname.startsWith('/api/ai-agents') && hasAuthorizationHeader) {
    return NextResponse.next();
  }
  if (pathname.startsWith('/api/knowledge-bases') && hasAuthorizationHeader) {
    return NextResponse.next();
  }
  if (pathname.startsWith('/api/v1/agents/') && pathname.endsWith('/chat')) {
    return NextResponse.next();
  }

  // IP-based rate limiting (only for auth routes)
  // Dashboard and API routes rely on per-user rate limits in their handlers
  const limited = applyIpCooldown(request);
  if (limited) return limited;

  // Public marketing/static surfaces don't need a server-side session read.
  // Skipping updateSession() (and thus the Supabase Auth getUser() round-trip
  // + any Set-Cookie) keeps TTFB low and lets Cloudflare cache the now-static
  // marketing pages. Authenticated surfaces still run it below, so session
  // refresh + the protected-route redirect are unaffected (a logged-in user's
  // session is refreshed on every /dashboard and /api request, plus the client
  // refreshes every ~10 min).
  const needsSession =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/signin") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/reset-password");
  if (!needsSession) {
    return NextResponse.next();
  }

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
