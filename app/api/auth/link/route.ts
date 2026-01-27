// app/api/auth/link/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { AuditLogService, createAuditContext } from "@/lib/audit";

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
  console.log(origin, "....................52");

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
      console.log({ ...error }, ".......................58");
      const msg = /already linked/i.test(error.message)
        ? `This ${provider} account is already connected to a different user. You may be logged in somewhere else.`
        : error.message || "Could not start linking flow.";
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
        return NextResponse.json({ error: response.error.message }, { status: 400 });
      }
    }
    
    // Also delete from database token tables (for git API access)
    if (provider === 'github') {
      await supabase.from('github_tokens').delete().eq('user_id', user.id);
    } else if (provider === 'gitlab') {
      await supabase.from('gitlab_tokens').delete().eq('user_id', user.id);
    } else if (provider === 'bitbucket') {
      await supabase.from('bitbucket_tokens').delete().eq('user_id', user.id);
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
