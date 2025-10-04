import { createClient } from "@/lib/supabase/server";

// Prefix unused parameter with underscore to satisfy the linter without changing logic
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

    // GitHub App OAuth flow for repository access
    const clientId = process.env.GITHUB_CLIENT_ID;
    const redirectUri = `${process.env.DOMAIN}/api/github/callback`;
    
    // Scopes needed for private repository access
    const scopes = 'repo user:email';
    
    // Generate state parameter for security
    const state = `${user.id}-${Date.now()}`;
    
    // Store state in database for verification (you might want to use Redis for this)
    // For now, we'll use a simple approach
    
    const githubAuthUrl = `https://github.com/login/oauth/authorize?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `state=${state}&` +
      `allow_signup=false`;

    return Response.json({ 
      url: githubAuthUrl,
      state: state 
    }, { status: 200 });

  } catch (error) {
    console.error("[GitHub App Auth] Error:", error);
    return Response.json(
      { message: "Failed to generate GitHub authorization URL" },
      { status: 500 }
    );
  }
}
