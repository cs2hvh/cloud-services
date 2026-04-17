import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { encryptOAuthToken } from "@/lib/security/token-crypto";
import { createHmac, timingSafeEqual } from "crypto";
import { getAppBaseUrl } from "@/lib/api/get-app-base-url";
import { getOAuthStateSecret } from "@/lib/api/oauth-state";

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

function getStateSecret(): string {
  return getOAuthStateSecret(process.env.GITLAB_STATE_SECRET, "GitLab", "GITLAB_STATE_SECRET");
}

/** Verifies HMAC-signed state and extracts payload. Returns null if invalid. */
function verifySignedState(
  state: string
): { userId: string; returnTo: string; issuedAt: number } | null {
  try {
    const secret = getStateSecret();
    if (!secret) return null;

    const dotIdx = state.lastIndexOf(".");
    if (dotIdx === -1) return null;

    const payloadB64 = state.slice(0, dotIdx);
    const signature = state.slice(dotIdx + 1);

    const expectedSig = createHmac("sha256", secret)
      .update(payloadB64)
      .digest("base64url");

    // Constant-time comparison to prevent timing attacks
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    if (!payload.userId || !payload.issuedAt) return null;

    // Reject states older than 10 minutes
    if (Date.now() - payload.issuedAt > 10 * 60 * 1000) return null;

    return {
      userId: payload.userId,
      returnTo: payload.returnTo || "/dashboard/settings",
      issuedAt: payload.issuedAt,
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  // Derive domain from request so OAuth works in both dev and production
  const domain = getAppBaseUrl(request);
  
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    
    if (!code || !state) {
      return NextResponse.redirect(`${domain}/dashboard/settings?error=missing_code`);
    }

    // Verify HMAC-signed state and extract userId + returnTo
    const statePayload = verifySignedState(state);
    if (!statePayload) {
      console.error('[GitLab Callback] Invalid or expired state parameter');
      return NextResponse.redirect(`${domain}/dashboard/settings?error=invalid_state`);
    }
    const { userId, returnTo } = statePayload;
    
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
      return NextResponse.redirect(`${domain}${returnTo}?error=token_exchange_failed`);
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
