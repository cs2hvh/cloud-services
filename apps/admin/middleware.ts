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

const PUBLIC_PATHS = ["/signin"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function middleware(request: NextRequest) {
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isPublicPath(request.nextUrl.pathname)) {
    return response;
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
