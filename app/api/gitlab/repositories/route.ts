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

    console.log('[GitLab Repos] GitLab identity:', gitlabIdentity);

    if (!gitlabIdentity) {
      return Response.json(
        { message: "GitLab account not connected" },
        { status: 400 }
      );
    }

    // Get GitLab identifiers for fallback to public repos
    // Prefer stable identifiers (numeric id or real username) over display name
    const gitlabUserId = (gitlabIdentity.identity_data as any)?.id;
    const gitlabUsername = (gitlabIdentity.identity_data as any)?.username
      || (gitlabIdentity.identity_data as any)?.preferred_username
      || undefined; // avoid using full name with spaces as API username

    // Try to get a valid access token from various sources
    let accessToken = null;
    let tokenSource = 'none';

    // Source 1: Database stored token with automatic refresh (most reliable for GitLab!)
    // IMPORTANT: GitLab tokens expire in 2 hours, so we need to check and refresh them
    console.log('[GitLab Repos] Checking gitlab_tokens table for user:', user.id);
    const storedToken = await getValidGitLabToken(user.id);
    if (storedToken) {
      accessToken = storedToken;
      tokenSource = 'gitlab_tokens_table';
      console.log('[GitLab Repos] Found valid token in gitlab_tokens table (with auto-refresh)');
    }

    // Source 2: Identity data provider_token (usually not populated by Supabase)
    if (!accessToken && gitlabIdentity.identity_data?.provider_token) {
      accessToken = gitlabIdentity.identity_data.provider_token;
      tokenSource = 'identity_data.provider_token';
      console.log('[GitLab Repos] Found token in identity_data.provider_token');
    }

    // Source 3: Session provider_token, but only if this session actually belongs to GitLab
    // This avoids using a GitHub token when calling GitLab APIs
    if (!accessToken && session.provider_token && (session.user as any)?.app_metadata?.provider === 'gitlab') {
      accessToken = session.provider_token;
      tokenSource = 'session.provider_token';
      console.log('[GitLab Repos] Found token in session.provider_token for GitLab');
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

    // Fallback: Fetch only public repositories
    // Try by numeric user id first (most reliable), then by username
    try {
      if (gitlabUserId) {
        console.log(`[GitLab Repos] Falling back to public repos for GitLab user id: ${gitlabUserId}`);
        const response = await fetch(`https://gitlab.com/api/v4/users/${gitlabUserId}/projects?visibility=public&per_page=100&order_by=updated_at`, {
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
      } else if (gitlabUsername) {
        console.log(`[GitLab Repos] Falling back to public repos for GitLab username: ${gitlabUsername}`);
        const response = await fetch(`https://gitlab.com/api/v4/users/${encodeURIComponent(gitlabUsername)}/projects?visibility=public&per_page=100&order_by=updated_at`, {
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
    } catch (fallbackError) {
      console.log('[GitLab Repos] Public fallback failed:', fallbackError);
    }

    // No usable token and no successful public fallback - return empty list with guidance
    return Response.json(
      { 
        repositories: [],
        message: "GitLab account is linked but no valid API token is available. Please complete the GitLab App connection to enable repository access.",
        needsAppAuth: true
      },
      { status: 200 }
    );

  } catch (error) {
    console.error("[GitLab Repositories API] Error:", error);
    return Response.json(
      { message: "Failed to fetch GitLab repositories" },
      { status: 500 }
    );
  }
}
