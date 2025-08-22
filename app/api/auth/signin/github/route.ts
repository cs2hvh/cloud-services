import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { type } = await request.json();
    const origin = request.headers.get("origin") || "http://localhost:3000";
    console.log(origin, "..................9");

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: type,
      options: {
        redirectTo: `${origin}/api/auth/callback`,
      },
    });

    console.log(data, "..............data............17");

    if (error) {
      return Response.json({ message: error.message }, { status: 400 });
    }

    if (!data.url) {
      return Response.json(
        { message: "Failed to generate OAuth URL" },
        { status: 500 }
      );
    }

    console.log(data.url, "......................36");

    return Response.json({ url: data.url }, { status: 200 });
  } catch (error) {
    console.error("[Route] GitHub signin error:", error);
    return Response.json(
      { message: "Something went wrong :(" },
      { status: 500 }
    );
  }
}
