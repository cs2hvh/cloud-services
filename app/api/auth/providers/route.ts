// app/api/auth/providers/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const revalidate = 0; // no caching for auth-sensitive data

export async function GET(request: Request) {
  const supabase = await createClient();

  // Try to get user from cookies
  let {
    data: { user },
  } = await supabase.auth.getUser();

  // Fallback: try bearer token
  if (!user) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      console.log("18");
      const token = authHeader.replace("Bearer ", "");
      // console.log(token,"20")
      const {
        data: { user: tokenUser },
      } = await supabase.auth.getUser(token);
      user = tokenUser ?? null;
    }
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allProviders = ["github", "google", "gitlab", "bitbucket", "email"];

  //const lastLoginProvider = user.app_metadata?.provider ?? null;

  const linkedProviders = (user.identities ?? []).map((i) => i.provider);

  // Check for OAuth tokens stored in our database (for API access)
  // These are different from Supabase identity providers
  const tokenChecks = await Promise.all([
    // Check github_tokens table
    supabase.from('github_tokens').select('user_id').eq('user_id', user.id).maybeSingle(),
    // Check gitlab_tokens table
    supabase.from('gitlab_tokens').select('user_id').eq('user_id', user.id).maybeSingle(),
    // Check bitbucket_tokens table
    supabase.from('bitbucket_tokens').select('user_id').eq('user_id', user.id).maybeSingle(),
  ]);

  const hasGitHubToken = tokenChecks[0]?.data !== null;
  const hasGitLabToken = tokenChecks[1]?.data !== null;
  const hasBitbucketToken = tokenChecks[2]?.data !== null;


  // Build the array of { provider, status }
  // Status is true if:
  // 1. For GitLab/Bitbucket: ONLY check token tables (direct OAuth for API access)
  // 2. For GitHub: Check both identity and token (backwards compatibility)
  // 3. For other providers (google, email): Only check Supabase identities
  const providers = allProviders.map((provider) => {
    const identityLinked = linkedProviders.includes(provider);
    const integrationConnected =
      provider === "github"
        ? hasGitHubToken
        : provider === "gitlab"
          ? hasGitLabToken
          : provider === "bitbucket"
            ? hasBitbucketToken
            : false;

    // For GitLab and Bitbucket, ONLY check token tables (direct OAuth for API access)
    // We don't want to show them as "connected" if they were used for sign-in but no longer have API tokens
    if (provider === 'gitlab') {
      return {
        provider,
        status: hasGitLabToken, // backwards compatibility for integration-driven screens
        identity_linked: identityLinked,
        integration_connected: integrationConnected,
      };
    }
    if (provider === 'bitbucket') {
      return {
        provider,
        status: hasBitbucketToken, // backwards compatibility for integration-driven screens
        identity_linked: identityLinked,
        integration_connected: integrationConnected,
      };
    }
    
    // For GitHub, check both identity and token (backwards compatibility)
    if (provider === 'github') {
      return {
        provider,
        status: identityLinked || hasGitHubToken,
        identity_linked: identityLinked,
        integration_connected: integrationConnected,
      };
    }
    
    // For other providers (google, email), only check Supabase identities
    return {
      provider,
      status: identityLinked,
      identity_linked: identityLinked,
      integration_connected: integrationConnected,
    };
  });
  

  return NextResponse.json({
    user_id: user.id,
    providers: providers,
    identities: user.identities ?? [],
  });
}
