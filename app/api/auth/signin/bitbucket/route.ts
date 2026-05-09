import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeAuthError, logError } from "@/lib/api/error-sanitizer";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const origin = request.headers.get("origin") || "http://localhost:3000";

    const body = await request.json().catch(() => ({})) as { next?: string };
    const safeNext = typeof body.next === "string" && body.next.startsWith("/") && !body.next.startsWith("//") ? body.next : "/dashboard";

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "bitbucket",
      options: {
        redirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(safeNext)}`,
        scopes: "repository account",
      },
    });

    if (error) {
      logError("auth/signin/bitbucket", error);
      return Response.json({ message: sanitizeAuthError(error) }, { status: 400 });
    }

    if (!data.url) {
      return Response.json(
        { message: "Failed to generate OAuth URL" },
        { status: 500 },
      );
    }

    return Response.json({ url: data.url }, { status: 200 });
  } catch (error) {
    console.error("[Route] Bitbucket signin error:", error);
    return Response.json(
      { message: "Something went wrong :(" },
      { status: 500 },
    );
  }
}
