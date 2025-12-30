/**
 * Bitbucket Repositories API Endpoint
 * GET /api/bitbucket/repositories
 * 
 * Returns all repositories (public and private) for authenticated user
 * Uses modular Bitbucket provider from lib/providers/bitbucket
 * 
 * KEY FIX: This endpoint now works regardless of which provider the user
 * logged in with. It uses the stored Bitbucket token from bitbucket_tokens table
 * with automatic refresh, NOT the session.provider_token which is only 
 * valid for the login provider.
 */

import { createClient } from "@/lib/supabase/server";
import { BitbucketProvider } from "@/lib/providers/bitbucket";

const bitbucketProvider = new BitbucketProvider();

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

    console.log('[Bitbucket Repos] Fetching repositories for user:', user.id);

    // Use the Bitbucket provider to get token (handles auto-refresh internally)
    // This uses the SERVICE CLIENT, so it works even when logged in with GitHub/GitLab
    const token = await bitbucketProvider.getToken(user.id);

    if (!token) {
      console.log('[Bitbucket Repos] No Bitbucket token found for user:', user.id);
      return Response.json(
        {
          repositories: [],
          message: "Bitbucket account not connected. Please connect your Bitbucket account to access repositories.",
          needsAppAuth: true,
        },
        { status: 200 }
      );
    }

    console.log('[Bitbucket Repos] Found valid Bitbucket token, fetching repositories...');

    // Fetch repositories using the provider
    const result = await bitbucketProvider.getRepositories(token);

    if (result.repositories.length === 0 && result.needsAppAuth) {
      return Response.json(
        {
          repositories: [],
          message: result.message || "Bitbucket token expired or invalid. Please reconnect your Bitbucket account.",
          needsAppAuth: true,
        },
        { status: 200 }
      );
    }

    const privateCount = result.repositories.filter(r => r.private).length;
    console.log(`[Bitbucket Repos] Successfully fetched ${result.repositories.length} repositories (${privateCount} private)`);

    return Response.json({
      repositories: result.repositories,
      note: result.note || `Loaded ${result.repositories.length} repositories (${privateCount} private)`,
    }, { status: 200 });

  } catch (error) {
    console.error("[Bitbucket Repositories API] Error:", error);
    return Response.json(
      { message: "Failed to fetch Bitbucket repositories" },
      { status: 500 }
    );
  }
}
