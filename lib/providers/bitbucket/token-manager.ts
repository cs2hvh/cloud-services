/**
 * Bitbucket Token Manager
 * Handles getting, validating, refreshing, and storing Bitbucket OAuth tokens
 * 
 * IMPORTANT: Bitbucket tokens expire after 1-2 hours!
 * This manager handles automatic token refresh using the refresh_token.
 * 
 * Token sources (in order of preference):
 * 1. Database stored token with auto-refresh (bitbucket_tokens table)
 * 2. None - user needs to reconnect
 */

import { createServiceClient } from '@/lib/supabase/server';
import { AuditLogService, createAuditContext } from '@/lib/audit';
import { encryptOAuthToken } from '@/lib/security/token-crypto';
import { getValidBitbucketToken } from '@/lib/bitbucket/token-refresh';

interface BitbucketTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scopes: string;
}

export class BitbucketTokenManager {
  /**
   * Refresh Bitbucket OAuth token using the refresh token
   * Bitbucket tokens expire in ~1-2 hours and MUST be refreshed
   */
  async refreshToken(refreshToken: string): Promise<{
    accessToken: string | null;
    refreshToken: string | null;
    expiresIn: number | null;
  }> {
    try {
      const clientId = process.env.BITBUCKET_CLIENT_ID;
      const clientSecret = process.env.BITBUCKET_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        console.error('[Bitbucket Token Manager] Missing BITBUCKET_CLIENT_ID or BITBUCKET_CLIENT_SECRET');
        return { accessToken: null, refreshToken: null, expiresIn: null };
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
        console.error('[Bitbucket Token Manager] Refresh failed:', response.status, errorText);
        return { accessToken: null, refreshToken: null, expiresIn: null };
      }

      const data: BitbucketTokenResponse = await response.json();

      if (!data.access_token) {
        console.error('[Bitbucket Token Manager] No access_token in response');
        return { accessToken: null, refreshToken: null, expiresIn: null };
      }

      console.log('[Bitbucket Token Manager] Successfully refreshed token');
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || null,
        expiresIn: data.expires_in || 3600,
      };
    } catch (error) {
      console.error('[Bitbucket Token Manager] Refresh exception:', error);
      return { accessToken: null, refreshToken: null, expiresIn: null };
    }
  }

  /**
   * Get a valid Bitbucket access token for a user.
   * Delegates to the canonical getValidBitbucketToken function which is the
   * single source of truth for token refresh logic.
   */
  async getToken(userId: string): Promise<string | null> {
    return getValidBitbucketToken(userId);
  }

  /**
   * Validate a Bitbucket token by making a simple API call
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.bitbucket.org/2.0/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });

      return response.ok;
    } catch (error) {
      console.error('[Bitbucket Token Manager] Validation error:', error);
      return false;
    }
  }

  /**
   * Store Bitbucket token in database
   */
  async storeToken(
    userId: string,
    accessToken: string,
    refreshToken: string | null,
    expiresIn: number | null,
    bitbucketUsername: string,
    bitbucketUserId: string
  ): Promise<boolean> {
    try {
      const supabase = await createServiceClient();

      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString(); // Default 1 hour

      const { error } = await supabase
        .from('bitbucket_tokens')
        .upsert(
          {
            user_id: userId,
            access_token: encryptOAuthToken(accessToken),
            refresh_token: encryptOAuthToken(refreshToken),
            expires_at: expiresAt,
            bitbucket_username: bitbucketUsername,
            bitbucket_user_id: bitbucketUserId,
            scopes: 'repository account',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      if (error) {
        console.error('[Bitbucket Token Manager] Failed to store token:', error);
        return false;
      }

      console.log('[Bitbucket Token Manager] Token stored for user:', userId);
      return true;
    } catch (error) {
      console.error('[Bitbucket Token Manager] Store exception:', error);
      return false;
    }
  }

  /**
   * Delete Bitbucket token from database
   */
  async deleteToken(userId: string): Promise<boolean> {
    try {
      const supabase = await createServiceClient();

      const { error } = await supabase
        .from('bitbucket_tokens')
        .delete()
        .eq('user_id', userId);

      if (error) {
        console.error('[Bitbucket Token Manager] Failed to delete token:', error);
        return false;
      }

      console.log('[Bitbucket Token Manager] Token deleted for user:', userId);
      return true;
    } catch (error) {
      console.error('[Bitbucket Token Manager] Delete exception:', error);
      return false;
    }
  }

  /**
   * Check if user has a Bitbucket token stored (doesn't validate it)
   */
  async hasToken(userId: string): Promise<boolean> {
    try {
      const supabase = await createServiceClient();

      const { data, error } = await supabase
        .from('bitbucket_tokens')
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
export const bitbucketTokenManager = new BitbucketTokenManager();
