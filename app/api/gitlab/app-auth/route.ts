import { createClient } from "@/lib/supabase/server";
import { AuditLogService, createAuditContext } from "@/lib/audit";
import { getAppBaseUrl } from "@/lib/api/get-app-base-url";
import { getOAuthStateSecret, createSignedOAuthState } from "@/lib/api/oauth-state";

function getStateSecret(): string {
  return getOAuthStateSecret(process.env.GITLAB_STATE_SECRET, "GitLab", "GITLAB_STATE_SECRET");
}

function createSignedState(userId: string, returnTo: string): string {
  return createSignedOAuthState(getStateSecret(), userId, returnTo);
}

/**
 * GitLab App OAuth flow for repository access
 * This provides a direct OAuth flow when the session token is not available
 * 
 * GitLab OAuth Notes:
 * - Tokens expire after 2 hours (7200 seconds)
 * - Refresh tokens must be stored and used to get new access tokens
 * - Required scopes: api (full access) or read_api (read-only)
 */
export async function POST(request: Request) {
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

    // Handle disconnect
    const { method, returnTo } = await request.json().catch(() => ({ method: 'connect', returnTo: '/dashboard/settings' }));
    if (method === 'disconnect') {
      const { error: deleteError } = await supabase
        .from('gitlab_tokens')
        .delete()
        .eq('user_id', user.id);
      
      if (deleteError) {
        return Response.json(
          { message: "Failed to disconnect GitLab" },
          { status: 500 }
        );
      }
      
      // Audit log: GitLab disconnect
      const auditContext = createAuditContext(
        request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown',
        request.headers.get('user-agent') || 'unknown',
        crypto.randomUUID()
      );
      await AuditLogService.create({
        user_id: user.id,
        user_role: 'user',
        user_email: user.email || undefined,
        action: 'provider_disconnect',
        service_type: 'auth',
        service_id: `gitlab_${user.id}`,
        service_name: 'GitLab App OAuth',
        metadata: { provider: 'gitlab', method: 'disconnect', status: 'success' },
        ip_address: auditContext.ipAddress,
        user_agent: auditContext.userAgent,
        request_id: auditContext.requestId,
      });
      
      return Response.json({ success: true, message: "GitLab disconnected" }, { status: 200 });
    }

    // GitLab App OAuth flow for repository access
    const clientId = process.env.GITLAB_CLIENT_ID;
    const domain = getAppBaseUrl(request);
    const redirectUri = `${domain}/api/gitlab/callback`;
    
    if (!clientId) {
      return Response.json(
        { message: "GitLab OAuth not configured" },
        { status: 500 }
      );
    }
    
    // Scopes needed for private repository access
    // - api: Complete read/write access to the API
    // - read_user: Read user profile
    const scopes = 'api read_user';
    
    // Generate HMAC-signed state for CSRF protection
    const returnPath = typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//')
      ? returnTo
      : '/dashboard/settings';
    const state = createSignedState(user.id, returnPath);
    
    // Build GitLab authorization URL
    const gitlabAuthUrl = `https://gitlab.com/oauth/authorize?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `state=${state}`;

    // Audit log: GitLab connect initiated
    const auditContext = createAuditContext(
      request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown',
      request.headers.get('user-agent') || 'unknown',
      crypto.randomUUID()
    );
    await AuditLogService.create({
      user_id: user.id,
      user_role: 'user',
      user_email: user.email || undefined,
      action: 'provider_connect',
      service_type: 'auth',
      service_id: `gitlab_${user.id}`,
      service_name: 'GitLab App OAuth',
      metadata: { provider: 'gitlab', method: 'connect', status: 'initiated' },
      ip_address: auditContext.ipAddress,
      user_agent: auditContext.userAgent,
      request_id: auditContext.requestId,
    });

    return Response.json({ 
      url: gitlabAuthUrl,
      state: state 
    }, { status: 200 });

  } catch (error) {
    console.error("[GitLab App Auth] Error:", error);
    return Response.json(
      { message: "Failed to generate GitLab authorization URL" },
      { status: 500 }
    );
  }
}
