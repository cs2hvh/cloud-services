/**
 * GitLab Repositories API Endpoint
 * GET /api/gitlab/repositories
 * 
 * Returns all repositories (public and private) for authenticated user
 * Uses modular GitLab provider from lib/providers/gitlab
 * 
 * KEY FIX: This endpoint now works regardless of which provider the user
 * logged in with. It uses the stored GitLab token from gitlab_tokens table
 * with automatic refresh, NOT the session.provider_token which is only 
 * valid for the login provider.
 */

import { createClient } from "@/lib/supabase/server";
import { GitLabProvider } from "@/lib/providers/gitlab";

const gitlabProvider = new GitLabProvider();

export async function GET() {
  try {
    const supabase = await createClient();

    // Get the current user - this works regardless of which provider they logged in with
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return Response.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    console.log('[GitLab Repos] Fetching repositories for user:', user.id);

    // Use the GitLab provider to get token (handles auto-refresh internally)
    // This uses the SERVICE CLIENT, so it works even when logged in with GitHub/Bitbucket
    const token = await gitlabProvider.getToken(user.id);

    if (!token) {
      console.log('[GitLab Repos] No GitLab token found for user:', user.id);
      return Response.json(
        {
          repositories: [],
          message: "GitLab account not connected. Please connect your GitLab account to access repositories.",
          needsAppAuth: true,
        },
        { status: 200 }
      );
    }

    console.log('[GitLab Repos] Found valid GitLab token, fetching repositories...');

    // Fetch repositories using the provider
    const result = await gitlabProvider.getRepositories(token);

    if (result.repositories.length === 0 && result.needsAppAuth) {
      return Response.json(
        {
          repositories: [],
          message: result.message || "GitLab token expired or invalid. Please reconnect your GitLab account.",
          needsAppAuth: true,
        },
        { status: 200 }
      );
    }

    const privateCount = result.repositories.filter(r => r.private).length;
    console.log(`[GitLab Repos] Successfully fetched ${result.repositories.length} repositories (${privateCount} private)`);

    return Response.json({
      repositories: result.repositories,
      note: result.note || `Loaded ${result.repositories.length} repositories (${privateCount} private)`,
    }, { status: 200 });

  } catch (error) {
    console.error("[GitLab Repositories API] Error:", error);
    return Response.json(
      { message: "Failed to fetch GitLab repositories" },
      { status: 500 }
    );
  }
}
