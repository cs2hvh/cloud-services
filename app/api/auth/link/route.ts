// app/api/auth/link/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { AuditLogService, createAuditContext } from "@/lib/audit";
import { sanitizeAuthError, logError } from "@/lib/api/error-sanitizer";
import { githubTokenManager } from "@/lib/providers/github/token-manager";

export async function POST(request: Request) {
  const supabase = await createClient();

  const { provider, method, returnTo } = await request.json().catch(() => ({}));
  if (!provider) {
    return NextResponse.json({ error: "Missing provider" }, { status: 400 });
  }

  // Must be logged in
  let {
    data: { user },
  } = await supabase.auth.getUser();

  // Fallback: try bearer token
  if (!user) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      // console.log(token,"20")
      const {
        data: { user: tokenUser },
      } = await supabase.auth.getUser(token);
      user = tokenUser ?? null;
    }
  }

  if (!user) {
    return NextResponse.json({ err: "Unauthorized" }, { status: 401 });
  }

  //  console.log(user.identities,".........user.identities.........31");

  // let identity;
  // if(method==='disconnect'){
  //      identity = user.identities?.find((id) => id.provider === provider);
  //     if (!identity) {
  //       return new Response(
  //         JSON.stringify({ error: "Provider not linked" }),
  //         { status: 400 }
  //       );
  //     }
  // }

  //If already linked to THIS user, short-circuit
  if (method === "connect") {
    const alreadyLinked = (user.identities ?? []).some(
      (i) => i.provider === provider,
    );
    if (alreadyLinked) {
      if (provider === "github") {
        // GitHub identity already linked. Re-trigger OAuth so /api/auth/callback
        // receives a fresh provider_token and stores it in github_tokens.
        // This handles the case where the token was deleted or never stored.
        const origin = request.headers.get("origin") || "http://localhost:3000";
        const callbackUrl = returnTo
          ? `${origin}/api/auth/callback?next=${encodeURIComponent(returnTo)}`
          : `${origin}/api/auth/callback`;
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "github",
          options: {
            redirectTo: callbackUrl,
            scopes: "repo user:email",
            skipBrowserRedirect: true,
          },
        });
        if (error || !data?.url) {
          logError("POST /api/auth/link github re-auth", error);
          return NextResponse.json(
            { error: "Failed to initiate GitHub re-authentication" },
            { status: 400 }
          );
        }
        return NextResponse.json({ url: data.url }, { status: 200 });
      }
      return NextResponse.json(
        { message: `Already connected with ${provider}.` },
        { status: 409 },
      );
    }
  }

  // Start the link flow. On server, Supabase returns a URL to redirect the user to.
  // After consent, the provider redirects back to Supabase then to your app's /auth/callback,
  // where you call exchangeCodeForSession (you likely have this already).
  const origin = request.headers.get("origin") || "http://localhost:3000";

  // Define scopes for each provider
  const getProviderScopes = (p: string): string | undefined => {
    switch (p) {
      case 'github':
        return 'repo user:email';
      case 'gitlab':
        // GitLab scopes: api for full access, read_user for profile
        // GitLab tokens expire in 2 hours, so we need api scope for refresh tokens
        return 'api read_user';
      case 'bitbucket':
        return 'repository account';
      default:
        return undefined;
    }
  };

  if (method === "connect") {
    // Build callback URL with returnTo parameter so user comes back to the right page
    const callbackUrl = returnTo 
      ? `${origin}/api/auth/callback?next=${encodeURIComponent(returnTo)}`
      : `${origin}/api/auth/callback`;
    
    const { data, error } = await supabase.auth.linkIdentity({
      provider,
      options: {
        redirectTo: callbackUrl,
        scopes: getProviderScopes(provider),
      },
    });
    if (error) {
      // If that provider account is already linked to ANOTHER Supabase user,
      // Supabase returns an error. Surface a friendly message.
        logError("POST /api/auth/link connect", error);
      const msg = /already linked/i.test(error.message)
        ? `This ${provider} account is already connected to a different user. You may be logged in somewhere else.`
        : sanitizeAuthError(error);
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    
    // Audit log: provider connect initiated
    const auditContext = createAuditContext(
      request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown',
      request.headers.get('user-agent') || 'unknown',
      crypto.randomUUID()
    );
    await AuditLogService.create({
      user_id: user.id,
      user_role: 'user',
      user_email: user.email,
      action: 'provider_connect',
      service_type: 'auth',
      service_id: `${provider}_${user.id}`,
      service_name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} OAuth`,
      metadata: { 
        provider,
        method: 'connect',
        status: 'initiated',
      },
      ip_address: auditContext.ipAddress,
      user_agent: auditContext.userAgent,
      request_id: auditContext.requestId,
    });
    
    return NextResponse.json({ url: data?.url }, { status: 200 });
  } else {
    // Disconnect: handle both Supabase identity and database tokens
    
    // First try to unlink from Supabase identity
    const identity = user.identities?.find((id) => id.provider === provider);
    if (identity) {
      const response = await supabase.auth.unlinkIdentity(identity);
      if (response.error !== null) {
        logError("POST /api/auth/link disconnect", response.error);
        return NextResponse.json({ error: sanitizeAuthError(response.error) }, { status: 400 });
      }
    }
    
    // GitHub tokens are sourced from Supabase OAuth, so they're tied to the identity.
    // GitLab and Bitbucket tokens come from a separate direct OAuth flow (/api/gitlab/app-auth,
    // /api/bitbucket/app-auth) and are completely independent — unlinking login must NOT remove them.
    // Only delete github_tokens when we actually unlinked a GitHub identity.
    if (provider === 'github') {
      if (identity) {
        await githubTokenManager.deleteToken(user.id);
      } else {
        // Disconnect was requested but no GitHub identity was found on this user —
        // this can happen if the user manually removed the identity elsewhere.
        // Log it so we can detect stale state issues, but don't error out.
        console.warn('[Auth/Link] Disconnect requested for github but no identity found on user', user.id);
      }
    }
    
    // Audit log: provider disconnect
    const auditContext = createAuditContext(
      request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown',
      request.headers.get('user-agent') || 'unknown',
      crypto.randomUUID()
    );
    await AuditLogService.create({
      user_id: user.id,
      user_role: 'user',
      user_email: user.email,
      action: 'provider_disconnect',
      service_type: 'auth',
      service_id: `${provider}_${user.id}`,
      service_name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} OAuth`,
      metadata: { 
        provider,
        method: 'disconnect',
        status: 'success',
      },
      ip_address: auditContext.ipAddress,
      user_agent: auditContext.userAgent,
      request_id: auditContext.requestId,
    });
    
    // Success - provider disconnected
    return NextResponse.json(
      { message: "disconnect success", success: true },
      { status: 200 },
    );
  }

  // Success: return the redirect URL so the client can navigate there.
}
