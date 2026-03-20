import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Bitbucket OAuth callback handler
 * Exchanges the authorization code for access and refresh tokens
 * 
 * Bitbucket token response format:
 * {
 *   "access_token": "...",
 *   "token_type": "bearer",
 *   "expires_in": 3600,  // 1 hour
 *   "refresh_token": "...",
 *   "scopes": "repository account"
 * }
 */
export async function GET(request: NextRequest) {
  // Define domain once at the top for all redirects
  const domain = process.env.DOMAIN;
  
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    
    if (!code || !state) {
      return NextResponse.redirect(`${domain}/dashboard/settings?error=missing_code`);
    }

    // Decode state to extract userId, timestamp, and returnTo path
    let userId: string;
    let returnTo = '/dashboard/settings';
    try {
      const decoded = Buffer.from(state, 'base64').toString('utf-8');
      const parts = decoded.split('|');
      userId = parts[0];
      returnTo = parts[2] || '/dashboard/settings';
    } catch {
      // Fallback for old state format
      userId = state.split('-')[0];
    }
    
    const supabase = await createClient();
    
    // Verify the user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user || user.id !== userId) {
      return NextResponse.redirect(`${domain}${returnTo}?error=invalid_user`);
    }

    const clientId = process.env.BITBUCKET_CLIENT_ID;
    const clientSecret = process.env.BITBUCKET_CLIENT_SECRET;
    const redirectUri = `${domain}/api/bitbucket/callback`;

    if (!clientId || !clientSecret) {
      console.error('Bitbucket OAuth credentials not configured');
      return NextResponse.redirect(`${domain}${returnTo}?error=config_error`);
    }

    // Create Basic Auth header (Bitbucket requires Basic Auth for token exchange)
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    // Exchange code for access token
    // IMPORTANT: Bitbucket requires the same redirect_uri used in authorization
    const tokenResponse = await fetch('https://bitbucket.org/site/oauth2/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      console.error('Bitbucket token exchange failed with status:', tokenResponse.status);
      return NextResponse.redirect(`${domain}${returnTo}?error=token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error('Bitbucket token error:', tokenData.error);
      return NextResponse.redirect(`${domain}${returnTo}?error=${tokenData.error}`);
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 3600; // Default 1 hour
    
    if (!accessToken) {
      console.error('No access token received from Bitbucket');
      return NextResponse.redirect(`${domain}${returnTo}?error=no_token`);
    }

    // Get Bitbucket user info to store username
    const userResponse = await fetch('https://api.bitbucket.org/2.0/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      }
    });

    if (!userResponse.ok) {
      console.error('Failed to get Bitbucket user info');
      return NextResponse.redirect(`${domain}${returnTo}?error=user_info_failed`);
    }

    const bitbucketUser = await userResponse.json();

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Store the Bitbucket access token in database
    // IMPORTANT: auth_source='direct' means we issued this token with OUR OAuth credentials
    // and can refresh it ourselves (unlike Supabase-sourced tokens)
    const { error: insertError } = await supabase
      .from('bitbucket_tokens')
      .upsert({
        user_id: user.id,
        access_token: accessToken,
        bitbucket_username: bitbucketUser.username || bitbucketUser.nickname,
        bitbucket_user_id: bitbucketUser.account_id || bitbucketUser.uuid,
        scopes: 'repository account',
        refresh_token: refreshToken, // Critical for Bitbucket - tokens expire in 1 hour!
        expires_at: expiresAt,
        auth_source: 'direct', // Mark as direct OAuth - we can refresh this!
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('Failed to store Bitbucket token:', insertError);
      return NextResponse.redirect(`${domain}${returnTo}?error=token_storage_failed`);
    }

    if (!refreshToken) {
      console.warn('Warning: No refresh token received from Bitbucket. Token will expire in 1 hour.');
    }

    // Redirect back to the page where the user initiated the connection
    return NextResponse.redirect(`${domain}${returnTo}?bitbucket_connected=true`);

  } catch (error) {
    console.error("[Bitbucket Callback] Error:", error);
    const returnTo = '/dashboard/settings'; // Default fallback
    return NextResponse.redirect(`${domain}${returnTo}?error=unknown`);
  }
}
