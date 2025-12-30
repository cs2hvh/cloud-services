import { createClient } from "@/lib/supabase/server";
import { getValidBitbucketToken } from "@/lib/bitbucket/token-refresh";


interface transformedRepos {
  uuid: string;
  name: string;
  full_name: string;
  description: string | null;
  is_private: boolean;
  mainbranch?: { name: string };  // Optional field for main branch
  language: string | null;
  updated_on: string;  // Assuming `updated_on` is a string (ISO date)
  links?: {
    clone?: { name: string; href: string }[];  // `clone` is an array of link objects
    html?: { href: string };  // HTML URL for the repo
  };
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
    // IMPORTANT: Bitbucket tokens expire in ~1-2 hours, so we MUST prioritize the database token
    // which handles auto-refresh. Session tokens may be stale/expired!
    let accessToken = null;
    let tokenSource = 'none';
    
    // Source 1 (PRIORITY): Database stored token with automatic refresh
    // This is the MOST RELIABLE source because it handles token expiry and refresh
    console.log('[Bitbucket Repos] Checking bitbucket_tokens table for user:', user.id);
    const storedToken = await getValidBitbucketToken(user.id);
    if (storedToken) {
      accessToken = storedToken;
      tokenSource = 'bitbucket_tokens_table';
      console.log('[Bitbucket Repos] Using valid token from bitbucket_tokens table (with auto-refresh)');
    }
    // Source 2: Session provider_token (ONLY as fallback - may be expired!)
    // This is only reliable immediately after OAuth callback
    else if (session.provider_token) {
      accessToken = session.provider_token;
      tokenSource = 'session.provider_token';
      console.log('[Bitbucket Repos] Fallback: Using session.provider_token (may be expired)');
    }

    // Source 2: Identity data provider_token (usually not populated by Supabase)
    if (!accessToken && bitbucketIdentity.identity_data?.provider_token) {
    // Source 3: Identity data provider_token (usually not populated by Supabase)
    else if (bitbucketIdentity.identity_data?.provider_token) {
      accessToken = bitbucketIdentity.identity_data.provider_token;
      tokenSource = 'identity_data.provider_token';
      console.log('[Bitbucket Repos] Fallback: Using identity_data.provider_token');
    } else {
      console.log('[Bitbucket Repos] No valid token found in any source');
    }

    if (!accessToken) {
      console.error('No Bitbucket access token found');
      
      // Bitbucket doesn't have a public API for user repositories without authentication
      return Response.json(
        { 
          message: "Bitbucket access token not found or expired. Please reconnect your Bitbucket account.",
          needsAppAuth: true
        },
        { status: 400 }
      );
    }

    console.log(`[Bitbucket Repos] Using token from: ${tokenSource}`);

    // Fetch all repositories using access token
    const response = await fetch('https://api.bitbucket.org/2.0/repositories?role=member&sort=-updated_on&pagelen=100', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'User-Agent': 'AhuraSense-Cloud-Platform'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[Bitbucket Repos] API request failed with status ${response.status}: ${errorText}`);
      console.log(`[Bitbucket Repos] Token from ${tokenSource} may be invalid or expired`);
      
      // If token from database failed, delete it so user can re-authenticate
      if (tokenSource === 'bitbucket_tokens_table') {
        console.log('[Bitbucket Repos] Deleting invalid stored token');
        await supabase
          .from('bitbucket_tokens')
          .delete()
          .eq('user_id', user.id);
      }
      
      if (response.status === 401) {
        return Response.json(
          { 
            message: "Bitbucket token is invalid or expired. Please reconnect your Bitbucket account.",
            needsAppAuth: true
          },
          { status: 400 }
        );
      }
      
      throw new Error(`Bitbucket API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const repos = data.values || [];
    const privateCount = repos.filter((repo: transformedRepos) => repo.is_private).length;
    console.log(`[Bitbucket Repos] Successfully fetched ${repos.length} repositories (${privateCount} private)`);
    
    // Transform Bitbucket API response to our format
    const transformedRepos = repos.map((repo: transformedRepos) => ({
      id: repo.uuid,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description || '',
      private: repo.is_private,
      defaultBranch: repo.mainbranch?.name || 'main',
      language: repo.language || 'Unknown',
      updatedAt: repo.updated_on,
      provider: 'bitbucket',
      cloneUrl: repo.links?.clone?.find((link) => link.name === 'https')?.href,
      htmlUrl: repo.links?.html?.href
    }));

    return Response.json({ 
      repositories: transformedRepos,
      note: `Loaded ${transformedRepos.length} repositories including ${privateCount} private repositories`
    }, { status: 200 });

  } catch (error) {
    console.error("[Bitbucket Repositories API] Error:", error);
    return Response.json(
      { message: "Failed to fetch Bitbucket repositories" },
      { status: 500 }
    );
  }
}
