/**
 * GitHub Token Manager
 * Handles getting, validating, refreshing, and storing GitHub OAuth tokens
 * 
 * Token sources (in order of preference):
 * 1. Session provider_token (only immediately after OAuth)
 * 2. Database stored token (github_tokens table)
 * 3. None - user needs to reconnect
 */

import { createClient } from '@/lib/supabase/server';
import { AuthToken } from '../types';

export class GitHubTokenManager {
  /**
   * Get a valid GitHub access token for a user
   * GitHub OAuth tokens don't expire, but can be revoked by user
   */
  async getToken(userId: string): Promise<string | null> {
    try {
      const supabase = await createClient();

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

      console.log('[GitHub Token Manager] Found stored token for user:', userId);
      return tokenData.access_token;
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
  async storeToken(userId: string, token: string): Promise<boolean> {
    try {
      const supabase = await createClient();

      const { error } = await supabase
        .from('github_tokens')
        .upsert(
          {
            user_id: userId,
            access_token: token,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      if (error) {
        console.error('[GitHub Token Manager] Failed to store token:', error);
        return false;
      }

      console.log('[GitHub Token Manager] Token stored for user:', userId);
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
      const supabase = await createClient();

      const { error } = await supabase
        .from('github_tokens')
        .delete()
        .eq('user_id', userId);

      if (error) {
        console.error('[GitHub Token Manager] Failed to delete token:', error);
        return false;
      }

      console.log('[GitHub Token Manager] Token deleted for user:', userId);
      return true;
    } catch (error) {
      console.error('[GitHub Token Manager] Delete exception:', error);
      return false;
    }
  }
}

// Export singleton instance
export const githubTokenManager = new GitHubTokenManager();
