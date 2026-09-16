import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Admin gate for every route in this app.
 *
 * Unlike the main app (where /dashboard/admin pages each perform their own
 * requireAdmin() check), this middleware denies by default: any request that
 * is not from an authenticated admin is turned away before a page or API
 * handler runs. Pages and API routes still run their own checks on top —
 * defense in depth, and it keeps the shared handlers portable.
 *
 * The admin policy mirrors lib/supabase/auth.ts requireAdmin(): ADMIN_EMAILS
 * wins when set, otherwise the user_profiles.roles column decides.
 */

// /api/auth/* is the panel's own sign-in path — it must be reachable by a
// request that is not yet authenticated, which is the whole point of it.
// Those routes throttle themselves (lib/auth-throttle.ts); everything else
// stays denied by default.
const PUBLIC_PATHS = ["/signin", "/api/auth"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function middleware(request: NextRequest) {
  // PUBLIC PATHS SHORT-CIRCUIT FIRST, BEFORE ANY SUPABASE WORK.
  //
  // This check used to sit AFTER getUser(), so loading the sign-in page or
  // posting credentials first made the server validate — and try to refresh —
  // whatever session the browser already had. A browser holding a stale or
  // broken session therefore had to survive a token refresh before it was
  // allowed to sign in again, and when that refresh was slow or failed the
  // request came back 502. The one thing a locked-out administrator does to
  // recover was gated on the thing that was broken (2026-09-16).
  //
  // Signing in must never depend on an existing session.
  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              // Match the main app: keep cookies alive as long as the
              // Supabase refresh token (7 days) so sessions survive.
              maxAge: options?.maxAge || 604800,
              sameSite: options?.sameSite || ("lax" as const),
              secure: process.env.NODE_ENV === "production",
            });
          });
        },
      },
    },
  );

  // Refreshes the session when needed; refreshed cookies flow into `response`.
  // A throw here (Supabase unreachable, a corrupt cookie) must not 502 the
  // panel: treat it as "not signed in" so the visitor lands on the sign-in
  // page, which no longer needs Supabase to render.
  let user: { id: string; email?: string } | null = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (authError) {
    console.error(
      "[admin middleware] session unreadable, treating as signed out:",
      authError instanceof Error ? authError.message : "unknown",
    );
  }

  const deny = (reason: "unauthenticated" | "forbidden") => {
    if (request.nextUrl.pathname.startsWith("/api")) {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: reason === "unauthenticated" ? 401 : 403 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.search = "";
    if (reason === "forbidden") {
      url.searchParams.set("error", "forbidden");
    } else {
      url.searchParams.set(
        "redirectTo",
        request.nextUrl.pathname + request.nextUrl.search,
      );
    }
    return NextResponse.redirect(url);
  };

  if (!user) {
    return deny("unauthenticated");
  }

  // SECOND FACTOR. A password-only session on an MFA-enrolled account is not
  // a signed-in administrator. Read from the session JWT (no fetch); fails
  // open on a throw so a fault of ours cannot lock every admin out. Pages go
  // back to /signin with ?error=mfa_required, where the form shows the TOTP
  // step for the existing session; API calls get a 401 they can act on.
  try {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      if (request.nextUrl.pathname.startsWith("/api")) {
        return NextResponse.json(
          { error: "Two-factor authentication required", code: "mfa_required" },
          { status: 401 },
        );
      }
      const url = request.nextUrl.clone();
      url.pathname = "/signin";
      url.search = "";
      url.searchParams.set("error", "mfa_required");
      url.searchParams.set(
        "redirectTo",
        request.nextUrl.pathname + request.nextUrl.search,
      );
      return NextResponse.redirect(url);
    }
  } catch (aalError) {
    console.error(
      "[admin middleware] assurance level unreadable, allowing:",
      aalError instanceof Error ? aalError.message : "unknown",
    );
  }

  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.length > 0) {
    if (!adminEmails.includes((user.email || "").toLowerCase())) {
      return deny("forbidden");
    }
    return response;
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("roles")
    .eq("id", user.id)
    .single();

  if (!profile?.roles?.includes("admin")) {
    return deny("forbidden");
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
