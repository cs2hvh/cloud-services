import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    console.log('=== DEBUGGING BITBUCKET TOKEN ACCESS ===');
    console.log('Session user ID:', session.user.id);

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

    console.log('Bitbucket Identity Data:', JSON.stringify(bitbucketIdentity.identity_data, null, 2));

    // Try to get access token from multiple locations
    let accessToken = null;
    
    // Method 1: Session provider token
    if (session.provider_token) {
      accessToken = session.provider_token;
      console.log('Found token in session.provider_token');
    }
    
    // Method 2: Identity data provider token
    else if (bitbucketIdentity.identity_data?.provider_token) {
      accessToken = bitbucketIdentity.identity_data.provider_token;
      console.log('Found token in identity_data.provider_token');
    }
    
    // Method 3: Identity data access token
    else if (bitbucketIdentity.identity_data?.access_token) {
      accessToken = bitbucketIdentity.identity_data.access_token;
      console.log('Found token in identity_data.access_token');
    }

    if (!accessToken) {
      console.error('No Bitbucket access token found');
      
      // Bitbucket doesn't have a public API for user repositories without authentication
      return Response.json(
        { 
          message: "Bitbucket access token not found. Please check Bitbucket OAuth configuration.",
          debug: "Bitbucket requires authentication for repository access"
        },
        { status: 400 }
      );
    }

    console.log('Using Bitbucket token for repo access');

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
      console.error('Bitbucket API Error:', response.status, errorText);
      
      if (response.status === 401) {
        return Response.json(
          { message: "Bitbucket token is invalid or expired. Please reconnect your Bitbucket account." },
          { status: 400 }
        );
      }
      
      throw new Error(`Bitbucket API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const repos = data.values || [];
    console.log(`Fetched ${repos.length} repositories from Bitbucket`);
    
    // Transform Bitbucket API response to our format
    const transformedRepos = repos.map((repo: any) => ({
      id: repo.uuid,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description || '',
      private: repo.is_private,
      defaultBranch: repo.mainbranch?.name || 'main',
      language: repo.language || 'Unknown',
      updatedAt: repo.updated_on,
      provider: 'bitbucket',
      cloneUrl: repo.links?.clone?.find((link: any) => link.name === 'https')?.href,
      htmlUrl: repo.links?.html?.href
    }));

    return Response.json({ 
      repositories: transformedRepos,
      note: `Successfully loaded ${transformedRepos.length} repositories from Bitbucket`
    }, { status: 200 });

  } catch (error) {
    console.error("[Bitbucket Repositories API] Error:", error);
    return Response.json(
      { message: "Failed to fetch Bitbucket repositories" },
      { status: 500 }
    );
  }
}
