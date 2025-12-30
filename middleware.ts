import { updateSession } from "@/lib/supabase/middleware";
import { type NextRequest } from "next/server";
import { NextResponse } from "next/server"; // added

// ---------- IP cooldown config ----------
const WINDOW_MS = 60_000; // 1 minute window
const MAX_REQUESTS = 30; // allow 20 requests per IP per window
const COOLDOWN_MS = 5 * 60_000; // 5 minutes cooldown when exceeded

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

  const rec = ipStore.get(ip);

  // still cooling down?
  if (rec?.cooldownUntil && now < rec.cooldownUntil) {
    const msLeft = rec.cooldownUntil - now;
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

  // Skip client secret check for:
  // 1. Non-API routes (frontend navigation)
  // 2. Auth callback routes (OAuth redirects from providers)
  // 3. Webhook routes (external services)
  // 4. Public APIs that are called from client-side without axios
  // 5. Git provider APIs (repositories, branches) - called from app deployment wizard
  const isApiRoute = request.nextUrl.pathname.startsWith('/api');
  const isAuthCallback = request.nextUrl.pathname.startsWith('/api/auth/callback');
  const isWebhook = request.nextUrl.pathname.startsWith('/api/webhooks');
  const isPublicApi = request.nextUrl.pathname.startsWith('/api/auth/providers') ||
                      request.nextUrl.pathname.startsWith('/api/auth/link');
  
  // Git provider APIs - these are called from the app deployment wizard (new.tsx)
  // using fetch() without the x-client-secret header
  const pathname = request.nextUrl.pathname;
  const isGitProviderApi = 
    pathname.startsWith('/api/github/repositories') ||
    pathname.startsWith('/api/github/branches') ||
    pathname.startsWith('/api/gitlab/repositories') ||
    pathname.startsWith('/api/gitlab/branches') ||
    pathname.startsWith('/api/bitbucket/repositories') ||
    pathname.startsWith('/api/bitbucket/branches') ||
    pathname.startsWith('/api/detect-framework') ||
    pathname.startsWith('/api/admin/proxmox') ||
    pathname.startsWith('/api/services/platform-apps');

  // Only check x-client-secret for API routes that aren't auth callbacks, webhooks, or git provider APIs
  if (isApiRoute && !isAuthCallback && !isWebhook && !isPublicApi && !isGitProviderApi) {
    if (
      request?.headers?.get("x-client-secret") !==
      process.env.NEXT_PUBLIC_CLIENT_SECRET
    ) {
      console.log(
        '[Middleware] Client secret mismatch for:',
        request.nextUrl.pathname,
        'Got:',
        request?.headers?.get("x-client-secret")?.substring(0, 10) + '...',
      );
      return new NextResponse(
        JSON.stringify({
          error: "Unauthorized - Invalid client secret",
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }
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
