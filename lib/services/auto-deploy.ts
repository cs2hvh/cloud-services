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
import { reconcileRuntimeEnv } from '@/lib/services/runtime-env-reconciler';
import {
  AppReleaseBuildService,
  JenkinsBuildAdapter,
  resolveBuildBackedOperationState,
} from '@/lib/app-operations';

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
  warning?: string;
  skipped?: boolean;
  skipReason?: string;
}

export class AutoDeployService {
  /**
   * Main entry point for auto-deploy
   * Handles token refresh, job update, and build triggering
   */
  static async deploy(config: AutoDeployConfig): Promise<AutoDeployResult> {
    const { appId, appName, userId, gitProvider, repositoryUrl, branch, framework, size, commitSha, deliveryId } = config;
    const idempotencyKey = `auto-deploy:${appId}:${branch}:${commitSha || 'HEAD'}:${deliveryId || 'no-delivery'}`;

    console.log(`[AutoDeploy] Starting auto-deploy for ${appName}`);
    console.log(`[AutoDeploy] Provider: ${gitProvider}, Branch: ${branch}, Commit: ${commitSha?.substring(0, 7) || 'unknown'}`);

    try {
      // Best-effort: log current Kubernetes images (connectivity verification)
      KubernetesInfoService.logAppImages(appName, `auto-deploy-pre-build delivery=${deliveryId || 'n/a'}`)
        .catch(() => undefined);

      // Step 1: Get fresh access token for private repository access
      console.log(`[AutoDeploy] Step 1/4: Refreshing access token...`);
      const accessToken = await this.getAccessToken(userId, gitProvider);
      
      if (!accessToken) {
        console.warn(`[AutoDeploy] ⚠️ No access token available - proceeding with public repo assumption`);
      }

      // Step 2: Build authenticated URL
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

      const appRecord = await Platform_Apps.get(appId);
      const appStatus = appRecord.success && appRecord.data ? appRecord.data.status : null;

      const releaseBuildService = new AppReleaseBuildService();
      const jenkins = new JenkinsBuildAdapter();
      const operation = await releaseBuildService.startReleaseBuild({
        appId,
        appName,
        appStatus,
        trigger: 'webhook',
        operationType: 'deploy',
        commitSha: commitSha || null,
        idempotencyKey,
        onBeforeTrigger: async () => {
          const runtimeSync = await reconcileRuntimeEnv({
            appName,
            framework: framework ?? null,
            envVars,
            policy: 'strict',
            action: 'secret_only',
            // Keep existing runtime secret until the deployment pipeline applies the new manifest.
            // This avoids transient failures if current pods still reference the secret.
            cleanupWhenEmpty: false,
            retryCount: 3,
            retryDelayMs: 1000,
            timeoutMs: 8000,
          });
          if (runtimeSync.status === 'failed') {
            throw new Error(runtimeSync.error || runtimeSync.reason);
          }
        },
        executor: async () => {
          console.log(`[AutoDeploy] Step 3/4: Updating Jenkins job config...`);
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

          console.log(`[AutoDeploy] Step 4/4: Triggering build...`);
          const execution = await jenkins.triggerBuild({
            appName,
            commitSha,
            gitAuthUrl: authenticatedUrl,
          });
          console.log(
            `[AutoDeploy] ✅ Build #${execution.buildNumber} triggered for commit ${commitSha?.substring(0, 7) || 'HEAD'}`
          );
          return {
            buildNumber: execution.buildNumber,
            executor: {
              type: 'jenkins' as const,
              job_name: execution.jobName,
              run_number: execution.buildNumber,
              url: execution.url,
            },
          };
        },
      });

      const resolvedOperation = resolveBuildBackedOperationState({
        result: operation,
        actionLabel: 'Auto-deploy',
      });

      if (resolvedOperation.kind === 'failed') {
        return {
          success: false,
          error: resolvedOperation.message,
        };
      }

      if (resolvedOperation.kind === 'invalid') {
        return {
          success: false,
          error: resolvedOperation.message,
        };
      }

      if (resolvedOperation.kind === 'pending') {
        return {
          success: true,
          skipped: true,
          skipReason: operation.reused
            ? 'Duplicate webhook delivery already being processed'
            : resolvedOperation.message,
        };
      }

      const buildNumber = resolvedOperation.buildNumber;
      let trackingWarning: string | undefined;
      if (buildNumber) {
        try {
          BuildPollingService.startPolling({
            appId,
            appName,
            buildNumber,
            trigger: 'webhook',
          });
        } catch (trackingError: unknown) {
          trackingWarning = trackingError instanceof Error ? trackingError.message : 'Unknown tracking error';
          console.warn(`[AutoDeploy] Build #${buildNumber} started but deployment tracking needs recovery: ${trackingWarning}`);
        }
      }

      console.log(`[AutoDeploy] ✅ Auto-deploy initiated successfully`);
      if (buildNumber) {
        console.log(`[AutoDeploy] Monitor at: ${process.env.JENKINS_URL}/job/${appName}-job/${buildNumber}/`);
      }

      return {
        success: true,
        buildNumber: buildNumber ?? undefined,
        warning: trackingWarning,
        skipped: operation.reused,
        skipReason: operation.reused ? 'Duplicate webhook delivery' : undefined,
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[AutoDeploy] ❌ Auto-deploy failed:`, errorMessage);

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

}
