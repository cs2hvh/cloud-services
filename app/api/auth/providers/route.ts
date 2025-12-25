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
    supabase.from('github_tokens').select('id').eq('user_id', user.id).maybeSingle(),
    // Check gitlab_tokens table (if exists)
    supabase.from('gitlab_tokens').select('id').eq('user_id', user.id).maybeSingle(),
    // Check bitbucket_tokens table (if exists)
    supabase.from('bitbucket_tokens').select('id').eq('user_id', user.id).maybeSingle(),
  ]);

  const hasGitHubToken = tokenChecks[0]?.data !== null;
  const hasGitLabToken = tokenChecks[1]?.data !== null;
  const hasBitbucketToken = tokenChecks[2]?.data !== null;

  // Build the array of { provider, status }
  // Status is true if:
  // 1. Provider is linked via Supabase identity (for auth providers like google, email)
  // 2. OR user has an OAuth token stored (for git providers like github, gitlab, bitbucket)
  const providers = allProviders.map((provider) => {
    let status = linkedProviders.includes(provider);
    
    // Also check our OAuth tokens table for git providers
    if (provider === 'github' && hasGitHubToken) status = true;
    if (provider === 'gitlab' && hasGitLabToken) status = true;
    if (provider === 'bitbucket' && hasBitbucketToken) status = true;
    
    return {
      provider,
      status,
    };
  });

  return NextResponse.json({
    user_id: user.id,
    providers: providers,
    identities: user.identities ?? [],
  });
}
