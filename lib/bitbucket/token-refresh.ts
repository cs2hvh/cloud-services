import { createClient } from "@/lib/supabase/server";
import { decryptOAuthToken, encryptOAuthToken } from "@/lib/security/token-crypto";

/**
 * Bitbucket OAuth Token Information:
 * - Access tokens expire after 1-2 hours (varies, typically 1 hour)
 * - Refresh tokens must be used to get new access tokens
 * - When refreshing, new tokens are returned
 * - Clone URL format: https://x-token-auth:{access_token}@bitbucket.org/workspace/repo.git
 * 
 * Required scopes for repository access:
 * - repository: Read access to repositories
 * - repository:write: Write access to repositories
 * - account: Read access to account info
 */

/**
 * Refreshes a Bitbucket OAuth token using the refresh token
 * Bitbucket OAuth tokens expire (typically 1-2 hours) and need to be refreshed
 * @param refreshToken The refresh token to use for refreshing the access token
 * @returns The new access token if successful, null otherwise
 */
export async function refreshBitbucketToken(refreshToken: string): Promise<{
  accessToken: string | null;
  newRefreshToken: string | null;
  expiresIn: number | null;
}> {
  try {
    const clientId = process.env.BITBUCKET_CLIENT_ID || '';
    const clientSecret = process.env.BITBUCKET_CLIENT_SECRET || '';
    
    if (!clientId || !clientSecret) {
      console.error('[Bitbucket Token Refresh] Missing client credentials');
      return { accessToken: null, newRefreshToken: null, expiresIn: null };
    }
    
    // Create Basic Auth header
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const response = await fetch('https://bitbucket.org/site/oauth2/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Bitbucket Token Refresh] Failed to refresh token:', response.status, errorText);
      return { accessToken: null, newRefreshToken: null, expiresIn: null };
    }

    const tokenData = await response.json();
    
    if (tokenData.error) {
      console.error('[Bitbucket Token Refresh] Error:', tokenData.error, tokenData.error_description);
      return { accessToken: null, newRefreshToken: null, expiresIn: null };
    }

    console.log('[Bitbucket Token Refresh] Successfully refreshed token');
    return {
      accessToken: tokenData.access_token || null,
      newRefreshToken: tokenData.refresh_token || null,
      expiresIn: tokenData.expires_in || null,
    };
  } catch (error) {
    console.error('[Bitbucket Token Refresh] Exception:', error);
    return { accessToken: null, newRefreshToken: null, expiresIn: null };
  }
}

/**
 * Gets a valid Bitbucket access token for a user.
 * Bitbucket tokens expire (typically 1-2 hours) so this function handles refresh automatically.
 * 
 * @param userId The user ID to get token for
 * @returns A valid access token if available, null otherwise
 */
export async function getValidBitbucketToken(userId: string): Promise<string | null> {
  try {
    const supabase = await createClient();
    
    // Get stored token from database
    const { data: tokenData, error } = await supabase
      .from('bitbucket_tokens')
      .select('access_token, refresh_token, expires_at, auth_source')
      .eq('user_id', userId)
      .single();

    const currentAccessToken = decryptOAuthToken(tokenData?.access_token ?? null);
    const currentRefreshToken = decryptOAuthToken(tokenData?.refresh_token ?? null);

    if (error || !currentAccessToken) {
      console.log('[Bitbucket Token] No stored token found for user:', userId);
      return null;
    }

    // Check if token has expired or will expire soon (within 5 minutes)
    const now = new Date();
    const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at) : null;
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    
    // If no expiration set or token hasn't expired (with 5 min buffer), return current token
    if (!expiresAt || expiresAt > fiveMinutesFromNow) {
      console.log('[Bitbucket Token] Found valid stored token for user:', userId);
      return currentAccessToken;
    }

    // Token has expired or will expire soon, try to refresh
    console.log('[Bitbucket Token] Token expired or expiring soon, attempting refresh for user:', userId);
    console.log('[Bitbucket Token] Token auth_source:', tokenData.auth_source || 'unknown (legacy)');
    
    // Check if this token came from Supabase Auth - if so, we cannot refresh it directly
    // Supabase manages its own OAuth tokens with its own client credentials
    if (tokenData.auth_source === 'supabase') {
      console.log('[Bitbucket Token] Token from Supabase Auth - cannot refresh with app credentials');
      console.log('[Bitbucket Token] User should refresh their Supabase session or re-connect Bitbucket');
      // For Supabase-sourced tokens, try to get a fresh token from Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.provider_token && session.user?.app_metadata?.provider === 'bitbucket') {
        console.log('[Bitbucket Token] Found fresh token in Supabase session, updating database');
        // Update the database with the fresh session token
        await supabase
          .from('bitbucket_tokens')
          .update({
            access_token: encryptOAuthToken(session.provider_token),
            refresh_token: encryptOAuthToken(session.provider_refresh_token || currentRefreshToken),
            expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
        return session.provider_token;
      }
      // Delete the expired token - user needs to re-authenticate
      await supabase
        .from('bitbucket_tokens')
        .delete()
        .eq('user_id', userId);
      return null;
    }
    
    if (!currentRefreshToken) {
      console.log('[Bitbucket Token] No refresh token available, user needs to re-authenticate');
      // Delete the expired token
      await supabase
        .from('bitbucket_tokens')
        .delete()
        .eq('user_id', userId);
      return null;
    }

    const refreshResult = await refreshBitbucketToken(currentRefreshToken);
    
    if (!refreshResult.accessToken) {
      console.log('[Bitbucket Token] Failed to refresh token, user needs to re-authenticate');
      // Delete the expired/invalid token
      await supabase
        .from('bitbucket_tokens')
        .delete()
        .eq('user_id', userId);
      return null;
    }

    // Update the stored token with new values
    const newExpiresAt = refreshResult.expiresIn 
      ? new Date(Date.now() + refreshResult.expiresIn * 1000).toISOString()
      : null;

    const { error: updateError } = await supabase
      .from('bitbucket_tokens')
      .update({
        access_token: encryptOAuthToken(refreshResult.accessToken),
        refresh_token: encryptOAuthToken(refreshResult.newRefreshToken || currentRefreshToken),
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('[Bitbucket Token] Failed to update refreshed token:', updateError);
      // Still return the new token even if we couldn't save it
    } else {
      console.log('[Bitbucket Token] Successfully refreshed and stored new token for user:', userId);
    }

    return refreshResult.accessToken;
  } catch (error) {
    console.error('[Bitbucket Token] Error getting token:', error);
    return null;
  }
}

/**
 * Validates a Bitbucket token by making a simple API call
 * @param token The token to validate
 * @returns True if token is valid, false otherwise
 */
export async function validateBitbucketToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.bitbucket.org/2.0/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      }
    });
    
    return response.ok;
  } catch (error) {
    console.error('[Bitbucket Token Validation] Error:', error);
    return false;
  }
}

/**
 * Stores a Bitbucket token for a user
 * @param userId The user ID to store the token for
 * @param accessToken The access token
 * @param refreshToken The refresh token (required for Bitbucket since tokens expire)
 * @param expiresIn The token expiration time in seconds (typically 3600 = 1 hour)
 * @param bitbucketUsername The Bitbucket username
 * @param bitbucketUserId The Bitbucket account ID
 * @param scopes The scopes granted
 */
export async function storeBitbucketToken(
  userId: string,
  accessToken: string,
  refreshToken: string | null,
  expiresIn: number | null,
  bitbucketUsername: string,
  bitbucketUserId: string,
  scopes: string
): Promise<boolean> {
  try {
    const supabase = await createClient();
    
    // Bitbucket tokens expire in 3600 seconds (1 hour) typically
    const expiresAt = expiresIn 
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : new Date(Date.now() + 3600 * 1000).toISOString(); // Default 1 hour

    const { error } = await supabase
      .from('bitbucket_tokens')
      .upsert({
        user_id: userId,
        access_token: encryptOAuthToken(accessToken),
        refresh_token: encryptOAuthToken(refreshToken),
        expires_at: expiresAt,
        bitbucket_username: bitbucketUsername,
        bitbucket_user_id: bitbucketUserId,
        scopes: scopes,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('[Bitbucket Token Storage] Failed to store token:', error);
      return false;
    }

    console.log('[Bitbucket Token Storage] Successfully stored token for user:', userId);
    return true;
  } catch (error) {
    console.error('[Bitbucket Token Storage] Exception:', error);
    return false;
  }
}

/**
 * Deletes a Bitbucket token for a user
 * @param userId The user ID to delete the token for
 */
export async function deleteBitbucketToken(userId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    
    const { error } = await supabase
      .from('bitbucket_tokens')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('[Bitbucket Token Delete] Failed to delete token:', error);
      return false;
    }

    console.log('[Bitbucket Token Delete] Successfully deleted token for user:', userId);
    return true;
  } catch (error) {
    console.error('[Bitbucket Token Delete] Exception:', error);
    return false;
  }
}
