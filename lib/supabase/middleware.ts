import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              path: "/",
              secure: process.env.NODE_ENV === "production",
            });
          });
        },
      },
    }
  );

  // Call supabase.auth.getUser() with a small retry for transient network errors
  function isRetryableAuthError(err: any) {
    if (!err) return false;
    const msg = String(err?.message || "").toLowerCase();
    const name = String(err?.name || "").toLowerCase();
    const causeCode = String(err?.cause?.code || "").toLowerCase();
    return (
      name === "authretryablefetcherror" ||
      msg.includes("fetch failed") ||
      msg.includes("timeout") ||
      causeCode.includes("und_err_connect_timeout") ||
      causeCode.includes("connect_timeout")
    );
  }

  let user = null;
  let authError: any = null;
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await supabase.auth.getUser();
      user = res.data.user;
      authError = res.error;

      // If there's no error, we're done
      if (!authError) break;

      // If non-retryable auth error, stop retrying
      if (!isRetryableAuthError(authError)) break;
    } catch (err: any) {
      authError = err;
      if (!isRetryableAuthError(authError)) break;
    }

    // small backoff before retrying
    if (attempt < maxAttempts) {
      console.log(`[Supabase Middleware] Transient auth error, retrying (${attempt}/${maxAttempts - 1})...`);
      await new Promise((r) => setTimeout(r, 200 * attempt));
    }
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

  if (
    !user &&
    request.nextUrl.pathname.startsWith("/dashboard")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
