import { createClient } from "@/lib/supabase/server";

/**
 * Refreshes a GitHub OAuth token using the refresh token
 * @param refreshToken The refresh token to use for refreshing the access token
 * @returns The new access token if successful, null otherwise
 */
export async function refreshGitHubToken(refreshToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      console.error('[GitHub Token Refresh] Failed to refresh token:', response.status);
      return null;
    }

    const tokenData = await response.json();
    
    if (tokenData.error) {
      console.error('[GitHub Token Refresh] Error:', tokenData.error);
      return null;
    }

    return tokenData.access_token || null;
  } catch (error) {
    console.error('[GitHub Token Refresh] Exception:', error);
    return null;
  }
}

/**
 * Gets a valid GitHub access token for a user, attempting to refresh if needed
 * @param userId The user ID to get token for
 * @returns A valid access token if available, null otherwise
 */
export async function getValidGitHubToken(userId: string): Promise<string | null> {
  try {
    const supabase = await createClient();
    
    // Get stored token data
    const { data: tokenData, error } = await supabase
      .from('github_tokens')
      .select('access_token, refresh_token, expires_at, updated_at')
      .eq('user_id', userId)
      .single();

    if (error || !tokenData) {
      console.log('[GitHub Token] No stored token found for user:', userId);
      return null;
    }

    // Check if token has expiration info and is expired
    const now = new Date().getTime();
    
    // If we have explicit expiration time and it's in the past
    if (tokenData.expires_at) {
      const expiresAt = new Date(tokenData.expires_at).getTime();
      if (expiresAt < now) {
        console.log('[GitHub Token] Token expired, attempting refresh');
        // Try to refresh if we have a refresh token
        if (tokenData.refresh_token) {
          const newToken = await refreshGitHubToken(tokenData.refresh_token);
          if (newToken) {
            // Update the stored token
            const { error: updateError } = await supabase
              .from('github_tokens')
              .update({
                access_token: newToken,
                updated_at: new Date().toISOString(),
                // GitHub tokens typically expire in 8 hours (28800 seconds)
                expires_at: new Date(now + 8 * 60 * 60 * 1000).toISOString()
              })
              .eq('user_id', userId);

            if (updateError) {
              console.error('[GitHub Token] Failed to update refreshed token:', updateError);
            } else {
              console.log('[GitHub Token] Successfully refreshed and updated token');
            }
            
            return newToken;
          } else {
            console.log('[GitHub Token] Failed to refresh expired token');
            return null;
          }
        } else {
          console.log('[GitHub Token] Token expired but no refresh token available');
          return null;
        }
      }
    }
    
    // Check if token hasn't been updated in more than 7 days (conservative approach)
    // This handles cases where we don't have explicit expiration info
    const updatedAt = new Date(tokenData.updated_at).getTime();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    
    if (updatedAt < sevenDaysAgo) {
      console.log('[GitHub Token] Token may be stale (> 7 days old), attempting refresh');
      // Try to refresh if we have a refresh token
      if (tokenData.refresh_token) {
        const newToken = await refreshGitHubToken(tokenData.refresh_token);
        if (newToken) {
          // Update the stored token
          const { error: updateError } = await supabase
            .from('github_tokens')
            .update({
              access_token: newToken,
              updated_at: new Date().toISOString(),
              expires_at: new Date(now + 8 * 60 * 60 * 1000).toISOString()
            })
            .eq('user_id', userId);

          if (updateError) {
            console.error('[GitHub Token] Failed to update refreshed token:', updateError);
          } else {
            console.log('[GitHub Token] Successfully refreshed and updated stale token');
          }
          
          return newToken;
        } else {
          console.log('[GitHub Token] Failed to refresh stale token');
        }
      }
    }
    
    // Token seems valid, return it
    return tokenData.access_token;
  } catch (error) {
    console.error('[GitHub Token] Error getting valid token:', error);
    return null;
  }
}

/**
 * Validates a GitHub token by making a simple API call
 * @param token The token to validate
 * @returns True if token is valid, false otherwise
 */
export async function validateGitHubToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      }
    });
    
    return response.ok;
  } catch (error) {
    console.error('[GitHub Token Validation] Error:', error);
    return false;
  }
}