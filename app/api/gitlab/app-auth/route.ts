import { createClient } from "@/lib/supabase/server";

/**
 * GitLab App OAuth flow for repository access
 * This provides a direct OAuth flow when the session token is not available
 * 
 * GitLab OAuth Notes:
 * - Tokens expire after 2 hours (7200 seconds)
 * - Refresh tokens must be stored and used to get new access tokens
 * - Required scopes: api (full access) or read_api (read-only)
 */
export async function POST() {
  try {
    const supabase = await createClient();
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return Response.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    // GitLab App OAuth flow for repository access
    const clientId = process.env.GITLAB_CLIENT_ID;
    const redirectUri = `${process.env.DOMAIN}/api/gitlab/callback`;
    
    if (!clientId) {
      return Response.json(
        { message: "GitLab OAuth not configured" },
        { status: 500 }
      );
    }
    
    // Scopes needed for private repository access
    // - api: Complete read/write access to the API
    // - read_user: Read user profile
    const scopes = 'api read_user';
    
    // Generate state parameter for CSRF protection
    const state = `${user.id}-${Date.now()}`;
    
    // Build GitLab authorization URL
    const gitlabAuthUrl = `https://gitlab.com/oauth/authorize?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `state=${state}`;

    return Response.json({ 
      url: gitlabAuthUrl,
      state: state 
    }, { status: 200 });

  } catch (error) {
    console.error("[GitLab App Auth] Error:", error);
    return Response.json(
      { message: "Failed to generate GitLab authorization URL" },
      { status: 500 }
    );
  }
}
