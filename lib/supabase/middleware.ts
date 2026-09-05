import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase Session Middleware
 * 
 * This middleware handles session refresh to prevent the 30-minute logout issue.
 * 
 * KEY FIX: The getUser() call automatically refreshes the session if it's expired
 * but the refresh token is still valid. The setAll() callback ensures the new
 * session cookies are properly set in the response.
 * 
 * IMPORTANT: Supabase sessions have a default expiry of 1 hour, but this can be
 * configured in Supabase dashboard under Authentication > Settings.
 * The refresh token is valid for much longer (default 7 days).
 */
/**
 * user_profiles.suspend for the session's own user, read through the cookie
 * client (RLS lets a user read their own row) and remembered for a minute per
 * isolate, so the check costs one query per user per minute rather than one
 * per request. Unreadable means not suspended: a read failure is not evidence
 * about the user. A suspension therefore takes effect within a minute, which
 * matches the revocation window elsewhere on the platform.
 */
const SUSPEND_CACHE_MS = 60_000;
const suspendCache = new Map<string, { suspended: boolean; until: number }>();

async function isSuspended(
  supabase: ReturnType<typeof createServerClient>,
  userId: string
): Promise<boolean> {
  const now = Date.now();
  const cached = suspendCache.get(userId);
  if (cached && cached.until > now) return cached.suspended;
  let suspended = false;
  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("suspend")
      .eq("id", userId)
      .maybeSingle();
    if (!error) suspended = (data as { suspend?: boolean | null } | null)?.suspend === true;
  } catch (readError) {
    console.log(
      "[Supabase Middleware] suspend flag unreadable, allowing:",
      readError instanceof Error ? readError.message : "unknown"
    );
  }
  if (suspendCache.size > 10_000) suspendCache.clear();
  suspendCache.set(userId, { suspended, until: now + SUSPEND_CACHE_MS });
  return suspended;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // This is called when the session is refreshed
          // We need to update BOTH the request cookies AND the response cookies
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            // Extend cookie maxAge to 7 days (604800 seconds) to prevent early expiration
            // The Supabase refresh token is valid for 7 days by default
            const extendedOptions = {
              ...options,
              maxAge: options?.maxAge || 604800, // 7 days in seconds
              sameSite: options?.sameSite || 'lax' as const,
              secure: process.env.NODE_ENV === 'production',
            };
            supabaseResponse.cookies.set(name, value, extendedOptions);
          });
        },
      },
    },
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // This call will automatically refresh the session if needed
  // The refreshed session cookies are set via the setAll callback above
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  // Log session refresh errors (but don't block the request)
  if (userError && userError.message !== 'Auth session missing!') {
    console.log('[Supabase Middleware] Session error:', userError.message);
  }

  // Protected routes check
  const isProtectedRoute = 
    request.nextUrl.pathname.startsWith("/dashboard") &&
    !request.nextUrl.pathname.startsWith("/signin") &&
    !request.nextUrl.pathname.startsWith("/signup") &&
    !request.nextUrl.pathname.startsWith("/api/auth") &&
    !request.nextUrl.pathname.startsWith("/reset-password") &&
    !request.nextUrl.pathname.startsWith("/api/v1/agents") && // Public agent API endpoints
    !request.nextUrl.pathname.startsWith("/api/ai-agents/platform-models") && // Public platform models list
    request.nextUrl.pathname !== "/" &&
    !request.nextUrl.pathname.startsWith("/api/webhooks");

  if (!user && isProtectedRoute) {
    // No user and trying to access protected route - redirect to login
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    // Preserve the original URL so we can redirect back after login
    url.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // A password-only session on an MFA account is not a signed-in session.
  // signInWithPassword issues an aal1 cookie before the TOTP step, and the step
  // itself was enforced only in the browser, so navigating straight to
  // /dashboard skipped it entirely. nextLevel is "aal2" only for accounts with a
  // verified factor, so this turns away exactly those, and accounts without MFA
  // are unaffected.
  //
  // Fails OPEN if the level cannot be read: this runs on every request to a
  // protected route, and a throw here would otherwise redirect every MFA user to
  // signin in a loop. The API-side check in authenticateUser is the second layer.
  // EVERY cookie-authenticated API route, not only the dashboard. 77 routes
  // under /api call supabase.auth.getUser() themselves instead of the shared
  // helper, so a check that lives only in the helper never runs for them
  // (the GPU pod list and provision routes were the local validation's
  // example). This is the one place every request passes through, so the
  // second-factor and suspension decisions are made here for all of them.
  // /api/auth stays out: the MFA challenge, sign-out and recovery must stay
  // reachable from a half-authenticated or suspended session.
  const isCookieApiRoute =
    request.nextUrl.pathname.startsWith("/api") &&
    !request.nextUrl.pathname.startsWith("/api/auth");

  if (user && (isProtectedRoute || isCookieApiRoute)) {
    let secondFactorMissing = false;
    try {
      const { data: aal } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      secondFactorMissing = aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2";
    } catch (aalError) {
      // Read from the session JWT, not fetched: a throw means the library or
      // token shape is wrong, not that the user is unauthorised. Fail open
      // rather than lock every MFA user out on a fault of ours.
      console.log(
        "[Supabase Middleware] assurance level unreadable, allowing:",
        aalError instanceof Error ? aalError.message : "unknown"
      );
    }

    if (secondFactorMissing) {
      if (isCookieApiRoute) {
        return NextResponse.json(
          { message: "Two-factor authentication required", code: "mfa_required" },
          { status: 401 }
        );
      }
      const url = request.nextUrl.clone();
      url.pathname = "/signin";
      url.searchParams.set("mfa", "required");
      url.searchParams.set("redirectTo", request.nextUrl.pathname);
      return NextResponse.redirect(url);
    }

    if (await isSuspended(supabase, user.id)) {
      if (isCookieApiRoute) {
        return NextResponse.json(
          { message: "This account is suspended. Contact support.", code: "account_suspended" },
          { status: 403 }
        );
      }
      // The signout route ends the session and lands on /signin with the
      // reason; sending a signed-in user to /signin would bounce them back.
      const url = request.nextUrl.clone();
      url.pathname = "/api/auth/signout";
      url.search = "?reason=account_suspended";
      return NextResponse.redirect(url);
    }
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so: NextResponse.next({ request })
  // 2. Copy over the cookies, like so: response.cookies.setAll(supabaseResponse.cookies.getAll())

  return supabaseResponse;
}
