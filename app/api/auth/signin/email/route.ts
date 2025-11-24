import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { limitByEmail } from "@/lib/cooldown/emailbased";

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return Response.json(
      { message: "Email and password are required" },
      { status: 400 },
    );
  }

  const windowLimit = await limitByEmail(email, { limit: 5, windowMs: 60_000 });
  if (!windowLimit.allowed) {
    return Response.json(
      { error: "Too many requests. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(windowLimit.retryAfterSec) },
      },
    );
  }


  console.log(email, "...........email in signin route.ts........");
  const supabase = await createClient();
console.log(email, "...........email in signin route.ts........");
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  console.log(data, "...........data in signin route.ts........");

  //console.log(data?.user,"data?.user");
  const twofastatus =
    data?.user?.factors?.find((item) => item.factor_type === "totp")?.status ===
    "verified";

  if (error) {
    return Response.json({ message: error.message }, { status: 401 });
  }

  if (!data.user) {
    return Response.json({ message: "Authentication failed" }, { status: 401 });
  }

  // Get user profile
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("username")
    .eq("id", data.user.id)
    .single();

  return Response.json({
    message: "Signed in successfully.",
    name: profile?.username || data.user.email,
    twofastatus: twofastatus,
  });
}
