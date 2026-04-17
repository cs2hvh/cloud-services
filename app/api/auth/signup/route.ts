import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeAuthError, logError } from "@/lib/api/error-sanitizer";

export async function POST(request: NextRequest) {
  const { email, password, username, display_name } = await request.json();

  if (!email || !password) {
    return Response.json(
      { message: "Email and password are required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        display_name: display_name || username,
      },
    },
  });

  if (error) {
    logError("POST /api/auth/signup", error);
    return Response.json({ message: sanitizeAuthError(error) }, { status: 400 });
  }

  if (!data.user) {
    return Response.json(
      { message: "Failed to create account" },
      { status: 400 },
    );
  }

  return Response.json({
    message:
      "Account created successfully. Please check your email to verify your account.",
    user: {
      id: data.user.id,
      email: data.user.email,
    },
  });
}
