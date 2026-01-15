/**
 * Auto-Deploy Service
 * Handles webhook-triggered deployments with proper token refresh
 * 
 * This service ensures that:
 * 1. Access tokens are refreshed before deployment (especially for GitLab/Bitbucket)
 * 2. Jenkins job configuration is updated with fresh token
 * 3. Build status is properly tracked
 * 4. Duplicate webhook deliveries are handled (idempotency)
 */

import { JenkinsService } from './jenkins';
import { BuildPollingService } from './build-polling';
import { Platform_Apps } from '@/lib/supabase/queries';
import { GitHubProvider } from '@/lib/providers/github';
import { gitlabTokenManager } from '@/lib/providers/gitlab/token-manager';
import { bitbucketTokenManager } from '@/lib/providers/bitbucket/token-manager';
import { KubernetesInfoService } from './kubernetes-info';

export interface AutoDeployConfig {
  appId: string;
  appName: string;
  userId: string;
  gitProvider: 'github' | 'gitlab' | 'bitbucket';
  repositoryUrl: string;  // Clean URL without token
  branch: string;
  framework: string;
  size?: string;
  commitSha?: string;
  deliveryId?: string;  // For idempotency tracking
}

export interface AutoDeployResult {
  success: boolean;
  buildNumber?: number;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

// In-memory store for recent deliveries (prevents duplicate processing)
// In production, you might want to use Redis for this
const recentDeliveries = new Map<string, { timestamp: number; status: string }>();
const DELIVERY_TTL = 5 * 60 * 1000; // 5 minutes

export class AutoDeployService {
  /**
   * Main entry point for auto-deploy
   * Handles token refresh, job update, and build triggering
   */
  static async deploy(config: AutoDeployConfig): Promise<AutoDeployResult> {
    const { appId, appName, userId, gitProvider, repositoryUrl, branch, framework, size, commitSha, deliveryId } = config;

    console.log(`[AutoDeploy] Starting auto-deploy for ${appName}`);
    console.log(`[AutoDeploy] Provider: ${gitProvider}, Branch: ${branch}, Commit: ${commitSha?.substring(0, 7) || 'unknown'}`);

    try {
      // Best-effort: log current Kubernetes images (connectivity verification)
      KubernetesInfoService.logAppImages(appName, `auto-deploy-pre-build delivery=${deliveryId || 'n/a'}`)
        .catch(() => undefined);

      // Step 1: Check for duplicate delivery (idempotency)
      if (deliveryId) {
        const isDuplicate = this.checkDuplicateDelivery(deliveryId);
        if (isDuplicate) {
          console.log(`[AutoDeploy] Duplicate delivery detected: ${deliveryId}`);
          return {
            success: true,
            skipped: true,
            skipReason: 'Duplicate webhook delivery',
          };
        }
        // Mark this delivery as being processed
        this.markDeliveryInProgress(deliveryId);
      }

      // Step 2: Get fresh access token for private repository access
      console.log(`[AutoDeploy] Step 1/4: Refreshing access token...`);
      const accessToken = await this.getAccessToken(userId, gitProvider);
      
      if (!accessToken) {
        console.warn(`[AutoDeploy] ⚠️ No access token available - proceeding with public repo assumption`);
      }

      // Step 3: Build authenticated URL
      const authenticatedUrl = accessToken 
        ? this.buildAuthenticatedUrl(repositoryUrl, accessToken, gitProvider)
        : repositoryUrl;
      
      console.log(`[AutoDeploy] Step 2/4: Token ${accessToken ? '✅ injected' : '⚠️ not available'}`);

      // Fetch environment variables for the app
      const envVarsData = await Platform_Apps.get_env_vars(appId);
      const envVars = envVarsData.map((ev: { key: string; value: string }) => ({ 
        key: ev.key, 
        value: ev.value 
      }));
      
      console.log(`[AutoDeploy] Found ${envVars.length} environment variables`);

      // Step 4: Update Jenkins job configuration with fresh token
      console.log(`[AutoDeploy] Step 3/4: Updating Jenkins job config...`);
      try {
        await JenkinsService.updateJobConfig(
          appName,
          appId,
          authenticatedUrl,
          branch,
          framework,
          size || 'small',
          'webhook',
          envVars
        );
        console.log(`[AutoDeploy] ✅ Jenkins job config updated`);
      } catch (updateError: unknown) {
        // If job doesn't exist, this is a problem
        const errorMessage = updateError instanceof Error ? updateError.message : 'Unknown error';
        console.error(`[AutoDeploy] Failed to update job config:`, errorMessage);
        throw new Error(`Failed to update Jenkins job: ${errorMessage}`);
      }

      // Step 5: Trigger the build with specific commit SHA
      // This ensures the exact commit from the webhook is deployed, not branch HEAD
      console.log(`[AutoDeploy] Step 4/4: Triggering build...`);
      const buildNumber = await JenkinsService.triggerBuild(appName, commitSha);
      console.log(`[AutoDeploy] ✅ Build #${buildNumber} triggered for commit ${commitSha?.substring(0, 7) || 'HEAD'}`);

      // Step 6: Update app status in database
      await Platform_Apps.update(appId, {
        status: 'building',
        last_deploy_trigger: 'webhook',
        last_deploy_commit: commitSha || null,
      });

      // Step 7: Start build status polling (async, don't await)
      BuildPollingService.startPolling({
        appId,
        appName,
        buildNumber,
        trigger: 'webhook',
      });

      // Mark delivery as successful
      if (deliveryId) {
        this.markDeliveryComplete(deliveryId, 'success');
      }

      console.log(`[AutoDeploy] ✅ Auto-deploy initiated successfully`);
      console.log(`[AutoDeploy] Monitor at: ${process.env.JENKINS_URL}/job/${appName}-job/${buildNumber}/`);

      return {
        success: true,
        buildNumber,
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[AutoDeploy] ❌ Auto-deploy failed:`, errorMessage);
      
      // Mark delivery as failed
      if (deliveryId) {
        this.markDeliveryComplete(deliveryId, 'failed');
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get fresh access token for the specified provider
   * Uses the new token managers which handle auto-refresh
   */
  private static async getAccessToken(
    userId: string, 
    provider: 'github' | 'gitlab' | 'bitbucket'
  ): Promise<string | null> {
    try {
      if (provider === 'github') {
        const githubProvider = new GitHubProvider();
        const tokenObj = await githubProvider.getToken(userId);
        return tokenObj?.accessToken || null;
      }

      if (provider === 'gitlab') {
        // Use the new token manager with auto-refresh (returns string directly)
        const token = await gitlabTokenManager.getToken(userId);
        if (!token) {
          console.warn(`[AutoDeploy] No GitLab token found for user ${userId}`);
          return null;
        }
        return token;
      }

      if (provider === 'bitbucket') {
        // Use the new token manager with auto-refresh (returns string directly)
        const token = await bitbucketTokenManager.getToken(userId);
        if (!token) {
          console.warn(`[AutoDeploy] No Bitbucket token found for user ${userId}`);
          return null;
        }
        return token;
      }

      return null;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[AutoDeploy] Error getting ${provider} token:`, errorMessage);
      return null;
    }
  }

  /**
   * Build authenticated URL with token for private repo access
   * Each provider has different URL format requirements
   */
  private static buildAuthenticatedUrl(
    url: string, 
    token: string, 
    provider: 'github' | 'gitlab' | 'bitbucket'
  ): string {
    switch (provider) {
      case 'github':
        // GitHub: https://<token>@github.com/owner/repo.git
        return url.replace(
          /https:\/\/(www\.)?github\.com\//,
          `https://${token}@github.com/`
        );

      case 'gitlab':
        // GitLab: https://oauth2:<token>@gitlab.com/owner/repo.git
        return url.replace(
          /https:\/\/(www\.)?gitlab\.com\//,
          `https://oauth2:${token}@gitlab.com/`
        );

      case 'bitbucket':
        // Bitbucket: https://x-token-auth:<token>@bitbucket.org/workspace/repo.git
        return url.replace(
          /https:\/\/(www\.)?bitbucket\.org\//,
          `https://x-token-auth:${token}@bitbucket.org/`
        );

      default:
        return url;
    }
  }

  /**
   * Check if this delivery was already processed (idempotency)
   */
  private static checkDuplicateDelivery(deliveryId: string): boolean {
    this.cleanupOldDeliveries();
    
    const existing = recentDeliveries.get(deliveryId);
    if (existing && existing.status !== 'failed') {
      // If it's in progress or completed successfully, it's a duplicate
      return true;
    }
    return false;
  }

  /**
   * Mark a delivery as in-progress
   */
  private static markDeliveryInProgress(deliveryId: string): void {
    recentDeliveries.set(deliveryId, {
      timestamp: Date.now(),
      status: 'in-progress',
    });
  }

  /**
   * Mark a delivery as complete
   */
  private static markDeliveryComplete(deliveryId: string, status: 'success' | 'failed'): void {
    recentDeliveries.set(deliveryId, {
      timestamp: Date.now(),
      status,
    });
  }

  /**
   * Clean up old delivery records
   */
  private static cleanupOldDeliveries(): void {
    const now = Date.now();
    for (const [id, data] of recentDeliveries.entries()) {
      if (now - data.timestamp > DELIVERY_TTL) {
        recentDeliveries.delete(id);
      }
    }
  }
}
