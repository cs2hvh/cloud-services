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
 * Gets a valid GitHub access token for a user.
 * 
 * GitHub OAuth tokens (classic) from Supabase linkIdentity do NOT expire.
 * They remain valid until:
 * - User revokes access in GitHub settings
 * - User changes their GitHub password
 * - The OAuth app is deleted
 * 
 * @param userId The user ID to get token for
 * @returns A valid access token if available, null otherwise
 */
export async function getValidGitHubToken(userId: string): Promise<string | null> {
  try {
    const supabase = await createClient();
    
    // Get stored token from database
    const { data: tokenData, error } = await supabase
      .from('github_tokens')
      .select('access_token')
      .eq('user_id', userId)
      .single();

    if (error || !tokenData?.access_token) {
      console.log('[GitHub Token] No stored token found for user:', userId);
      return null;
    }

    // Return the token - it doesn't expire
    // If it's been revoked, the API call will fail with 401 and caller handles fallback
    console.log('[GitHub Token] Found stored token for user:', userId);
    return tokenData.access_token;
  } catch (error) {
    console.error('[GitHub Token] Error getting token:', error);
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