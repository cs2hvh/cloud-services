/**
 * GitLab Token Manager
 * Handles getting, validating, refreshing, and storing GitLab OAuth tokens
 * 
 * IMPORTANT: GitLab tokens expire after 2 hours (7200 seconds)!
 * This manager handles automatic token refresh using the refresh_token.
 * 
 * Token sources (in order of preference):
 * 1. Database stored token with auto-refresh (gitlab_tokens table)
 * 2. None - user needs to reconnect
 * 
 * NOTE: Unlike GitHub, we do NOT use session.provider_token as it may be expired
 */

import { createServiceClient } from '@/lib/supabase/server';
// import { AuditLogService, createAuditContext } from '@/lib/audit';
import { encryptOAuthToken } from '@/lib/security/token-crypto';
import { getValidGitLabToken } from '@/lib/gitlab/token-refresh';

interface GitLabTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  created_at: number;
  scope: string;
}

export class GitLabTokenManager {
  /**
   * Refresh GitLab OAuth token using the refresh token
   * GitLab tokens expire in 2 hours and MUST be refreshed
   */
  async refreshToken(refreshToken: string): Promise<{
    accessToken: string | null;
    refreshToken: string | null;
    expiresIn: number | null;
  }> {
    try {
      const clientId = process.env.GITLAB_CLIENT_ID;
      const clientSecret = process.env.GITLAB_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        console.error('[GitLab Token Manager] Missing GITLAB_CLIENT_ID or GITLAB_CLIENT_SECRET');
        return { accessToken: null, refreshToken: null, expiresIn: null };
      }

      // GitLab requires redirect_uri to match the original authorization request
      // IMPORTANT: Must match the redirect_uri used in /api/gitlab/callback/route.ts
      const redirectUri = `${process.env.DOMAIN}/api/gitlab/callback`;

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
        console.error('[GitLab Token Manager] Refresh failed:', response.status, errorText);
        return { accessToken: null, refreshToken: null, expiresIn: null };
      }

      const data: GitLabTokenResponse = await response.json();

      if (!data.access_token) {
        console.error('[GitLab Token Manager] No access_token in response');
        return { accessToken: null, refreshToken: null, expiresIn: null };
      }

      console.log('[GitLab Token Manager] Successfully refreshed token');
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || null,
        expiresIn: data.expires_in || 7200,
      };
    } catch (error) {
      console.error('[GitLab Token Manager] Refresh exception:', error);
      return { accessToken: null, refreshToken: null, expiresIn: null };
    }
  }

  /**
   * Get a valid GitLab access token for a user.
   * Delegates to the canonical getValidGitLabToken function which is the
   * single source of truth for token refresh logic.
   */
  async getToken(userId: string): Promise<string | null> {
    return getValidGitLabToken(userId);
  }

  /**
   * Validate a GitLab token by making a simple API call
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      const response = await fetch('https://gitlab.com/api/v4/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });

      return response.ok;
    } catch (error) {
      console.error('[GitLab Token Manager] Validation error:', error);
      return false;
    }
  }

  /**
   * Store GitLab token in database
   */
  async storeToken(
    userId: string,
    accessToken: string,
    refreshToken: string | null,
    expiresIn: number | null,
    gitlabUsername: string,
    gitlabUserId: number
  ): Promise<boolean> {
    try {
      const supabase = await createServiceClient();

      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : new Date(Date.now() + 7200 * 1000).toISOString(); // Default 2 hours

      const { error } = await supabase
        .from('gitlab_tokens')
        .upsert(
          {
            user_id: userId,
            access_token: encryptOAuthToken(accessToken),
            refresh_token: encryptOAuthToken(refreshToken),
            expires_at: expiresAt,
            gitlab_username: gitlabUsername,
            gitlab_user_id: gitlabUserId,
            scopes: 'api read_user',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      if (error) {
        console.error('[GitLab Token Manager] Failed to store token:', error);
        return false;
      }

      console.log('[GitLab Token Manager] Token stored for user:', userId);
      return true;
    } catch (error) {
      console.error('[GitLab Token Manager] Store exception:', error);
      return false;
    }
  }

  /**
   * Delete GitLab token from database
   */
  async deleteToken(userId: string): Promise<boolean> {
    try {
      const supabase = await createServiceClient();

      const { error } = await supabase
        .from('gitlab_tokens')
        .delete()
        .eq('user_id', userId);

      if (error) {
        console.error('[GitLab Token Manager] Failed to delete token:', error);
        return false;
      }

      console.log('[GitLab Token Manager] Token deleted for user:', userId);
      return true;
    } catch (error) {
      console.error('[GitLab Token Manager] Delete exception:', error);
      return false;
    }
  }

  /**
   * Check if user has a GitLab token stored (doesn't validate it)
   */
  async hasToken(userId: string): Promise<boolean> {
    try {
      const supabase = await createServiceClient();

      const { data, error } = await supabase
        .from('gitlab_tokens')
        .select('id')
        .eq('user_id', userId)
        .single();

      return !error && !!data;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const gitlabTokenManager = new GitLabTokenManager();
