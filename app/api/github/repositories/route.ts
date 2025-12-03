import { createClient } from "@/lib/supabase/server";
import { getValidGitHubToken } from "@/lib/github/token-refresh";

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  language: string | null;
  updated_at: string;
  clone_url: string;
  html_url: string;
}

export async function GET() {
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

    // Check if user has GitHub provider linked
    const githubIdentity = session.user.identities?.find(
      identity => identity.provider === 'github'
    );

    if (!githubIdentity) {
      return Response.json(
        { message: "GitHub account not connected" },
        { status: 400 }
      );
    }

    // Get GitHub username for fallback to public repos
    const githubUsername = githubIdentity.identity_data?.user_name || 
                          githubIdentity.identity_data?.login || 
                          githubIdentity.identity_data?.preferred_username;

    // Try to get a valid access token from various sources
    let accessToken = null;
    let tokenSource = 'none';
    
    // Source 1: Session provider_token (only available immediately after OAuth callback)
    if (session.provider_token) {
      accessToken = session.provider_token;
      tokenSource = 'session.provider_token';
      console.log('[GitHub Repos] Found token in session.provider_token');
    }
    // Source 2: Identity data provider_token (usually not populated by Supabase)
    else if (githubIdentity.identity_data?.provider_token) {
      accessToken = githubIdentity.identity_data.provider_token;
      tokenSource = 'identity_data.provider_token';
      console.log('[GitHub Repos] Found token in identity_data.provider_token');
    }
    // Source 3: Database stored token (most reliable for persistent access)
    else {
      console.log('[GitHub Repos] No session token, checking github_tokens table for user:', user.id);
      const storedToken = await getValidGitHubToken(user.id);
      if (storedToken) {
        accessToken = storedToken;
        tokenSource = 'github_tokens_table';
        console.log('[GitHub Repos] Found valid token in github_tokens table');
      } else {
        console.log('[GitHub Repos] No valid token found in github_tokens table');
      }
    }

    // If we have a token, try to fetch all repositories including private ones
    if (accessToken) {
      console.log(`[GitHub Repos] Using token from: ${tokenSource}`);
      
      const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100&visibility=all', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AhuraSense-Cloud-Platform'
        }
      });

      if (response.ok) {
        const repos: GitHubRepository[] = await response.json();
        const privateCount = repos.filter((repo: GitHubRepository) => repo.private).length;
        console.log(`[GitHub Repos] Successfully fetched ${repos.length} repositories (${privateCount} private)`);
        
        const transformedRepos = repos.map((repo: GitHubRepository) => ({
          id: repo.id.toString(),
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description || '',
          private: repo.private,
          defaultBranch: repo.default_branch,
          language: repo.language || 'Unknown',
          updatedAt: repo.updated_at,
          provider: 'github',
          cloneUrl: repo.clone_url,
          htmlUrl: repo.html_url
        }));

        return Response.json({ 
          repositories: transformedRepos,
          note: `Loaded ${transformedRepos.length} repositories including ${privateCount} private repositories`
        }, { status: 200 });
      } else {
        // Token failed - log the error for debugging
        const errorText = await response.text();
        console.log(`[GitHub Repos] API request failed with status ${response.status}: ${errorText}`);
        console.log(`[GitHub Repos] Token from ${tokenSource} may be invalid or revoked`);
        // Fall through to public repos fallback
      }
    }

    // Fallback: Fetch only public repositories using username
    if (githubUsername) {
      console.log(`[GitHub Repos] Falling back to public repos for user: ${githubUsername}`);
      
      const response = await fetch(`https://api.github.com/users/${githubUsername}/repos?sort=updated&per_page=100`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AhuraSense-Cloud-Platform'
        }
      });

      if (response.ok) {
        const repos = await response.json();
        const transformedRepos = repos.map((repo: GitHubRepository) => ({
          id: repo.id.toString(),
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description || '',
          private: repo.private,
          defaultBranch: repo.default_branch,
          language: repo.language || 'Unknown',
          updatedAt: repo.updated_at,
          provider: 'github',
          cloneUrl: repo.clone_url,
          htmlUrl: repo.html_url
        }));

        return Response.json({ 
          repositories: transformedRepos,
          warning: "Showing public repositories only. Private repository access token not found or expired. Please reconnect your GitHub account in Settings.",
        }, { status: 200 });
      }
    }

    return Response.json(
      { 
        message: "Unable to fetch GitHub repositories. Please reconnect your GitHub account in Settings.",
        debug: {
          hasProviderToken: !!session.provider_token,
          hasGithubIdentity: !!githubIdentity,
          githubUsername: githubUsername || 'Not found',
          tokenSource
        }
      },
      { status: 400 }
    );

  } catch (error) {
    console.error("[GitHub Repositories API] Error:", error);
    return Response.json(
      { message: "Failed to fetch repositories" },
      { status: 500 }
    );
  }
}
