import { createClient } from "@/lib/supabase/server";
import { getValidGitLabToken } from "@/lib/gitlab/token-refresh";

interface GitLabBranch {
  name: string;
  commit: {
    id: string;
    short_id: string;
    created_at: string;
    parent_ids: string[];
    title: string;
    message: string;
    author_name: string;
    author_email: string;
    authored_date: string;
    committer_name: string;
    committer_email: string;
    committed_date: string;
  };
  merged: boolean;
  protected: boolean;
  developers_can_push: boolean;
  developers_can_merge: boolean;
  can_push: boolean;
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

    // Try to get a valid access token from various sources
    let accessToken = null;
    let tokenSource = 'none';

    // Source 1: Database stored token with automatic refresh (most reliable for GitLab!)
    // IMPORTANT: GitLab tokens expire in 2 hours, so we need to check and refresh them
    console.log('[GitLab Branches] Checking gitlab_tokens table for user:', user.id);
    const storedToken = await getValidGitLabToken(user.id);
    if (storedToken) {
      accessToken = storedToken;
      tokenSource = 'gitlab_tokens_table';
      console.log('[GitLab Branches] Found valid token in gitlab_tokens table (with auto-refresh)');
    }

    // Source 2: Identity data provider_token (usually not populated by Supabase)
    if (!accessToken && gitlabIdentity.identity_data?.provider_token) {
      accessToken = gitlabIdentity.identity_data.provider_token;
      tokenSource = 'identity_data.provider_token';
      console.log('[GitLab Branches] Found token in identity_data.provider_token');
    }

    // Source 3: Session provider_token, but only if this session actually belongs to GitLab
    if (!accessToken && session.provider_token && (session.user as any)?.app_metadata?.provider === 'gitlab') {
      accessToken = session.provider_token;
      tokenSource = 'session.provider_token';
      console.log('[GitLab Branches] Found token in session.provider_token for GitLab');
    }

    if (!accessToken) {
      return Response.json(
        { 
          message: "GitLab access token not found or expired. Please reconnect your GitLab account.",
          needsAppAuth: true
        },
        { status: 400 }
      );
    }

    console.log(`[GitLab Branches] Using token from: ${tokenSource}`);

    // Get repository ID from query parameters
    const url = new URL(request.url);
    const projectId = url.searchParams.get('project_id');
    
    if (!projectId) {
      return Response.json(
        { message: "Project ID is required" },
        { status: 400 }
      );
    }

    // Fetch branches for the repository
    const response = await fetch(`https://gitlab.com/api/v4/projects/${projectId}/repository/branches?per_page=100`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'User-Agent': 'AhuraSense-Cloud-Platform'
      }
    });

    if (!response.ok) {
      // Log the error for debugging
      const errorText = await response.text();
      console.log(`[GitLab Branches] API request failed with status ${response.status}: ${errorText}`);
      console.log(`[GitLab Branches] Token from ${tokenSource} may be invalid or expired`);
      
      // If token from database failed, delete it so user can re-authenticate
      if (tokenSource === 'gitlab_tokens_table') {
        console.log('[GitLab Branches] Deleting invalid stored token');
        await supabase
          .from('gitlab_tokens')
          .delete()
          .eq('user_id', user.id);
      }
      
      if (response.status === 404) {
        return Response.json(
          { message: "Project not found or access denied" },
          { status: 404 }
        );
      } else if (response.status === 403) {
        return Response.json(
          { message: "Insufficient permissions to access project branches" },
          { status: 403 }
        );
      } else if (response.status === 401) {
        return Response.json(
          { 
            message: "GitLab token is invalid or expired. Please reconnect your GitLab account.",
            needsAppAuth: true
          },
          { status: 400 }
        );
      }
      
      throw new Error(`GitLab API error: ${response.status}`);
    }

    const branches: GitLabBranch[] = await response.json();
    console.log(`[GitLab Branches] Successfully fetched ${branches.length} branches for project ${projectId}`);
    
    const transformedBranches = branches.map((branch: GitLabBranch) => ({
      name: branch.name,
      commitSha: branch.commit.id,
      protected: branch.protected
    }));

    return Response.json({ 
      branches: transformedBranches,
      note: `Loaded ${transformedBranches.length} branches`
    }, { status: 200 });

  } catch (error) {
    console.error("[GitLab Branches API] Error:", error);
    return Response.json(
      { message: "Failed to fetch GitLab branches" },
      { status: 500 }
    );
  }
}