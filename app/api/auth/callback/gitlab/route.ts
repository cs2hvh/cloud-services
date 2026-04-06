// app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server"; // your SSR supabase client

function buildRedirectOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const isLocalEnv = process.env.NODE_ENV === "development";

  if (isLocalEnv) {
    const hostHeader = request.headers.get("host") || requestUrl.host;
    const normalizedHost = hostHeader.replace(/^0\.0\.0\.0(?=[:]|$)/, "localhost");
    return `http://${normalizedHost}`;
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto") || "https";
    return `${proto}://${forwardedHost}`;
  }

  return requestUrl.origin;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const redirectOrigin = buildRedirectOrigin(request);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") ?? "/";
  const next =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${redirectOrigin}${next}`);
    }
  }
  return NextResponse.redirect(`${redirectOrigin}/auth/auth-code-error`);
}
