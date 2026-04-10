import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { encryptOAuthToken } from "@/lib/security/token-crypto";

/**
 * GitLab OAuth callback handler
 * Exchanges the authorization code for access and refresh tokens
 * 
 * GitLab token response format:
 * {
 *   "access_token": "...",
 *   "token_type": "bearer",
 *   "expires_in": 7200,  // 2 hours
 *   "refresh_token": "...",
 *   "created_at": 1607635748
 * }
 */
export async function GET(request: NextRequest) {
  // Define domain once at the top for all redirects
  const domain = process.env.DOMAIN || 'http://localhost:3000';
  
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    
    if (!code || !state) {
      return NextResponse.redirect(`${domain}/dashboard/settings?error=missing_code`);
    }

    // Extract user ID and returnTo from state
    // State format: userId|timestamp|returnPath (base64 encoded)
    let userId: string;
    let returnTo = '/dashboard/settings';
    try {
      const stateData = Buffer.from(state, 'base64').toString('utf-8');
      const [id, , path] = stateData.split('|');
      userId = id;
      returnTo = path || '/dashboard/settings';
    } catch {
      // Fallback for old state format: userId-timestamp
      userId = state.split('-')[0];
      returnTo = '/dashboard/settings';
    }
    
    const supabase = await createClient();
    
    // Verify the user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user || user.id !== userId) {
      return NextResponse.redirect(`${domain}${returnTo}?error=invalid_user`);
    }

    const clientId = process.env.GITLAB_CLIENT_ID;
    const clientSecret = process.env.GITLAB_CLIENT_SECRET;
    const redirectUri = `${domain}/api/gitlab/callback`;

    if (!clientId || !clientSecret) {
      console.error('GitLab OAuth credentials not configured');
      return NextResponse.redirect(`${domain}${returnTo}?error=config_error`);
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://gitlab.com/oauth/token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      console.error('GitLab token exchange failed with status:', tokenResponse.status);
      return NextResponse.redirect(`${domain}${returnTo}?error=token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error('GitLab token error:', tokenData.error);
      return NextResponse.redirect(`${domain}${returnTo}?error=${tokenData.error}`);
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 7200; // Default 2 hours
    
    if (!accessToken) {
      console.error('No access token received from GitLab');
      return NextResponse.redirect(`${domain}${returnTo}?error=no_token`);
    }

    // Get GitLab user info to store username
    const userResponse = await fetch('https://gitlab.com/api/v4/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      }
    });

    if (!userResponse.ok) {
      console.error('Failed to get GitLab user info');
      return NextResponse.redirect(`${domain}${returnTo}?error=user_info_failed`);
    }

    const gitlabUser = await userResponse.json();

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Store the GitLab access token in database
    // IMPORTANT: auth_source='direct' means we issued this token with OUR OAuth credentials
    // and can refresh it ourselves (unlike Supabase-sourced tokens)
    const { error: insertError } = await supabase
      .from('gitlab_tokens')
      .upsert({
        user_id: user.id,
        access_token: encryptOAuthToken(accessToken),
        gitlab_username: gitlabUser.username,
        gitlab_user_id: gitlabUser.id,
        scopes: 'api read_user',
        refresh_token: encryptOAuthToken(refreshToken), // Critical for GitLab - tokens expire in 2 hours!
        expires_at: expiresAt,
        auth_source: 'direct', // Mark as direct OAuth - we can refresh this!
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('Failed to store GitLab token:', insertError);
      return NextResponse.redirect(`${domain}${returnTo}?error=token_storage_failed`);
    }

    if (!refreshToken) {
      console.warn('Warning: No refresh token received from GitLab. Token will expire in 2 hours.');
    }

    // Redirect back to the return path with success
    const separator = returnTo.includes('?') ? '&' : '?';
    return NextResponse.redirect(`${domain}${returnTo}${separator}gitlab_connected=true`);

  } catch (error) {
    console.error("[GitLab Callback] Error:", error);
    return NextResponse.redirect(`${domain}/dashboard/settings?error=unknown`);
  }
}
