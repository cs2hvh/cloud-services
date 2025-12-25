import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    
    if (!code || !state) {
      return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?error=missing_code`);
    }

    // Extract user ID from state
    const userId = state.split('-')[0];
    
    const supabase = await createClient();
    
    // Verify the user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user || user.id !== userId) {
      return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?error=invalid_user`);
    }

    const clientId = process.env.GITLAB_CLIENT_ID;
    const clientSecret = process.env.GITLAB_CLIENT_SECRET;
    const redirectUri = `${process.env.DOMAIN}/api/gitlab/callback`;

    if (!clientId || !clientSecret) {
      console.error('GitLab OAuth credentials not configured');
      return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?error=config_error`);
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
      const errorText = await tokenResponse.text();
      console.error('GitLab token exchange failed:', tokenResponse.status, errorText);
      return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?error=token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error('GitLab token error:', tokenData.error, tokenData.error_description);
      return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?error=${tokenData.error}`);
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 7200; // Default 2 hours
    
    if (!accessToken) {
      console.error('No access token received from GitLab');
      return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?error=no_token`);
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
      return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?error=user_info_failed`);
    }

    const gitlabUser = await userResponse.json();

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Store the GitLab access token in database
    const { error: insertError } = await supabase
      .from('gitlab_tokens')
      .upsert({
        user_id: user.id,
        access_token: accessToken,
        gitlab_username: gitlabUser.username,
        gitlab_user_id: gitlabUser.id,
        scopes: 'api read_user',
        refresh_token: refreshToken, // Critical for GitLab - tokens expire in 2 hours!
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('Failed to store GitLab token:', insertError);
      return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?error=token_storage_failed`);
    }

    console.log('Successfully stored GitLab access token for user:', user.id);
    if (!refreshToken) {
      console.warn('Warning: No refresh token received from GitLab. Token will expire in 2 hours.');
    }

    // Redirect back to the app deployment page with success
    return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?gitlab_connected=true`);

  } catch (error) {
    console.error("[GitLab Callback] Error:", error);
    return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?error=unknown`);
  }
}
