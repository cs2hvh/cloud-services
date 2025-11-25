import { createClient } from "@/lib/supabase/server";

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
    
    // Get the current session which includes provider tokens
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
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

    // Try to use access token if available
    let accessToken = null;
    
    // Check for token in session first
    if (session.provider_token) {
      accessToken = session.provider_token;
    }
    // Fallback to identity data
    else if (gitlabIdentity.identity_data?.provider_token) {
      accessToken = gitlabIdentity.identity_data.provider_token;
    }

    if (!accessToken) {
      return Response.json(
        { 
          message: "GitLab access token not found. Please reconnect your GitLab account." 
        },
        { status: 400 }
      );
    }

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
          { message: "GitLab token is invalid or expired. Please reconnect your GitLab account." },
          { status: 400 }
        );
      }
      
      throw new Error(`GitLab API error: ${response.status}`);
    }

    const branches: GitLabBranch[] = await response.json();
    
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