// app/api/auth/link/route.ts
import { NextResponse } from "next/server";
import { createClient as createSB } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  // 1) Try cookies first (browser flow)
  const ssr = await createClient();
  let {
    data: { user: cookieUser },
  } = await ssr.auth.getUser();

  let sb = ssr; // default client to use for linkIdentity

  // 2) If not logged in via cookies, fall back to Bearer token (Postman)
  if (!cookieUser) {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer "))
      return NextResponse.json({ err: "Unauthorized" }, { status: 401 });

    const accessToken = authHeader.slice("Bearer ".length).trim();

    // IMPORTANT: create a client that *uses* the bearer token
    sb = createSB(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    // Optional: verify user exists with that token
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return NextResponse.json({ err: "bad_jwt" }, { status: 401 });
    cookieUser = u.user;
  }

  const { provider, next = "/settings/accounts" } = await request.json().catch(() => ({}));
  if (!provider) return NextResponse.json({ error: "Missing provider" }, { status: 400 });

  // Already linked?
  const alreadyLinked = (cookieUser.identities ?? []).some((i) => i.provider === provider);
  if (alreadyLinked) {
    return NextResponse.json({ message: `Already connected with ${provider}.` }, { status: 409 });
  }

  // Use your app callback (NOT the Supabase callback) so you can exchange the code
  const origin = new URL(request.url).origin;
  const { data, error } = await sb.auth.linkIdentity({
    provider,
    options: {
      redirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    const msg = /already linked/i.test(error.message)
      ? `This ${provider} account is already connected to a different user. You may be logged in somewhere else.`
      : error.message || "Could not start linking flow.";
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  return NextResponse.json({ url: data?.url }, { status: 200 });
}
