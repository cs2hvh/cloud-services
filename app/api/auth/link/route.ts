// app/api/auth/link/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  // Must be logged in
let { data: { user } } = await supabase.auth.getUser();

  // Fallback: try bearer token
  if (!user ) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
        console.log("18")
      const token = authHeader.replace("Bearer ", "");
     // console.log(token,"20")
      const {
        data: { user: tokenUser },
      } = await supabase.auth.getUser(token);
      user = tokenUser ?? null;
    }
  }

  if (!user) {
    return NextResponse.json({ err: "Unauthorized" }, { status: 401 });
  }

  // body: { provider: 'github' | 'google' | 'gitlab' | 'bitbucket' | ... }
  const { provider, next = "/settings/accounts" } = await request.json().catch(() => ({}));
  if (!provider) {
    return NextResponse.json({ error: "Missing provider" }, { status: 400 });
  }

  // If already linked to THIS user, short-circuit
  const alreadyLinked = (user.identities ?? []).some((i) => i.provider === provider);
  if (alreadyLinked) {
    return NextResponse.json(
      { message: `Already connected with ${provider}.` },
      { status: 409 }
    );
  }

  // Start the link flow. On server, Supabase returns a URL to redirect the user to.
  // After consent, the provider redirects back to Supabase then to your app's /auth/callback,
  // where you call exchangeCodeForSession (you likely have this already).
  const origin = new URL(request.url).origin;
  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    // If that provider account is already linked to ANOTHER Supabase user,
    // Supabase returns an error. Surface a friendly message.
    const msg = /already linked/i.test(error.message)
      ? `This ${provider} account is already connected to a different user. You may be logged in somewhere else.`
      : error.message || "Could not start linking flow.";
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  // Success: return the redirect URL so the client can navigate there.
  return NextResponse.json({ url: data?.url }, { status: 200 });
}
