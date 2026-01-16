import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    // If successful, store provider tokens for repository access
    // NOTE: We only store GitHub tokens from Supabase Auth because they don't expire.
    // For GitLab/Bitbucket, users must explicitly "Connect" via /api/gitlab/app-auth or /api/bitbucket/app-auth
    // to get tokens that we can refresh with our own OAuth credentials.
    if (!error && data.session) {
      const user = data.session.user;
      
      // Handle GitHub token storage
      // GitHub is special: tokens from Supabase Auth don't expire, so we can store them
      const githubIdentity = user.identities?.find(
        (identity) => identity.provider === "github"
      );

      if (githubIdentity && data.session.provider_token) {
        try {
          // Get GitHub user info
          const userResponse = await fetch("https://api.github.com/user", {
            headers: {
              Authorization: `Bearer ${data.session.provider_token}`,
              Accept: "application/vnd.github.v3+json",
            },
          });

          if (userResponse.ok) {
            const githubUser = await userResponse.json();

            // Store the GitHub token for repository access
            // NOTE: GitHub OAuth tokens from Supabase Auth do NOT expire (they are classic OAuth tokens)
            const { error: upsertError } = await supabase
              .from("github_tokens")
              .upsert({
                user_id: user.id,
                access_token: data.session.provider_token,
                github_username: githubUser.login,
                github_user_id: githubUser.id,
                scopes: "repo user:email",
                refresh_token: data.session.provider_refresh_token || null,
                expires_at: null, // GitHub OAuth tokens don't expire
                updated_at: new Date().toISOString(),
              });

            if (upsertError) {
              console.error("Failed to upsert GitHub token:", upsertError);
            } else {
              console.log(
                "Stored GitHub token for repository access:",
                githubUser.login
              );
            }
          }
        } catch (error) {
          console.error("Failed to store GitHub token:", error);
          // Don't fail the auth flow if token storage fails
        }
      }

      // GitLab and Bitbucket: NOT stored here!
      // Reason: Supabase-sourced tokens expire (2hrs for GitLab, 1hr for Bitbucket)
      // and we can't refresh them with our credentials (they were issued by Supabase's OAuth app).
      // 
      // Users should:
      // 1. Sign in with email/password or GitHub for authentication
      // 2. Explicitly "Connect GitLab" or "Connect Bitbucket" in dashboard for repository access
      //    - This uses /api/gitlab/app-auth or /api/bitbucket/app-auth
      //    - Gives us tokens we can refresh infinitely with our OAuth credentials
    }

    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host"); // original origin before load balancer
      const isLocalEnv = process.env.NODE_ENV === "development";

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
