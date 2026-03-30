import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { AuditLogService } from "@/lib/audit";
import { getAuditContext } from "@/lib/audit/context";

function buildRedirectOrigin(request: NextRequest): string {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const hostHeader = request.headers.get("host");
  const isLocalEnv = process.env.NODE_ENV === "development";

  if (isLocalEnv) {
    const host = hostHeader || requestUrl.host;
    const normalizedHost = host.replace(/^0\.0\.0\.0(?=[:]|$)/, "localhost");
    return `http://${normalizedHost}`;
  }

  if (forwardedHost) {
    const proto = forwardedProto || "https";
    return `${proto}://${forwardedHost}`;
  }

  return requestUrl.origin;
}

type CollisionCheckedProvider = "gitlab" | "bitbucket";

async function fetchProviderExternalUserId(
  provider: CollisionCheckedProvider,
  accessToken: string,
): Promise<string | null> {
  const requestConfig = {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  };

  try {
    if (provider === "gitlab") {
      const response = await fetch("https://gitlab.com/api/v4/user", requestConfig);
      if (!response.ok) return null;
      const user = (await response.json()) as { id?: number };
      return typeof user.id === "number" ? String(user.id) : null;
    }

    const response = await fetch("https://api.bitbucket.org/2.0/user", requestConfig);
    if (!response.ok) return null;
    const user = (await response.json()) as {
      account_id?: string;
      uuid?: string;
    };
    return user.account_id || user.uuid || null;
  } catch {
    return null;
  }
}

async function findExistingIntegrationOwner(
  provider: CollisionCheckedProvider,
  externalUserId: string,
): Promise<string | null> {
  try {
    const serviceSupabase = await createServiceClient();
    const table = provider === "gitlab" ? "gitlab_tokens" : "bitbucket_tokens";
    const column = provider === "gitlab" ? "gitlab_user_id" : "bitbucket_user_id";
    const lookupValue =
      provider === "gitlab" ? Number(externalUserId) : externalUserId;

    if (provider === "gitlab" && Number.isNaN(lookupValue)) {
      return null;
    }

    const { data, error } = await serviceSupabase
      .from(table)
      .select("user_id")
      .eq(column, lookupValue)
      .maybeSingle();

    if (error) {
      console.error(`[OAuth Callback] Failed provider collision lookup for ${provider}:`, error);
      return null;
    }

    return data?.user_id ?? null;
  } catch (error) {
    console.error(`[OAuth Callback] Failed to initialize collision lookup for ${provider}:`, error);
    return null;
  }
}

function buildProviderConflictRedirect(
  redirectOrigin: string,
  provider: CollisionCheckedProvider,
  nextPath: string,
): string {
  const signInUrl = new URL("/signin", redirectOrigin);
  signInUrl.searchParams.set("error", "provider_account_linked_to_another_user");
  signInUrl.searchParams.set("provider", provider);
  signInUrl.searchParams.set("redirectTo", nextPath);
  return signInUrl.toString();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const redirectOrigin = buildRedirectOrigin(request);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") ?? "/dashboard";
  const next =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//")
      ? nextRaw
      : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    // If successful, store provider tokens for repository access
    // NOTE: We only store GitHub tokens from Supabase Auth because they don't expire.
    // For GitLab/Bitbucket, users must explicitly "Connect" via /api/gitlab/app-auth or /api/bitbucket/app-auth
    // to get tokens that we can refresh with our own OAuth credentials.
    if (!error && data.session) {
      const user = data.session.user;
      
      // Determine OAuth provider
      const provider = user.app_metadata?.provider || 'unknown';

      if (
        (provider === "gitlab" || provider === "bitbucket") &&
        data.session.provider_token
      ) {
        const collisionProvider = provider as CollisionCheckedProvider;
        const externalUserId = await fetchProviderExternalUserId(
          collisionProvider,
          data.session.provider_token,
        );

        if (externalUserId) {
          const existingOwnerId = await findExistingIntegrationOwner(
            collisionProvider,
            externalUserId,
          );

          if (existingOwnerId && existingOwnerId !== user.id) {
            await supabase.auth.signOut();
            return NextResponse.redirect(
              buildProviderConflictRedirect(redirectOrigin, collisionProvider, next),
            );
          }
        }
      }
      
      // Get user profile for username
      let username: string | undefined;
      try {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("username")
          .eq("id", user.id)
          .single();
        username = profile?.username;
      } catch (e) {
        console.error("Failed to fetch user profile:", e);
      }
      
      // Log OAuth login
      try {
        const context = getAuditContext(request);
        await AuditLogService.create({
          user_id: user.id,
          user_role: 'user',
          user_email: user.email,
          user_username: username,
          action: 'login',
          service_type: 'auth',
          service_id: user.id,
          service_name: `OAuth Login - ${provider}`,
          metadata: {
            login_method: 'oauth',
            provider: provider,
          },
          ...context,
        });
      } catch (auditError) {
        console.error('Failed to log OAuth login:', auditError);
        // Don't fail auth flow if audit logging fails
      }
      
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
      return NextResponse.redirect(`${redirectOrigin}${next}`);
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${redirectOrigin}/auth/auth-code-error`);
}
