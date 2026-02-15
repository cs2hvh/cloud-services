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
    
    // Get the current user - works regardless of login provider
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return Response.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get GitLab token from database (with auto-refresh)
    // This works whether user logged in with GitLab or connected separately via /api/gitlab/app-auth
    console.log('[GitLab Branches] Checking for GitLab token for user:', user.id);
    const accessToken = await getValidGitLabToken(user.id);
    
    if (!accessToken) {
      console.log('[GitLab Branches] No GitLab token found for user:', user.id);
      return Response.json(
        { 
          message: "GitLab account not connected. Please connect your GitLab account.",
          needsAppAuth: true
        },
        { status: 400 }
      );
    }

    console.log('[GitLab Branches] Found valid GitLab token');

    // Get repository ID from query parameters
    const url = new URL(request.url);
    const projectId = url.searchParams.get('project_id');
    
    if (!projectId) {
      return Response.json(
        { message: "Project ID is required" },
        { status: 400 }
      );
    }

    console.log('[GitLab Branches] Fetching branches for project:', projectId);

    // Fetch branches for the repository
    // Note: projectId must be URL-encoded for the API path (e.g., "namespace/project" -> "namespace%2Fproject")
    const encodedProjectId = encodeURIComponent(projectId);
    const apiUrl = `https://gitlab.com/api/v4/projects/${encodedProjectId}/repository/branches?per_page=100`;
    console.log('[GitLab Branches] API URL:', apiUrl);
    
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'User-Agent': 'AhuraSense-Cloud-Platform'
      }
    });

    console.log('[GitLab Branches] API Response Status:', response.status);
    console.log('[GitLab Branches] API Response Headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      // Log the error for debugging
      const errorText = await response.text();
      console.log(`[GitLab Branches] API request failed with status ${response.status}: ${errorText}`);
      
      // If token is invalid/expired, delete it so user can re-authenticate
      if (response.status === 401) {
        console.log('[GitLab Branches] Token is invalid or expired, deleting stored token');
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
    console.log('[GitLab Branches] Branch names:', branches.map(b => b.name).join(', '));
    
    const transformedBranches = branches.map((branch: GitLabBranch) => ({
      name: branch.name,
      commitSha: branch.commit.id,
      protected: branch.protected
    }));

    console.log('[GitLab Branches] Transformed branches:', transformedBranches.length);
    
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