import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return Response.json(
      { message: "Email and password are required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

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
  });
}
