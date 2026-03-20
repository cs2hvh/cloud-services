import { createClient } from "@/lib/supabase/server";
import { AuditLogService, createAuditContext } from "@/lib/audit";

/**
 * Bitbucket App OAuth flow for repository access
 * This provides a direct OAuth flow for infinite token refresh
 * 
 * Bitbucket OAuth Notes:
 * - Tokens expire after 1-2 hours
 * - Refresh tokens must be stored and used to get new access tokens
 * - Required scopes: repository, account
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
        .from('bitbucket_tokens')
        .delete()
        .eq('user_id', user.id);
      
      if (deleteError) {
        return Response.json(
          { message: "Failed to disconnect Bitbucket" },
          { status: 500 }
        );
      }
      
      // Audit log: Bitbucket disconnect
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
        service_id: `bitbucket_${user.id}`,
        service_name: 'Bitbucket App OAuth',
        metadata: { provider: 'bitbucket', method: 'disconnect', status: 'success' },
        ip_address: auditContext.ipAddress,
        user_agent: auditContext.userAgent,
        request_id: auditContext.requestId,
      });
      
      return Response.json({ success: true, message: "Bitbucket disconnected" }, { status: 200 });
    }

    // Bitbucket App OAuth flow for repository access
    const clientId = process.env.BITBUCKET_CLIENT_ID;
    const domain = process.env.DOMAIN;
    const redirectUri = `${domain}/api/bitbucket/callback`;
    
    if (!clientId) {
      return Response.json(
        { message: "Bitbucket OAuth not configured" },
        { status: 500 }
      );
    }
    
    // Scopes needed for private repository access
    // - repository: Read access to repositories
    // - account: Read user info
    const scopes = 'repository account';
    
    // Generate state parameter for CSRF protection + returnTo path
    const returnPath = returnTo || '/dashboard/settings';
    const stateData = `${user.id}|${Date.now()}|${returnPath}`;
    const state = Buffer.from(stateData).toString('base64');
    
    // Build Bitbucket authorization URL
    const bitbucketAuthUrl = `https://bitbucket.org/site/oauth2/authorize?` +
      `client_id=${clientId}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `state=${state}`;

    // Audit log: Bitbucket connect initiated
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
      service_id: `bitbucket_${user.id}`,
      service_name: 'Bitbucket App OAuth',
      metadata: { provider: 'bitbucket', method: 'connect', status: 'initiated' },
      ip_address: auditContext.ipAddress,
      user_agent: auditContext.userAgent,
      request_id: auditContext.requestId,
    });

    return Response.json({ 
      url: bitbucketAuthUrl,
      state: state 
    }, { status: 200 });

  } catch (error) {
    console.error("[Bitbucket App Auth] Error:", error);
    return Response.json(
      { message: "Failed to generate Bitbucket authorization URL" },
      { status: 500 }
    );
  }
}
