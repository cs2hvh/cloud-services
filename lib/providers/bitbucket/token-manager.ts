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
   * Get a valid Bitbucket access token for a user
   * Automatically refreshes if token is expired or expiring soon
   * Uses service client so it works without request context
   */
  async getToken(userId: string): Promise<string | null> {
    try {
      const supabase = await createServiceClient();

      // Get stored token from database
      const { data: tokenData, error } = await supabase
        .from('bitbucket_tokens')
        .select('access_token, refresh_token, expires_at, auth_source')
        .eq('user_id', userId)
        .single();

      if (error || !tokenData?.access_token) {
        console.log('[Bitbucket Token Manager] No stored token found for user:', userId);
        return null;
      }

      // Check if token has expired or will expire soon (within 5 minutes)
      const now = new Date();
      const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at) : null;
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

      // If no expiration set or token hasn't expired (with 5 min buffer), validate and return
      if (!expiresAt || expiresAt > fiveMinutesFromNow) {
        // Validate the token is still working
        const isValid = await this.validateToken(tokenData.access_token);
        if (isValid) {
          console.log('[Bitbucket Token Manager] Found valid stored token for user:', userId);
          return tokenData.access_token;
        }
        console.log('[Bitbucket Token Manager] Stored token failed validation, will try refresh');
      }

      // Token has expired or will expire soon or failed validation - try to refresh
      console.log('[Bitbucket Token Manager] Token expired/expiring, attempting refresh for user:', userId);
      console.log('[Bitbucket Token Manager] Token auth_source:', tokenData.auth_source || 'unknown (legacy)');

      // Check if this token came from Supabase Auth - we cannot refresh it with our credentials
      if (tokenData.auth_source === 'supabase') {
        console.log('[Bitbucket Token Manager] Token from Supabase Auth - cannot refresh with app credentials');
        console.log('[Bitbucket Token Manager] User should refresh their Supabase session or re-connect Bitbucket');
        // Delete the expired token - user needs to re-authenticate
        await supabase.from('bitbucket_tokens').delete().eq('user_id', userId);
        
        // Audit log: token expired
        const auditContext = createAuditContext('system', 'BitbucketTokenManager', crypto.randomUUID());
        await AuditLogService.create({
          user_id: userId,
          user_role: 'system',
          action: 'token_expired',
          service_type: 'auth',
          service_id: `bitbucket_token_${userId}`,
          service_name: 'Bitbucket OAuth Token',
          metadata: { reason: 'supabase_token_cannot_refresh', provider: 'bitbucket' },
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
          request_id: auditContext.requestId,
        });
        
        return null;
      }

      if (!tokenData.refresh_token) {
        console.log('[Bitbucket Token Manager] No refresh token available, user needs to re-authenticate');
        // Delete the expired token
        await supabase.from('bitbucket_tokens').delete().eq('user_id', userId);
        
        // Audit log: token expired
        const auditContext = createAuditContext('system', 'BitbucketTokenManager', crypto.randomUUID());
        await AuditLogService.create({
          user_id: userId,
          user_role: 'system',
          action: 'token_expired',
          service_type: 'auth',
          service_id: `bitbucket_token_${userId}`,
          service_name: 'Bitbucket OAuth Token',
          metadata: { reason: 'no_refresh_token', provider: 'bitbucket' },
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
          request_id: auditContext.requestId,
        });
        
        return null;
      }

      const refreshResult = await this.refreshToken(tokenData.refresh_token);

      if (!refreshResult.accessToken) {
        console.log('[Bitbucket Token Manager] Failed to refresh token, user needs to re-authenticate');
        // Delete the expired/invalid token
        await supabase.from('bitbucket_tokens').delete().eq('user_id', userId);
        
        // Audit log: token expired (refresh failed)
        const auditContext = createAuditContext('system', 'BitbucketTokenManager', crypto.randomUUID());
        await AuditLogService.create({
          user_id: userId,
          user_role: 'system',
          action: 'token_expired',
          service_type: 'auth',
          service_id: `bitbucket_token_${userId}`,
          service_name: 'Bitbucket OAuth Token',
          metadata: { reason: 'refresh_failed', provider: 'bitbucket' },
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
          request_id: auditContext.requestId,
        });
        
        return null;
      }

      // Update the stored token with new values
      const newExpiresAt = refreshResult.expiresIn
        ? new Date(Date.now() + refreshResult.expiresIn * 1000).toISOString()
        : null;

      const { error: updateError } = await supabase
        .from('bitbucket_tokens')
        .update({
          access_token: refreshResult.accessToken,
          refresh_token: refreshResult.refreshToken || tokenData.refresh_token,
          expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error('[Bitbucket Token Manager] Failed to update refreshed token:', updateError);
        // Still return the new token even if we couldn't save it
      } else {
        console.log('[Bitbucket Token Manager] Successfully refreshed and stored new token for user:', userId);
        
        // Audit log: token refreshed
        const auditContext = createAuditContext('system', 'BitbucketTokenManager', crypto.randomUUID());
        await AuditLogService.create({
          user_id: userId,
          user_role: 'system',
          action: 'token_refreshed',
          service_type: 'auth',
          service_id: `bitbucket_token_${userId}`,
          service_name: 'Bitbucket OAuth Token',
          metadata: { 
            provider: 'bitbucket',
            expires_at: newExpiresAt,
          },
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
          request_id: auditContext.requestId,
        });
      }

      return refreshResult.accessToken;
    } catch (error) {
      console.error('[Bitbucket Token Manager] Error getting token:', error);
      return null;
    }
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
            access_token: accessToken,
            refresh_token: refreshToken,
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
