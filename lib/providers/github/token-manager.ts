/**
 * GitHub Token Manager
 * Handles getting, validating, refreshing, and storing GitHub OAuth tokens
 * 
 * Token sources (in order of preference):
 * 1. Session provider_token (only immediately after OAuth)
 * 2. Database stored token (github_tokens table)
 * 3. None - user needs to reconnect
 */

import { createServiceClient } from '@/lib/supabase/server';
import { decryptOAuthToken, encryptOAuthToken } from '@/lib/security/token-crypto';

// In-memory cache: tracks the last time a token was validated per user.
// Avoids an extra GitHub API call on every getToken() invocation — validation
// is re-run at most once per TOKEN_VALIDATION_TTL_MS (5 min).
const tokenValidatedAt = new Map<string, number>();
const TOKEN_VALIDATION_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class GitHubTokenManager {
  /**
   * Get a valid GitHub access token for a user
   * GitHub OAuth tokens don't expire, but can be revoked by user
   * Uses service client so it works without request context (e.g., webhooks)
   */
  async getToken(userId: string): Promise<string | null> {
    try {
      // Use service client for server-side operations without user context
      const supabase = await createServiceClient();

      // Check database stored token
      const { data: tokenData, error } = await supabase
        .from('github_tokens')
        .select('access_token')
        .eq('user_id', userId)
        .single();

      if (error || !tokenData?.access_token) {
        console.log('[GitHub Token Manager] No stored token found for user:', userId);
        return null;
      }

      const decryptedAccessToken = decryptOAuthToken(tokenData.access_token);
      if (!decryptedAccessToken) {
        console.log('[GitHub Token Manager] Stored token could not be decrypted for user:', userId);
        return null;
      }

      // Validate the token against GitHub to catch user revocations.
      // Guarded by a 5-minute TTL per user so we don't double every API call.
      const lastValidated = tokenValidatedAt.get(userId) ?? 0;
      if (Date.now() - lastValidated > TOKEN_VALIDATION_TTL_MS) {
        const valid = await this.validateToken(decryptedAccessToken);
        if (!valid) {
          console.warn('[GitHub Token Manager] Stored token rejected by GitHub (revoked?) — removing for user:', userId);
          tokenValidatedAt.delete(userId);
          await supabase.from('github_tokens').delete().eq('user_id', userId);
          return null;
        }
        tokenValidatedAt.set(userId, Date.now());
      }

      console.log('[GitHub Token Manager] Found valid stored token for user:', userId);
      return decryptedAccessToken;
    } catch (error) {
      console.error('[GitHub Token Manager] Error getting token:', error);
      return null;
    }
  }

  /**
   * Validate a GitHub token by making a simple API call
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        }
      });

      return response.ok;
    } catch (error) {
      console.error('[GitHub Token Manager] Validation error:', error);
      return false;
    }
  }



  /**
   * Store GitHub token in database
   */
  async storeToken(userId: string, token: string, meta?: { username?: string; githubUserId?: number }): Promise<boolean> {
    try {
      const supabase = await createServiceClient();

      const row: Record<string, unknown> = {
        user_id: userId,
        access_token: encryptOAuthToken(token),
        updated_at: new Date().toISOString(),
      };
      // Only update username/id if explicitly provided — prevents overwriting with null
      if (meta?.username) row.github_username = meta.username;
      if (meta?.githubUserId) row.github_user_id = meta.githubUserId;

      const { error } = await supabase
        .from('github_tokens')
        .upsert(row, { onConflict: 'user_id' });

      if (error) {
        console.error('[GitHub Token Manager] Failed to store token:', error);
        return false;
      }

      console.log('[GitHub Token Manager] Token stored for user:', userId);
      // A freshly stored token is valid — prime the cache so the next getToken()
      // doesn't immediately re-validate it.
      tokenValidatedAt.set(userId, Date.now());
      return true;
    } catch (error) {
      console.error('[GitHub Token Manager] Store exception:', error);
      return false;
    }
  }

  /**
   * Delete GitHub token from database
   */
  async deleteToken(userId: string): Promise<boolean> {
    try {
      const supabase = await createServiceClient();

      const { error } = await supabase
        .from('github_tokens')
        .delete()
        .eq('user_id', userId);

      if (error) {
        console.error('[GitHub Token Manager] Failed to delete token:', error);
        return false;
      }

      console.log('[GitHub Token Manager] Token deleted for user:', userId);
      tokenValidatedAt.delete(userId);
      return true;
    } catch (error) {
      console.error('[GitHub Token Manager] Delete exception:', error);
      return false;
    }
  }
}

// Export singleton instance
export const githubTokenManager = new GitHubTokenManager();
