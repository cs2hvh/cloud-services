/**
 * Webhook Manager Service
 * Handles registration and deletion of webhooks with Git providers
 */
import crypto from 'crypto';
import { GENERIC_SERVICE_ERROR } from "@/lib/api/error-sanitizer";
import { GitHubProvider } from '@/lib/providers/github';
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
    // Use WEBHOOK_BASE_URL in dev (e.g. ngrok), falls back to DOMAIN in prod
    const baseUrl =  process.env.DOMAIN || process.env.WEBHOOK_BASE_URL;
    
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

    if (provider === 'github') {
      return this.registerGitHubWebhookWithToken(
        app_id,
        appResult.data.user_id,
        repoOwner,
        repoName,
        appResult.data.repository_id || '',
        access_token
      );
    } else if (provider === 'gitlab') {
      return this.registerGitLabWebhookWithToken(
        app_id,
        repoOwner,
        repoName,
        appResult.data.repository_id || '',
        access_token
      );
    } else if (provider === 'bitbucket') {
      return this.registerBitbucketWebhookWithToken(
        app_id,
        appResult.data.user_id,
        repoOwner,
        repoName,
        appResult.data.repository_id || '',
        access_token
      );
    }

    return { success: false, error: `Unsupported provider: ${provider}` };
  }

  /**
   * Register a GitHub webhook with a provided token
   * 
   * IMPORTANT: This method ensures GitHub and our database have the SAME secret.
   * 
   * Flow:
   * 1. Check if we already have a webhook in our database for this app
   * 2. If yes, re-use the existing secret (ensures consistency)
   * 3. Clean up ALL existing webhooks on GitHub for this repo (not just URL match)
   * 4. Create new webhook on GitHub with the secret
   * 5. Update/create webhook record in database
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
      const webhookUrl = this.getWebhookUrl('github');
      console.log(`[WebhookManager] Webhook URL: ${webhookUrl}`);

      // Step 1: Check if we already have a webhook record for this app
      const existingDbWebhook = await Platform_App_Webhooks.get_by_app(appId);
      const existingGitHubRecord = existingDbWebhook.data?.find((w: { provider: string }) => w.provider === 'github');
      
      // Step 2: Decide on the secret - re-use existing or generate new
      let webhookSecret: string;
      if (existingGitHubRecord?.webhook_secret) {
        console.log(`[WebhookManager] Re-using existing webhook secret for app: ${appId}`);
        webhookSecret = existingGitHubRecord.webhook_secret;
      } else {
        console.log(`[WebhookManager] Generating new webhook secret for app: ${appId}`);
        webhookSecret = this.generateSecret();
      }

      // Step 3: Clean up ALL existing webhooks on GitHub that point to our webhook endpoints
      // This handles cases where ngrok URL changed, multiple webhooks exist, etc.
      const existingGitHubWebhooks = await this.listGitHubWebhooks(token, repoOwner, repoName);
      const ourWebhookPattern = '/api/webhooks/git/github';
      
      for (const hook of existingGitHubWebhooks) {
        if (hook.config?.url?.includes(ourWebhookPattern)) {
          console.log(`[WebhookManager] Deleting existing webhook ID: ${hook.id}, URL: ${hook.config.url}`);
          await this.deleteGitHubWebhookById(token, repoOwner, repoName, hook.id);
        }
      }

      // Step 4: Create webhook on GitHub with the secret
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
        if (response.status === 422 && errorData.errors?.some((e: { message?: string }) => e.message?.includes('already exists'))) {
          return {
            success: false,
            error: 'Webhook already exists for this repository.',
          };
        }
        
        return {
          success: false,
          error: GENERIC_SERVICE_ERROR,
        };
      }

      const webhook = await response.json();
      console.log(`[WebhookManager] ✅ GitHub webhook created: ${webhook.id}`);

      // Step 5: Store/update webhook config in database using upsert
      // This ensures we always have exactly ONE webhook record per app+provider
      const dbResult = await Platform_App_Webhooks.upsert({
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

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('[WebhookManager] Error registering webhook:', error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  static async registerGitLabWebhookWithToken(
    appId: string,
    repoOwner: string,
    repoName: string,
    repoId: string,
    token: string
  ): Promise<WebhookRegistrationResult> {
    console.log(`[WebhookManager] Registering GitLab webhook for ${repoOwner}/${repoName}`);

    try {
      const webhookSecret = this.generateSecret();
      const webhookUrl = this.getWebhookUrl('gitlab');

      const projectPath = encodeURIComponent(`${repoOwner}/${repoName}`);

      // List existing hooks and remove any pointing to our URL
      try {
        const listRes = await fetch(
          `https://gitlab.com/api/v4/projects/${projectPath}/hooks`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (listRes.ok) {
          const existingHooks: { id: number; url: string }[] = await listRes.json();
          const duplicates = existingHooks.filter((h) => h.url === webhookUrl);
          for (const hook of duplicates) {
            await fetch(
              `https://gitlab.com/api/v4/projects/${projectPath}/hooks/${hook.id}`,
              {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            ).catch((err) => {
              console.warn('[WebhookManager] Failed to delete existing GitLab hook:', err);
            });
          }
        } else {
          console.warn(
            '[WebhookManager] Failed to list GitLab hooks before create:',
            listRes.status
          );
        }
      } catch (err) {
        console.warn('[WebhookManager] Error while listing GitLab hooks:', err);
      }

      // Create new webhook for push events
      const createRes = await fetch(
        `https://gitlab.com/api/v4/projects/${projectPath}/hooks`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            url: webhookUrl,
            push_events: true,
            token: webhookSecret,
            enable_ssl_verification: true,
          }),
        }
      );

      if (!createRes.ok) {
        const errorText = await createRes.text();
        console.error('[WebhookManager] Failed to create GitLab webhook', errorText);
        return {
          success: false,
          error: `Failed to create GitLab webhook: ${errorText}`,
        };
      }

      const data: { id: number } = await createRes.json();

      const dbResult = await Platform_App_Webhooks.create({
        app_id: appId,
        provider: 'gitlab',
        webhook_id: String(data.id),
        webhook_secret: webhookSecret,
        webhook_url: webhookUrl,
        events: ['push'],
      });

      if (!dbResult.success) {
        console.error(
          '[WebhookManager] Failed to store GitLab webhook in database:',
          dbResult.error
        );
        // Best effort: try to delete the created webhook from GitLab
        await fetch(
          `https://gitlab.com/api/v4/projects/${projectPath}/hooks/${data.id}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        ).catch((err) => {
          console.warn(
            '[WebhookManager] Failed to cleanup GitLab webhook after DB error:',
            err
          );
        });

        return {
          success: false,
          error: 'Failed to store webhook configuration',
        };
      }

      console.log(
        `[WebhookManager] GitLab webhook registered and stored successfully for ${repoOwner}/${repoName}`
      );

      return {
        success: true,
        webhook_id: String(data.id),
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('[WebhookManager] Error registering GitLab webhook:', error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Register a Bitbucket webhook with a provided token
   * Uses Bitbucket Cloud API:
   *   POST https://api.bitbucket.org/2.0/repositories/{workspace}/{repo_slug}/hooks
   * Payload:
   *   { url, active: true, events: ["repo:push"], description?, secret? }
   */
  static async registerBitbucketWebhookWithToken(
    appId: string,
    userId: string,
    workspace: string,
    repoSlug: string,
    repoId: string,
    token: string
  ): Promise<WebhookRegistrationResult> {
    console.log(`[WebhookManager] Registering Bitbucket webhook for ${workspace}/${repoSlug}`);

    try {
      const webhookSecret = this.generateSecret();
      const webhookUrl = this.getWebhookUrl('bitbucket');

      console.log(`[WebhookManager] Bitbucket webhook URL: ${webhookUrl}`);

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };

      // Check if a webhook with the same URL already exists
      try {
        const existingResp = await fetch(
          `https://api.bitbucket.org/2.0/repositories/${workspace}/${repoSlug}/hooks`,
          { headers }
        );

        if (existingResp.ok) {
          const existingData: { values?: { uuid: string; url: string }[] } = await existingResp.json();
          const hooks = existingData.values || [];
          const existing = hooks.find((h: { uuid: string; url: string }) => h.url === webhookUrl);

          if (existing && existing.uuid) {
            console.log(
              `[WebhookManager] Bitbucket webhook already exists (UUID: ${existing.uuid}), deleting before re-creating...`
            );
            await fetch(
              `https://api.bitbucket.org/2.0/repositories/${workspace}/${repoSlug}/hooks/${encodeURIComponent(
                existing.uuid
              )}`,
              { method: 'DELETE', headers }
            ).catch((err) => {
              console.warn('[WebhookManager] Failed to delete existing Bitbucket webhook:', err);
            });
          }
        } else {
          console.warn(
            '[WebhookManager] Failed to list Bitbucket webhooks before create:',
            existingResp.status
          );
        }
      } catch (err) {
        console.warn('[WebhookManager] Error while listing Bitbucket webhooks:', err);
      }

      // Create webhook on Bitbucket
      const createResp = await fetch(
        `https://api.bitbucket.org/2.0/repositories/${workspace}/${repoSlug}/hooks`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            description: `AhuraSense auto-deploy for app ${appId}`,
            url: webhookUrl,
            active: true,
            events: ['repo:push'],
            // Bitbucket supports an optional secret used for HMAC signatures on payloads
            secret: webhookSecret,
          }),
        }
      );

      if (!createResp.ok) {
        let errorMessage = `Bitbucket API error: ${createResp.status}`;
        try {
          const errorData = await createResp.json();
          console.error('[WebhookManager] Bitbucket API error:', errorData);
          errorMessage = errorData.error?.message || errorData.message || errorMessage;
        } catch {
          console.error('[WebhookManager] Bitbucket API error (non-JSON response)');
        }

        return {
          success: false,
          error: errorMessage,
        };
      }

      const hook: { uuid?: string; id?: number } = await createResp.json();
      const webhookId: string = hook.uuid || hook.id?.toString() || '';

      if (!webhookId) {
        console.warn('[WebhookManager] Bitbucket webhook created but no ID returned');
      } else {
        console.log(`[WebhookManager] ✅ Bitbucket webhook created: ${webhookId}`);
      }

      // Store webhook config in database
      const dbResult = await Platform_App_Webhooks.create({
        app_id: appId,
        provider: 'bitbucket',
        webhook_id: webhookId,
        webhook_secret: webhookSecret,
        webhook_url: webhookUrl,
        events: ['repo:push'],
      });

      if (!dbResult.success) {
        console.error('[WebhookManager] Failed to store Bitbucket webhook in database:', dbResult.error);
        // Best effort: try to delete the created webhook from Bitbucket
        if (webhookId) {
          await fetch(
            `https://api.bitbucket.org/2.0/repositories/${workspace}/${repoSlug}/hooks/${encodeURIComponent(
              webhookId
            )}`,
            { method: 'DELETE', headers }
          ).catch((err) => {
            console.warn('[WebhookManager] Failed to cleanup Bitbucket webhook after DB error:', err);
          });
        }

        return {
          success: false,
          error: 'Failed to store webhook configuration',
        };
      }

      console.log(
        `[WebhookManager] ✅ Bitbucket webhook registered and stored successfully for ${workspace}/${repoSlug}`
      );

      return {
        success: true,
        webhook_id: webhookId,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('[WebhookManager] Error registering Bitbucket webhook:', error);
      return {
        success: false,
        error: errorMessage,
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
    const githubProvider = new GitHubProvider();
    const tokenObj = await githubProvider.getToken(userId);
    const token = tokenObj?.accessToken;
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

      const webhookConfig = webhookResult.data.find((w: { provider: string }) => w.provider === 'github');
      if (!webhookConfig) {
        console.log('[WebhookManager] No GitHub webhook found');
        return true;
      }

      // Get token
      const githubProvider = new GitHubProvider();
      const tokenObj = await githubProvider.getToken(userId);
      const token = tokenObj?.accessToken;
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

    } catch (error: unknown) {
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
  ): Promise<{ id: number; config?: { url?: string } }[]> {
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
      const githubProvider = new GitHubProvider();
      const tokenObj = await githubProvider.getToken(userId);
      const token = tokenObj?.accessToken;
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
