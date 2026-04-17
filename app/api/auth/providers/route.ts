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
      const token = authHeader.replace("Bearer ", "");
      const {
        data: { user: tokenUser },
      } = await supabase.auth.getUser(token);
      user = tokenUser ?? null;
    }
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only git providers — Google removed (no repo use case)
  const allProviders = ["github", "gitlab", "bitbucket"];

  const linkedProviders = (user.identities ?? []).map((i) => i.provider);

  // Check for OAuth tokens stored in our database (for repo access)
  const [ghResult, glResult, bbResult] = await Promise.all([
    supabase.from('github_tokens').select('user_id, github_username').eq('user_id', user.id).maybeSingle(),
    supabase.from('gitlab_tokens').select('user_id, gitlab_username').eq('user_id', user.id).maybeSingle(),
    supabase.from('bitbucket_tokens').select('user_id, bitbucket_username').eq('user_id', user.id).maybeSingle(),
  ]);

  const tokenMap: Record<string, { connected: boolean; username: string | null }> = {
    github:    { connected: ghResult.data !== null, username: ghResult.data?.github_username ?? null },
    gitlab:    { connected: glResult.data !== null, username: glResult.data?.gitlab_username ?? null },
    bitbucket: { connected: bbResult.data !== null, username: bbResult.data?.bitbucket_username ?? null },
  };

  const providers = allProviders.map((provider) => ({
    provider,
    status: tokenMap[provider].connected, // repo access status only
    identity_linked: linkedProviders.includes(provider),
    integration_connected: tokenMap[provider].connected,
    integration_username: tokenMap[provider].username,
  }));

  return NextResponse.json({
    user_id: user.id,
    providers,
    identities: user.identities ?? [],
  });
}
