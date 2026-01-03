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
    !request.nextUrl.pathname.startsWith("/signin") &&
    !request.nextUrl.pathname.startsWith("/signup") &&
    !request.nextUrl.pathname.startsWith("/api/auth") &&
    !request.nextUrl.pathname.startsWith("/reset-password") &&
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

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so: NextResponse.next({ request })
  // 2. Copy over the cookies, like so: response.cookies.setAll(supabaseResponse.cookies.getAll())

  return supabaseResponse;
}
