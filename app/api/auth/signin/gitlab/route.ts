import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const origin = request.headers.get("origin") || "http://localhost:3000";

    const body = await request.json().catch(() => ({})) as { next?: string };
    const safeNext = typeof body.next === "string" && body.next.startsWith("/") && !body.next.startsWith("//") ? body.next : "/dashboard";

    // GitLab OAuth scopes for repository access:
    console.log("Initiating GitLab OAuth signin with scopes: api read_user");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "gitlab",
      options: {
        redirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(safeNext)}`,
        scopes: "read_user read_repository write_repository api read_api",
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
    console.error("[Route] GitLab signin error:", error);
    return Response.json(
      { message: "Something went wrong :(" },
      { status: 500 },
    );
  }
}
