import { createClient } from "@/lib/supabase/server";

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
    
    // Get the current session which includes provider tokens
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      return Response.json(
        { message: "No active session" },
        { status: 401 }
      );
    }

    // console.log('=== DEBUGGING GITLAB TOKEN ACCESS ===');
    // console.log('Session user ID:', session.user.id);

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

    // console.log('GitLab Identity Data:', JSON.stringify(gitlabIdentity.identity_data, null, 2));

    // Try to get access token from multiple locations
    let accessToken = null;
    
    // Method 1: Session provider token
    if (session.provider_token) {
      accessToken = session.provider_token;
      // console.log('Found token in session.provider_token');
    }
    
    // Method 2: Identity data provider token
    else if (gitlabIdentity.identity_data?.provider_token) {
      accessToken = gitlabIdentity.identity_data.provider_token;
      //console.log('Found token in identity_data.provider_token');
    }
    
    // Method 3: Identity data access token
    else if (gitlabIdentity.identity_data?.access_token) {
      accessToken = gitlabIdentity.identity_data.access_token;
      //console.log('Found token in identity_data.access_token');
    }

    if (!accessToken) {
      //console.error('No GitLab access token found');
      
      // Fallback to public repositories using username
      const gitlabUsername = gitlabIdentity.identity_data?.username || 
                            gitlabIdentity.identity_data?.preferred_username ||
                            gitlabIdentity.identity_data?.name;

      if (gitlabUsername) {
        //console.log('Falling back to public repos for GitLab user:', gitlabUsername);
        
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
            warning: "Showing public repositories only. Private repository access requires proper GitLab OAuth configuration."
          }, { status: 200 });
        }
      }

      return Response.json(
        { 
          message: "GitLab access token not found. Please check GitLab OAuth configuration.",
          debug: "Token not found in session or identity_data"
        },
        { status: 400 }
      );
    }

    // console.log('Using GitLab token for private repo access');

    // Fetch all repositories (public and private) using access token
    const response = await fetch('https://gitlab.com/api/v4/projects?membership=true&per_page=100&order_by=updated_at', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'User-Agent': 'AhuraSense-Cloud-Platform'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      //console.error('GitLab API Error:', response.status, errorText);
      
      if (response.status === 401) {
        return Response.json(
          { message: "GitLab token is invalid or expired. Please reconnect your GitLab account." },
          { status: 400 }
        );
      }
      
      throw new Error(`GitLab API error: ${response.status} - ${errorText}`);
    }

    const repos = await response.json();
   // console.log(`Fetched ${repos.length} repositories (public + private) from GitLab`);
    
    // Transform GitLab API response to our format
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
      note: `Successfully loaded ${transformedRepos.length} repositories including ${transformedRepos.filter((r: TransformedRepository) => r.private).length} private repositories`
    }, { status: 200 });

  } catch (error) {
    console.error("[GitLab Repositories API] Error:", error);
    return Response.json(
      { message: "Failed to fetch GitLab repositories" },
      { status: 500 }
    );
  }
}
