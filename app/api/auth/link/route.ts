// app/api/auth/link/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const { provider, method } = await request.json().catch(() => ({}));
  if (!provider) {
    return NextResponse.json({ error: "Missing provider" }, { status: 400 });
  }

  // Must be logged in
  let {
    data: { user },
  } = await supabase.auth.getUser();

  // Fallback: try bearer token
  if (!user) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      console.log("18");
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

  //  console.log(user.identities,".........user.identities.........31");

  // let identity;
  // if(method==='disconnect'){
  //      identity = user.identities?.find((id) => id.provider === provider);
  //     if (!identity) {
  //       return new Response(
  //         JSON.stringify({ error: "Provider not linked" }),
  //         { status: 400 }
  //       );
  //     }
  // }

  //If already linked to THIS user, short-circuit
  if (method === "connect") {
    const alreadyLinked = (user.identities ?? []).some(
      (i) => i.provider === provider,
    );
    if (alreadyLinked) {
      return NextResponse.json(
        { message: `Already connected with ${provider}.` },
        { status: 409 },
      );
    }
  }

  // Start the link flow. On server, Supabase returns a URL to redirect the user to.
  // After consent, the provider redirects back to Supabase then to your app's /auth/callback,
  // where you call exchangeCodeForSession (you likely have this already).
  const origin = request.headers.get("origin") || "http://localhost:3000";
  console.log(origin, "....................52");

  if (method === "connect") {
    const { data, error } = await supabase.auth.linkIdentity({
      provider,
      options: {
        redirectTo: `${origin}/api/auth/callback`,
        scopes: provider === 'github' ? 'repo user:email' : undefined,
      },
    });
    if (error) {
      // If that provider account is already linked to ANOTHER Supabase user,
      // Supabase returns an error. Surface a friendly message.
      console.log({ ...error }, ".......................58");
      const msg = /already linked/i.test(error.message)
        ? `This ${provider} account is already connected to a different user. You may be logged in somewhere else.`
        : error.message || "Could not start linking flow.";
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json({ url: data?.url }, { status: 200 });
  } else {
    const identity = user.identities?.find((id) => id.provider === provider);
    if (!identity) {
      return new Response(JSON.stringify({ error: "Provider not linked" }), {
        status: 400,
      });
    }
    const response = await supabase.auth.unlinkIdentity(identity);
    if (response.error === null) {
      return NextResponse.json(
        { message: "disconnect success", success: true },
        { status: 200 },
      );
    }
    //console.log(response,"..........response...............96");
  }

  // Success: return the redirect URL so the client can navigate there.
}
