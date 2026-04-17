import { createClient } from "@/lib/supabase/server";
import { decryptOAuthToken, encryptOAuthToken } from "@/lib/security/token-crypto";

/**
 * GitLab OAuth Token Information:
 * - Access tokens expire after 2 hours (7200 seconds)
 * - Refresh tokens must be used to get new access tokens
 * - When refreshing, both old access_token AND refresh_token are invalidated
 * - New tokens are returned in the response
 * 
 * Required scopes for repository access:
 * - api: Complete read/write access (recommended for full functionality)
 * - read_api: Read-only access to API
 * - read_user: Read-only access to user profile
 * - read_repository: Read-only access to private repositories
 */

/**
 * Refreshes a GitLab OAuth token using the refresh token
 * GitLab OAuth tokens expire (typically 2 hours) and need to be refreshed
 * 
 * IMPORTANT: This only works for tokens obtained via direct OAuth (/api/gitlab/callback)
 * Tokens from Supabase Auth cannot be refreshed with our credentials!
 * 
 * @param refreshToken The refresh token to use for refreshing the access token
 * @returns The new access token if successful, null otherwise
 */
export async function refreshGitLabToken(refreshToken: string): Promise<{
  accessToken: string | null;
  newRefreshToken: string | null;
  expiresIn: number | null;
}> {
  try {
    const clientId = process.env.GITLAB_CLIENT_ID;
    const clientSecret = process.env.GITLAB_CLIENT_SECRET;
    const domain = process.env.DOMAIN;
    
    // Validate required configuration
    if (!clientId || !clientSecret) {
      console.error('[GitLab Token Refresh] Missing GITLAB_CLIENT_ID or GITLAB_CLIENT_SECRET');
      return { accessToken: null, newRefreshToken: null, expiresIn: null };
    }
    
    if (!domain) {
      console.error('[GitLab Token Refresh] Missing DOMAIN  environment variable');
      return { accessToken: null, newRefreshToken: null, expiresIn: null };
    }
    
    // GitLab requires redirect_uri to match the original authorization request
    // IMPORTANT: Must match the redirect_uri used in /api/gitlab/callback/route.ts
    const redirectUri = `${domain}/api/gitlab/callback`;
    
    console.log('[GitLab Token Refresh] Attempting refresh with redirect_uri:', redirectUri);
    
    // IMPORTANT for localhost: GitLab OAuth app must have http://localhost:3000/api/gitlab/callback 
    // registered as an authorized redirect URI
    if (domain.includes('localhost')) {
      console.log('[GitLab Token Refresh] Running on localhost - ensure GitLab OAuth app has localhost redirect URI registered');
    }
    
    const response = await fetch('https://gitlab.com/oauth/token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[GitLab Token Refresh] Failed to refresh token:', response.status, errorText);
      
      // Parse error for better debugging
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error === 'invalid_grant') {
          console.error('[GitLab Token Refresh] invalid_grant - Common causes:');
          console.error('  1. Refresh token was already used (GitLab rotates refresh tokens)');
          console.error('  2. redirect_uri mismatch - must match original OAuth callback');
          console.error('  3. Token was from Supabase Auth (cannot refresh with our credentials)');
        } else if (errorJson.error === 'invalid_client') {
          console.error('[GitLab Token Refresh] invalid_client - Check GITLAB_CLIENT_ID and GITLAB_CLIENT_SECRET');
        }
      } catch {
        // Not JSON, use raw error
      }
      
      return { accessToken: null, newRefreshToken: null, expiresIn: null };
    }

    const tokenData = await response.json();
    
    if (tokenData.error) {
      console.error('[GitLab Token Refresh] Error:', tokenData.error, tokenData.error_description);
      return { accessToken: null, newRefreshToken: null, expiresIn: null };
    }

    console.log('[GitLab Token Refresh] Successfully refreshed token');
    console.log('[GitLab Token Refresh] New refresh token received:', !!tokenData.refresh_token);
    
    return {
      accessToken: tokenData.access_token || null,
      newRefreshToken: tokenData.refresh_token || null, // MUST save this - old refresh token is now invalid!
      expiresIn: tokenData.expires_in || null,
    };
  } catch (error) {
    console.error('[GitLab Token Refresh] Exception:', error);
    return { accessToken: null, newRefreshToken: null, expiresIn: null };
  }
}

/**
 * Gets a valid GitLab access token for a user.
 * Unlike GitHub OAuth tokens which don't expire, GitLab tokens DO expire (typically 2 hours).
 * This function checks if the token needs refreshing and handles it automatically.
 * 
 * @param userId The user ID to get token for
 * @returns A valid access token if available, null otherwise
 */
export async function getValidGitLabToken(userId: string): Promise<string | null> {
  try {
    const supabase = await createClient();
    
    // Get stored token from database
    const { data: tokenData, error } = await supabase
      .from('gitlab_tokens')
      .select('access_token, refresh_token, expires_at, auth_source')
      .eq('user_id', userId)
      .single();

    const currentAccessToken = decryptOAuthToken(tokenData?.access_token ?? null);
    const currentRefreshToken = decryptOAuthToken(tokenData?.refresh_token ?? null);

    if (error || !currentAccessToken) {
      console.log('[GitLab Token] No stored token found for user:', userId);
      return null;
    }

    // Check if token has expired or will expire soon (within 5 minutes)
    const now = new Date();
    const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at) : null;
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    
    // If no expiration set or token hasn't expired (with 5 min buffer), return current token
    if (!expiresAt || expiresAt > fiveMinutesFromNow) {
      console.log('[GitLab Token] Found valid stored token for user:', userId);
      return currentAccessToken;
    }

    // Token has expired or will expire soon, try to refresh
    console.log('[GitLab Token] Token expired or expiring soon, attempting refresh for user:', userId);
    console.log('[GitLab Token] Token auth_source:', tokenData.auth_source || 'unknown (legacy)');
    
    // Check if this token came from Supabase Auth - if so, we cannot refresh it directly
    // Supabase manages its own OAuth tokens with its own client credentials
    if (tokenData.auth_source === 'supabase') {
      console.log('[GitLab Token] Token from Supabase Auth - cannot refresh with app credentials');
      console.log('[GitLab Token] User should refresh their Supabase session or re-connect GitLab');
      // For Supabase-sourced tokens, try to get a fresh token from Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.provider_token && session.user?.app_metadata?.provider === 'gitlab') {
        console.log('[GitLab Token] Found fresh token in Supabase session, updating database');
        // Update the database with the fresh session token
        await supabase
          .from('gitlab_tokens')
          .update({
            access_token: encryptOAuthToken(session.provider_token),
            refresh_token: encryptOAuthToken(session.provider_refresh_token || currentRefreshToken),
            expires_at: new Date(Date.now() + 7200 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
        return session.provider_token;
      }
      // Delete the expired token - user needs to re-authenticate
      await supabase
        .from('gitlab_tokens')
        .delete()
        .eq('user_id', userId);
      return null;
    }
    
    if (!currentRefreshToken) {
      console.log('[GitLab Token] No refresh token available, user needs to re-authenticate');
      // Delete the expired token
      await supabase
        .from('gitlab_tokens')
        .delete()
        .eq('user_id', userId);
      return null;
    }

    const refreshResult = await refreshGitLabToken(currentRefreshToken);
    
    if (!refreshResult.accessToken) {
      console.log('[GitLab Token] Failed to refresh token, user needs to re-authenticate');
      // Delete the expired/invalid token
      await supabase
        .from('gitlab_tokens')
        .delete()
        .eq('user_id', userId);
      return null;
    }

    // Update the stored token with new values
    const newExpiresAt = refreshResult.expiresIn 
      ? new Date(Date.now() + refreshResult.expiresIn * 1000).toISOString()
      : null;

    const { error: updateError } = await supabase
      .from('gitlab_tokens')
      .update({
        access_token: encryptOAuthToken(refreshResult.accessToken),
        refresh_token: encryptOAuthToken(refreshResult.newRefreshToken || currentRefreshToken),
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('[GitLab Token] Failed to update refreshed token:', updateError);
      // Still return the new token even if we couldn't save it
    } else {
      console.log('[GitLab Token] Successfully refreshed and stored new token for user:', userId);
    }

    return refreshResult.accessToken;
  } catch (error) {
    console.error('[GitLab Token] Error getting token:', error);
    return null;
  }
}

/**
 * Validates a GitLab token by making a simple API call
 * @param token The token to validate
 * @returns True if token is valid, false otherwise
 */
export async function validateGitLabToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://gitlab.com/api/v4/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      }
    });
    
    return response.ok;
  } catch (error) {
    console.error('[GitLab Token Validation] Error:', error);
    return false;
  }
}

/**
 * Stores a GitLab token for a user
 * @param userId The user ID to store the token for
 * @param accessToken The access token
 * @param refreshToken The refresh token (required for GitLab since tokens expire)
 * @param expiresIn The token expiration time in seconds (typically 7200 = 2 hours)
 * @param gitlabUsername The GitLab username
 * @param gitlabUserId The GitLab user ID
 * @param scopes The scopes granted
 */
export async function storeGitLabToken(
  userId: string,
  accessToken: string,
  refreshToken: string | null,
  expiresIn: number | null,
  gitlabUsername: string,
  gitlabUserId: number,
  scopes: string
): Promise<boolean> {
  try {
    const supabase = await createClient();
    
    // GitLab tokens expire in 7200 seconds (2 hours) by default
    const expiresAt = expiresIn 
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : new Date(Date.now() + 7200 * 1000).toISOString(); // Default 2 hours

    const { error } = await supabase
      .from('gitlab_tokens')
      .upsert({
        user_id: userId,
        access_token: encryptOAuthToken(accessToken),
        refresh_token: encryptOAuthToken(refreshToken),
        expires_at: expiresAt,
        gitlab_username: gitlabUsername,
        gitlab_user_id: gitlabUserId,
        scopes: scopes,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('[GitLab Token Storage] Failed to store token:', error);
      return false;
    }

    console.log('[GitLab Token Storage] Successfully stored token for user:', userId);
    return true;
  } catch (error) {
    console.error('[GitLab Token Storage] Exception:', error);
    return false;
  }
}

/**
 * Deletes a GitLab token for a user
 * @param userId The user ID to delete the token for
 */
export async function deleteGitLabToken(userId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    
    const { error } = await supabase
      .from('gitlab_tokens')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('[GitLab Token Delete] Failed to delete token:', error);
      return false;
    }

    console.log('[GitLab Token Delete] Successfully deleted token for user:', userId);
    return true;
  } catch (error) {
    console.error('[GitLab Token Delete] Exception:', error);
    return false;
  }
}
