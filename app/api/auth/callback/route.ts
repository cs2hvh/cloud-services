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
    if (!error && data.session) {
      const user = data.session.user;
      
      // Handle GitHub token storage
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
            // NOTE: GitHub OAuth tokens from Supabase linkIdentity do NOT expire (they are classic OAuth tokens)
            // The data.session.expires_at is the Supabase SESSION expiration, NOT the GitHub token expiration
            // We should NOT set expires_at for these tokens, or set it far in the future
            const { error: upsertError } = await supabase
              .from("github_tokens")
              .upsert({
                user_id: user.id,
                access_token: data.session.provider_token,
                github_username: githubUser.login,
                github_user_id: githubUser.id,
                scopes: "repo user:email",
                refresh_token: data.session.provider_refresh_token || null, // Usually null for linkIdentity
                expires_at: null, // GitHub OAuth tokens don't expire - DON'T use Supabase session expiry
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

      // Handle GitLab token storage
      // IMPORTANT: GitLab tokens expire after 2 hours (7200 seconds)
      // We MUST store the refresh_token to be able to get new access tokens
      const gitlabIdentity = user.identities?.find(
        (identity) => identity.provider === "gitlab"
      );

      if (gitlabIdentity && data.session.provider_token) {
        try {
          // Get GitLab user info
          const userResponse = await fetch("https://gitlab.com/api/v4/user", {
            headers: {
              Authorization: `Bearer ${data.session.provider_token}`,
              Accept: "application/json",
            },
          });

          if (userResponse.ok) {
            const gitlabUser = await userResponse.json();

            // GitLab tokens expire in 7200 seconds (2 hours) by default
            // Calculate expiration time - use 7200 seconds (2 hours) as per GitLab docs
            const expiresAt = new Date(Date.now() + 7200 * 1000).toISOString();

            // Store the GitLab token for repository access
            const { error: upsertError } = await supabase
              .from("gitlab_tokens")
              .upsert({
                user_id: user.id,
                access_token: data.session.provider_token,
                gitlab_username: gitlabUser.username,
                gitlab_user_id: gitlabUser.id,
                scopes: "api read_user",
                refresh_token: data.session.provider_refresh_token || null, // Critical for GitLab!
                expires_at: expiresAt, // GitLab tokens DO expire - typically 2 hours
                updated_at: new Date().toISOString(),
              });

            if (upsertError) {
              console.error("Failed to upsert GitLab token:", upsertError);
            } else {
              console.log(
                "Stored GitLab token for repository access:",
                gitlabUser.username
              );
              if (!data.session.provider_refresh_token) {
                console.warn(
                  "Warning: No refresh token received for GitLab. Token will expire in 2 hours."
                );
              }
            }
          }
        } catch (error) {
          console.error("Failed to store GitLab token:", error);
          // Don't fail the auth flow if token storage fails
        }
      }
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
