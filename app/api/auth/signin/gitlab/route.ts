import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const origin = request.headers.get("origin") || "http://localhost:3000";

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "gitlab",
      options: {
        redirectTo: `${origin}/api/auth/callback`,
        scopes: "read_repository read_user",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      return Response.json({ message: error.message }, { status: 400 });
    }

    if (!data.url) {
      return Response.json(
        { message: "Failed to generate OAuth URL" },
        { status: 500 },
      );
    }

    return Response.json({ url: data.url }, { status: 200 });
  } catch (error) {
    console.error("[Route] GitHub signin error:", error);
    return Response.json(
      { message: "Something went wrong :(" },
      { status: 500 },
    );
  }
}
