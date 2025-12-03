import { createClient } from "@/lib/supabase/server";

interface BitbucketBranch {
  name: string;
  target: {
    hash: string;
    repository: {
      links: {
        self: {
          href: string;
        };
      };
    };
    links: {
      self: {
        href: string;
      };
    };
  };
  heads: any[];
  links: {
    commits: {
      href: string;
    };
    self: {
      href: string;
    };
  };
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

    // Check if user has Bitbucket provider linked
    const bitbucketIdentity = session.user.identities?.find(
      identity => identity.provider === 'bitbucket'
    );

    if (!bitbucketIdentity) {
      return Response.json(
        { message: "Bitbucket account not connected" },
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
    else if (bitbucketIdentity.identity_data?.provider_token) {
      accessToken = bitbucketIdentity.identity_data.provider_token;
    }

    if (!accessToken) {
      return Response.json(
        { 
          message: "Bitbucket access token not found. Please reconnect your Bitbucket account." 
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
    const response = await fetch(`https://api.bitbucket.org/2.0/repositories/${repoFullName}/refs/branches?pagelen=100`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'User-Agent': 'AhuraSense-Cloud-Platform'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return Response.json(
          { message: "Repository not found or access denied" },
          { status: 404 }
        );
      } else if (response.status === 403) {
        return Response.json(
          { message: "Insufficient permissions to access repository branches" },
          { status: 403 }
        );
      } else if (response.status === 401) {
        return Response.json(
          { message: "Bitbucket token is invalid or expired. Please reconnect your Bitbucket account." },
          { status: 400 }
        );
      }
      
      throw new Error(`Bitbucket API error: ${response.status}`);
    }

    const data = await response.json();
    const branches = data.values || [];
    
    const transformedBranches = branches.map((branch: BitbucketBranch) => ({
      name: branch.name,
      commitSha: branch.target.hash,
      protected: false // Bitbucket API doesn't directly provide this info in this endpoint
    }));

    return Response.json({ 
      branches: transformedBranches,
      note: `Loaded ${transformedBranches.length} branches`
    }, { status: 200 });

  } catch (error) {
    console.error("[Bitbucket Branches API] Error:", error);
    return Response.json(
      { message: "Failed to fetch Bitbucket branches" },
      { status: 500 }
    );
  }
}