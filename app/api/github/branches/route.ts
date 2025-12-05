import { createClient } from "@/lib/supabase/server";
import { getValidGitHubToken } from "@/lib/github/token-refresh";

interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

export async function GET(request: Request) {
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

    // Get the current session to check for provider tokens
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return Response.json(
        { message: "No active session" },
        { status: 401 }
      );
    }

    // Check if user has GitHub provider linked (Supabase identity)
    const githubIdentity = session.user.identities?.find(
      identity => identity.provider === 'github'
    );

    // Try to get a valid access token from various sources
    let accessToken = null;
    
    // Source 1: Session provider_token (only available immediately after OAuth callback)
    if (session.provider_token) {
      accessToken = session.provider_token;
      console.log('[GitHub Branches] Found token in session.provider_token');
    }
    // Source 2: Identity data provider_token
    else if (githubIdentity?.identity_data?.provider_token) {
      accessToken = githubIdentity.identity_data.provider_token;
      console.log('[GitHub Branches] Found token in identity_data.provider_token');
    }
    // Source 3: Database stored token (most reliable for persistent access)
    else {
      console.log('[GitHub Branches] No session token, checking github_tokens table for user:', user.id);
      const storedToken = await getValidGitHubToken(user.id);
      if (storedToken) {
        accessToken = storedToken;
        console.log('[GitHub Branches] Found valid token in github_tokens table');
      } else {
        console.log('[GitHub Branches] No valid token found in github_tokens table');
      }
    }

    if (!accessToken) {
      return Response.json(
        { 
          message: "GitHub account not connected. Please connect your GitHub account.",
          needsAuth: true
        },
        { status: 400 }
      );
    }

    // Get repository name from query parameters
    const url = new URL(request.url);
    const repoFullName = url.searchParams.get('repo');
    
    if (!repoFullName) {
      return Response.json(
        { message: "Repository name is required" },
        { status: 400 }
      );
    }

    // Fetch branches for the repository
    const response = await fetch(`https://api.github.com/repos/${repoFullName}/branches?per_page=100`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'AhuraSense-Cloud-Platform'
      }
    });

    if (response.ok) {
      const branches: GitHubBranch[] = await response.json();
        
        const transformedBranches = branches.map((branch: GitHubBranch) => ({
          name: branch.name,
          commitSha: branch.commit.sha,
          protected: branch.protected
        }));

        return Response.json({ 
          branches: transformedBranches,
          note: `Loaded ${transformedBranches.length} branches`
        }, { status: 200 });
      } else if (response.status === 404) {
        return Response.json(
          { message: "Repository not found or access denied" },
          { status: 404 }
        );
      } else if (response.status === 403) {
        return Response.json(
          { message: "GitHub API rate limit exceeded or insufficient permissions" },
          { status: 403 }
        );
      } else if (response.status === 401) {
        return Response.json(
          { message: "GitHub token is invalid or expired. Please reconnect your GitHub account.", needsAuth: true },
          { status: 400 }
        );
      }

    return Response.json(
      { message: "Failed to fetch branches" },
      { status: 500 }
    );

  } catch (error) {
    console.error("[GitHub Branches API] Error:", error);
    return Response.json(
      { message: "Failed to fetch branches" },
      { status: 500 }
    );
  }
}