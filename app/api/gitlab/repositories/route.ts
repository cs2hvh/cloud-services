import { createClient } from "@/lib/supabase/server";
import { getValidGitLabToken } from "@/lib/gitlab/token-refresh";

interface GitLabRepository {
  id: number;
  name: string;
  path_with_namespace: string;
  description: string | null;
  visibility: 'private' | 'public' | 'internal';
  default_branch: string;
  language: string | null;
  last_activity_at: string;
  http_url_to_repo: string;
  web_url: string;
}

interface TransformedRepository {
  id: string;
  name: string;
  fullName: string;
  description: string;
  private: boolean;
  defaultBranch: string;
  language: string;
  updatedAt: string;
  provider: 'gitlab';
  cloneUrl: string;
  htmlUrl: string;
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

    // Check if user has GitLab provider linked
    const gitlabIdentity = session.user.identities?.find(
      identity => identity.provider === 'gitlab'
    );

    if (!gitlabIdentity) {
      return Response.json(
        { message: "GitLab account not connected" },
        { status: 400 }
      );
    }

    // Get GitLab username for fallback to public repos
    const gitlabUsername = gitlabIdentity.identity_data?.username || 
                          gitlabIdentity.identity_data?.preferred_username ||
                          gitlabIdentity.identity_data?.name;

    // Try to get a valid access token from various sources
    let accessToken = null;
    let tokenSource = 'none';
    
    // Source 1: Session provider_token (only available immediately after OAuth callback)
    if (session.provider_token) {
      accessToken = session.provider_token;
      tokenSource = 'session.provider_token';
      console.log('[GitLab Repos] Found token in session.provider_token');
    }
    // Source 2: Identity data provider_token (usually not populated by Supabase)
    else if (gitlabIdentity.identity_data?.provider_token) {
      accessToken = gitlabIdentity.identity_data.provider_token;
      tokenSource = 'identity_data.provider_token';
      console.log('[GitLab Repos] Found token in identity_data.provider_token');
    }
    // Source 3: Database stored token with automatic refresh (most reliable for GitLab!)
    // IMPORTANT: GitLab tokens expire in 2 hours, so we need to check and refresh them
    else {
      console.log('[GitLab Repos] No session token, checking gitlab_tokens table for user:', user.id);
      const storedToken = await getValidGitLabToken(user.id);
      if (storedToken) {
        accessToken = storedToken;
        tokenSource = 'gitlab_tokens_table';
        console.log('[GitLab Repos] Found valid token in gitlab_tokens table (with auto-refresh)');
      } else {
        console.log('[GitLab Repos] No valid token found in gitlab_tokens table');
      }
    }

    // If we have a token, try to fetch all repositories including private ones
    if (accessToken) {
      console.log(`[GitLab Repos] Using token from: ${tokenSource}`);
      
      const response = await fetch('https://gitlab.com/api/v4/projects?membership=true&per_page=100&order_by=updated_at', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'User-Agent': 'AhuraSense-Cloud-Platform'
        }
      });

      if (response.ok) {
        const repos: GitLabRepository[] = await response.json();
        const privateCount = repos.filter((repo: GitLabRepository) => repo.visibility === 'private').length;
        console.log(`[GitLab Repos] Successfully fetched ${repos.length} repositories (${privateCount} private)`);
        
        const transformedRepos = repos.map((repo: GitLabRepository) => ({
          id: repo.id.toString(),
          name: repo.name,
          fullName: repo.path_with_namespace,
          description: repo.description || '',
          private: repo.visibility === 'private',
          defaultBranch: repo.default_branch,
          language: repo.language || 'Unknown',
          updatedAt: repo.last_activity_at,
          provider: 'gitlab' as const,
          cloneUrl: repo.http_url_to_repo,
          htmlUrl: repo.web_url
        }));

        return Response.json({ 
          repositories: transformedRepos,
          note: `Loaded ${transformedRepos.length} repositories including ${privateCount} private repositories`
        }, { status: 200 });
      } else {
        // Token failed - log the error for debugging
        const errorText = await response.text();
        console.log(`[GitLab Repos] API request failed with status ${response.status}: ${errorText}`);
        console.log(`[GitLab Repos] Token from ${tokenSource} may be invalid or expired`);
        
        // If token from database failed, delete it so user can re-authenticate
        if (tokenSource === 'gitlab_tokens_table') {
          console.log('[GitLab Repos] Deleting invalid stored token');
          await supabase
            .from('gitlab_tokens')
            .delete()
            .eq('user_id', user.id);
        }
        // Fall through to public repos fallback
      }
    }

    // Fallback: Fetch only public repositories using username
    if (gitlabUsername) {
      console.log(`[GitLab Repos] Falling back to public repos for user: ${gitlabUsername}`);
      
      const response = await fetch(`https://gitlab.com/api/v4/users/${gitlabUsername}/projects?visibility=public&per_page=100&order_by=updated_at`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AhuraSense-Cloud-Platform'
        }
      });

      if (response.ok) {
        const repos = await response.json();
        const transformedRepos = repos.map((repo: GitLabRepository) => ({
          id: repo.id.toString(),
          name: repo.name,
          fullName: repo.path_with_namespace,
          description: repo.description || '',
          private: repo.visibility === 'private',
          defaultBranch: repo.default_branch,
          language: repo.language || 'Unknown',
          updatedAt: repo.last_activity_at,
          provider: 'gitlab' as const,
          cloneUrl: repo.http_url_to_repo,
          htmlUrl: repo.web_url
        }));

        return Response.json({ 
          repositories: transformedRepos,
          warning: "Showing public repositories only. GitLab token expired or not found. Please reconnect your GitLab account for private repository access.",
          needsAppAuth: true
        }, { status: 200 });
      }
    }

    // No token and no username - can't fetch anything
    return Response.json(
      { 
        message: "GitLab access token not found or expired. Please reconnect your GitLab account.",
        needsAppAuth: true
      },
      { status: 400 }
    );

  } catch (error) {
    console.error("[GitLab Repositories API] Error:", error);
    return Response.json(
      { message: "Failed to fetch GitLab repositories" },
      { status: 500 }
    );
  }
}
