import { createClient } from "@/lib/supabase/server";

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

    // Try to use provider token if available
    let accessToken = null;
    
    // Check for token in session first
    if (session.provider_token) {
      accessToken = session.provider_token;
    }
    // Fallback to identity data
    else if (githubIdentity.identity_data?.provider_token) {
      accessToken = githubIdentity.identity_data.provider_token;
    }

    if (!accessToken) {
      return Response.json(
        { 
          message: "GitHub access token not found. Please reconnect your GitHub account." 
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

    // Test the token first
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'AhuraSense-Cloud-Platform'
      }
    });

    if (userResponse.ok) {
      // Token works, fetch branches for the repository
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
      }
    } else {
      return Response.json(
        { message: "GitHub token is invalid or expired. Please reconnect your GitHub account." },
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