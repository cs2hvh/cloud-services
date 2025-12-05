/**
 * Webhook Manager Service
 * Handles registration and deletion of webhooks with Git providers
 */
import crypto from 'crypto';
import { getValidGitHubToken } from '@/lib/github/token-refresh';
import { Platform_App_Webhooks, Platform_Apps } from '@/lib/supabase/queries';
import type { WebhookRegistrationResult, GitProvider } from '@/lib/webhooks/types';

interface RegisterWebhookParams {
  app_id: string;
  provider: string;
  repository_name: string;
  access_token: string;
}

export class WebhookManager {
  /**
   * Generate a secure webhook secret
   */
  private static generateSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Get the webhook URL for a provider
   * Uses WEBHOOK_BASE_URL for ngrok/external access, falls back to DOMAIN
   */
  private static getWebhookUrl(provider: GitProvider): string {
    // Priority: WEBHOOK_BASE_URL > DOMAIN > NEXT_PUBLIC_DOMAIN
    const baseUrl = process.env.WEBHOOK_BASE_URL 
      || process.env.DOMAIN 
      || process.env.NEXT_PUBLIC_DOMAIN;
    
    if (!baseUrl) {
      throw new Error('WEBHOOK_BASE_URL or DOMAIN environment variable not configured');
    }
    return `${baseUrl}/api/webhooks/git/${provider}`;
  }

  /**
   * Universal webhook registration method
   * Dispatches to provider-specific registration methods
   */
  static async registerWebhook(params: RegisterWebhookParams): Promise<WebhookRegistrationResult> {
    const { app_id, provider, repository_name, access_token } = params;
    
    console.log(`[WebhookManager] registerWebhook called for provider: ${provider}, repo: ${repository_name}`);

    // Parse repository owner and name from full name (e.g., "owner/repo")
    const [repoOwner, repoName] = repository_name.split('/');
    if (!repoOwner || !repoName) {
      return {
        success: false,
        error: `Invalid repository name format: ${repository_name}. Expected "owner/repo"`,
      };
    }

    // Get app info to get user_id
    const appResult = await Platform_Apps.get(app_id);
    if (!appResult.success || !appResult.data) {
      return {
        success: false,
        error: 'App not found',
      };
    }

    const userId = appResult.data.user_id;

    if (provider === 'github') {
      return this.registerGitHubWebhookWithToken(
        app_id,
        userId,
        repoOwner,
        repoName,
        appResult.data.repository_id || '',
        access_token
      );
    } else if (provider === 'gitlab') {
      // TODO: Implement GitLab webhook registration
      console.log('[WebhookManager] GitLab webhook registration not yet implemented');
      return { success: false, error: 'GitLab webhooks not yet implemented' };
    } else if (provider === 'bitbucket') {
      // TODO: Implement Bitbucket webhook registration
      console.log('[WebhookManager] Bitbucket webhook registration not yet implemented');
      return { success: false, error: 'Bitbucket webhooks not yet implemented' };
    }

    return { success: false, error: `Unsupported provider: ${provider}` };
  }

  /**
   * Register a GitHub webhook with a provided token
   */
  static async registerGitHubWebhookWithToken(
    appId: string,
    userId: string,
    repoOwner: string,
    repoName: string,
    repoId: string,
    token: string
  ): Promise<WebhookRegistrationResult> {
    console.log(`[WebhookManager] Registering GitHub webhook for ${repoOwner}/${repoName}`);

    try {
      // Generate webhook secret
      const webhookSecret = this.generateSecret();
      const webhookUrl = this.getWebhookUrl('github');

      console.log(`[WebhookManager] Webhook URL: ${webhookUrl}`);

      // Check if webhook already exists
      const existingWebhooks = await this.listGitHubWebhooks(token, repoOwner, repoName);
      const existing = existingWebhooks.find(w => w.config?.url === webhookUrl);
      
      if (existing) {
        console.log(`[WebhookManager] Webhook already exists (ID: ${existing.id}), updating...`);
        await this.deleteGitHubWebhookById(token, repoOwner, repoName, existing.id);
      }

      // Create webhook on GitHub
      const response = await fetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}/hooks`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({
            name: 'web',
            active: true,
            events: ['push'],
            config: {
              url: webhookUrl,
              content_type: 'json',
              secret: webhookSecret,
              insecure_ssl: '0',
            },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[WebhookManager] GitHub API error:', errorData);
        
        if (response.status === 404) {
          return {
            success: false,
            error: 'Repository not found or insufficient permissions. Make sure you have admin access to the repository.',
          };
        }
        if (response.status === 422 && errorData.errors?.some((e: any) => e.message?.includes('already exists'))) {
          return {
            success: false,
            error: 'Webhook already exists for this repository.',
          };
        }
        
        return {
          success: false,
          error: errorData.message || `GitHub API error: ${response.status}`,
        };
      }

      const webhook = await response.json();
      console.log(`[WebhookManager] ✅ GitHub webhook created: ${webhook.id}`);

      // Store webhook config in database
      const dbResult = await Platform_App_Webhooks.create({
        app_id: appId,
        provider: 'github',
        webhook_id: webhook.id.toString(),
        webhook_secret: webhookSecret,
        webhook_url: webhookUrl,
        events: ['push'],
      });

      if (!dbResult.success) {
        console.error('[WebhookManager] Failed to store webhook in database:', dbResult.error);
        await this.deleteGitHubWebhookById(token, repoOwner, repoName, webhook.id);
        return {
          success: false,
          error: 'Failed to store webhook configuration',
        };
      }

      console.log(`[WebhookManager] ✅ Webhook registered and stored successfully for ${repoOwner}/${repoName}`);

      return {
        success: true,
        webhook_id: webhook.id.toString(),
      };

    } catch (error: any) {
      console.error('[WebhookManager] Error registering webhook:', error);
      return {
        success: false,
        error: error.message || 'Unknown error occurred',
      };
    }
  }

  /**
   * Register a GitHub webhook for an app (using user's stored token)
   */
  static async registerGitHubWebhook(
    appId: string,
    userId: string,
    repoOwner: string,
    repoName: string,
    repoId: string
  ): Promise<WebhookRegistrationResult> {
    // Get user's GitHub token
    const token = await getValidGitHubToken(userId);
    if (!token) {
      console.error('[WebhookManager] No GitHub token found for user:', userId);
      return {
        success: false,
        error: 'No GitHub token found. Please reconnect your GitHub account.',
      };
    }

    return this.registerGitHubWebhookWithToken(appId, userId, repoOwner, repoName, repoId, token);
  }

  /**
   * Delete a GitHub webhook
   */
  static async deleteGitHubWebhook(
    userId: string,
    repoOwner: string,
    repoName: string,
    appId: string
  ): Promise<boolean> {
    console.log(`[WebhookManager] Deleting GitHub webhook for ${repoOwner}/${repoName}`);

    try {
      // Get webhook info from database
      const webhookResult = await Platform_App_Webhooks.get_by_app(appId);
      if (!webhookResult.success || !webhookResult.data?.length) {
        console.log('[WebhookManager] No webhook found in database');
        return true; // Consider it success if no webhook exists
      }

      const webhookConfig = webhookResult.data.find((w: any) => w.provider === 'github');
      if (!webhookConfig) {
        console.log('[WebhookManager] No GitHub webhook found');
        return true;
      }

      // Get token
      const token = await getValidGitHubToken(userId);
      if (token) {
        // Delete from GitHub
        await this.deleteGitHubWebhookById(
          token,
          repoOwner,
          repoName,
          parseInt(webhookConfig.webhook_id)
        );
      }

      // Delete from database
      await Platform_App_Webhooks.delete(appId, 'github');

      console.log(`[WebhookManager] ✅ Webhook deleted for ${repoOwner}/${repoName}`);
      return true;

    } catch (error: any) {
      console.error('[WebhookManager] Error deleting webhook:', error);
      // Still try to delete from database
      await Platform_App_Webhooks.delete(appId, 'github').catch(() => {});
      return false;
    }
  }

  /**
   * Delete a GitHub webhook by ID
   */
  private static async deleteGitHubWebhookById(
    token: string,
    repoOwner: string,
    repoName: string,
    webhookId: number
  ): Promise<void> {
    const response = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/hooks/${webhookId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok && response.status !== 404) {
      console.error(`[WebhookManager] Failed to delete webhook ${webhookId}:`, response.status);
    }
  }

  /**
   * List GitHub webhooks for a repository
   */
  private static async listGitHubWebhooks(
    token: string,
    repoOwner: string,
    repoName: string
  ): Promise<any[]> {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}/hooks`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      );

      if (!response.ok) {
        console.log(`[WebhookManager] Failed to list webhooks: ${response.status}`);
        return [];
      }

      return await response.json();
    } catch (error) {
      console.error('[WebhookManager] Error listing webhooks:', error);
      return [];
    }
  }

  /**
   * Test a webhook by sending a ping
   */
  static async testGitHubWebhook(
    userId: string,
    repoOwner: string,
    repoName: string,
    webhookId: string
  ): Promise<boolean> {
    try {
      const token = await getValidGitHubToken(userId);
      if (!token) return false;

      const response = await fetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}/hooks/${webhookId}/pings`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      );

      return response.status === 204;
    } catch {
      return false;
    }
  }
}
