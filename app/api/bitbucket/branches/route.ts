import { createClient } from "@/lib/supabase/server";
import { getValidBitbucketToken } from "@/lib/bitbucket/token-refresh";

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
  heads: unknown[];
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

    // Try to get a valid access token from various sources
    let accessToken = null;
    let tokenSource = 'none';

    // Source 1: Database stored token with automatic refresh (most reliable for Bitbucket!)
    // IMPORTANT: Bitbucket tokens expire in ~1 hour, so we need to check and refresh them
    console.log('[Bitbucket Branches] Checking bitbucket_tokens table for user:', user.id);
    const storedToken = await getValidBitbucketToken(user.id);
    if (storedToken) {
      accessToken = storedToken;
      tokenSource = 'bitbucket_tokens_table';
      console.log('[Bitbucket Branches] Found valid token in bitbucket_tokens table (with auto-refresh)');
    }

    // Source 2: Identity data provider_token (usually not populated by Supabase)
    if (!accessToken && bitbucketIdentity.identity_data?.provider_token) {
      accessToken = bitbucketIdentity.identity_data.provider_token;
      tokenSource = 'identity_data.provider_token';
      console.log('[Bitbucket Branches] Found token in identity_data.provider_token');
    }

    // Source 3: Session provider_token, but only if this session actually belongs to Bitbucket
    if (!accessToken && session.provider_token && (session.user as any)?.app_metadata?.provider === 'bitbucket') {
      accessToken = session.provider_token;
      tokenSource = 'session.provider_token';
      console.log('[Bitbucket Branches] Found token in session.provider_token for Bitbucket');
    }

    if (!accessToken) {
      return Response.json(
        { 
          message: "Bitbucket access token not found or expired. Please reconnect your Bitbucket account.",
          needsAppAuth: true
        },
        { status: 400 }
      );
    }

    console.log(`[Bitbucket Branches] Using token from: ${tokenSource}`);

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
      // Log the error for debugging
      const errorText = await response.text();
      console.log(`[Bitbucket Branches] API request failed with status ${response.status}: ${errorText}`);
      console.log(`[Bitbucket Branches] Token from ${tokenSource} may be invalid or expired`);
      
      // If token from database failed, delete it so user can re-authenticate
      if (tokenSource === 'bitbucket_tokens_table') {
        console.log('[Bitbucket Branches] Deleting invalid stored token');
        await supabase
          .from('bitbucket_tokens')
          .delete()
          .eq('user_id', user.id);
      }
      
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
          { 
            message: "Bitbucket token is invalid or expired. Please reconnect your Bitbucket account.",
            needsAppAuth: true
          },
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