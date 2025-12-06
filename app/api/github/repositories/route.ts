/**
 * GitHub Repositories API Endpoint
 * GET /api/github/repositories
 * 
 * Returns all repositories (public and private) for authenticated user
 * Uses modular GitHub provider from lib/providers/github
 */

import { createClient } from "@/lib/supabase/server";
import { fetchUserRepositories } from "@/lib/providers/github/utils";

export async function GET() {
  try {
    const supabase = await createClient();

    // Check if user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return Response.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    // Use modular GitHub provider
    const result = await fetchUserRepositories();

    // If no repositories found and needs auth, return 400
    if (result.repositories.length === 0 && result.needsAppAuth) {
      return Response.json(result, { status: 400 });
    }

    // Return repositories (may be empty if error)
    return Response.json(result, { status: 200 });

  } catch (error) {
    console.error("[GitHub Repositories API] Error:", error);
    return Response.json(
      { message: "Failed to fetch repositories" },
      { status: 500 }
    );
  }
}
