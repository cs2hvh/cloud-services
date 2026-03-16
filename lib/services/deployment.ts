/**
 * Deployment Service - Orchestrates app deployment
 */
import { Platform_Apps } from "@/lib/supabase/queries/platform_apps";
import { DNSService } from "./dns";
import { JenkinsService } from "./jenkins";
import { BuildPollingService } from "./build-polling";
import { InfrastructureCleanupService } from "./infrastructure-cleanup";
import { AppStatusService } from "./app-status";
import { reconcileRuntimeEnv } from "@/lib/services/runtime-env-reconciler";
import { randomBytes } from "crypto";

// Generate a random ID
function generateId(length: number = 10): string {
  return randomBytes(length).toString('base64url').slice(0, length);
}

export interface DeploymentConfig {
  name: string;
  repository_url: string; // Clean URL without token (stored in DB)
  authenticated_url?: string; // URL with token (used only for Jenkins, never stored)
  branch: string;
  framework: string;
  git_provider: string;
  repository_id: string;
  repository_name: string;
  user_id: string;
  build_command?: string;
  output_directory?: string;
  env_vars?: Array<{ key: string; value: string }>;
  size?: string;
  auto_deploy?: boolean;
  deploy_branch?: string;
  project_id?: string;
  container_port?: number; // User-specified or auto-detected port
}

export interface DeploymentResult {
  success: boolean;
  app_id?: string;
  deployment_url?: string;
  port?: number;
  build_number?: number;
  error?: string;
}

export class DeploymentService {
  private static async syncRuntimeEnvSecret(
    appName: string,
    framework: string | undefined,
    envVars: Array<{ key: string; value: string }>
  ): Promise<void> {
    const syncResult = await reconcileRuntimeEnv({
      appName,
      framework: framework ?? null,
      envVars,
      policy: "strict",
      action: "secret_only",
      cleanupWhenEmpty: false,
      retryCount: 3,
      retryDelayMs: 1000,
      timeoutMs: 8000,
    });

    if (syncResult.status === "failed") {
      throw new Error(syncResult.error || "Failed to sync runtime environment secret");
    }
  }

  /**
   * Get standard container port based on framework
   */
  private static getContainerPort(framework: string): number {
    switch (framework?.toLowerCase()) {
      case 'java':
      case 'maven':
      case 'spring':
      case 'spring-boot':
      case 'springboot':
        return 8080;
      case 'python':
      case 'django':
      case 'flask':
      case 'fastapi':
        return 8000;
      case 'nodejs':
      case 'node':
      case 'express':
      case 'nextjs':
      case 'next':
      default:
        return 3000;
    }
  }

  /**
   * Deploy a new application
   */
  static async deploy(config: DeploymentConfig): Promise<DeploymentResult> {
    console.log(`[DeploymentService] Starting deployment for ${config.name}`);
    console.log(`[DeploymentService] Framework: ${config.framework || 'not specified'}`);
    console.log(`[DeploymentService] Repository: ${config.repository_url}`);
    console.log(`[DeploymentService] Branch: ${config.branch}`);

    try {
      // Step 1: Determine container port (user-specified > detected > framework default)
      const containerPort = config.container_port || this.getContainerPort(config.framework);
      console.log(`[DeploymentService] Step 1/5: Container port selected - ${containerPort}${config.container_port ? ' (user-specified)' : ' (framework default)'} (NGINX Ingress handles external routing)`);

      // Step 2: Create database record
      const slug = `${config.name}-${generateId(6)}`;
      const appPayload = {
        name: config.name,
        slug,
        user_id: config.user_id,
        git_provider: config.git_provider,
        repository_id: config.repository_id,
        repository_name: config.repository_name,
        repository_url: config.repository_url,
        branch: config.branch,
        framework: config.framework,
        build_command: config.build_command,
        output_directory: config.output_directory,
        status: "pending" as const, // Will be updated to 'building' when Jenkins starts
        port: containerPort, // Store container port for reference
        ip: process.env.KUBE_IP || null,
        auto_deploy: config.auto_deploy || false,
        deploy_branch: config.deploy_branch || config.branch,
        size: config.size || 'small', // Store size for redeployments
        project_id: config.project_id || null,
      };

      const result = await Platform_Apps.create(appPayload);
      if (!result.success) {
        throw new Error(result.error || "Failed to create database record");
      }

      const app = result.data;
      console.log(`[DeploymentService] Step 2/5: Database record created - ${app.id}`);

      // Step 3: Add environment variables
      if (config.env_vars && config.env_vars.length > 0) {
        await Platform_Apps.set_env_vars(app.id, config.env_vars);
        console.log(`[DeploymentService] Step 3/5: Added ${config.env_vars.length} environment variables`);
      } else {
        console.log(`[DeploymentService] Step 3/5: No environment variables to add`);
      }

      // Step 4: Create DNS record
      const { getAppDomain } = await import('@/config/domain');
      try {
        if (!process.env.KUBE_IP) {
          throw new Error("KUBE_IP environment variable not configured");
        }
        await DNSService.createRecord(config.name, process.env.KUBE_IP);
        console.log(`[DeploymentService] Step 4/5: DNS record created - ${getAppDomain(config.name)}`);
      } catch (dnsError: unknown) {
        const errorMessage = dnsError instanceof Error ? dnsError.message : 'Unknown error';
        console.error(`[DeploymentService] DNS creation failed:`, errorMessage);
        // Rollback: Delete database record
        await Platform_Apps.delete(app.id, config.user_id).catch(err => 
          console.error(`[DeploymentService] Failed to rollback DB record:`, err)
        );
        throw new Error(`DNS creation failed: ${errorMessage}`);
      }

      // Step 5: Create Jenkins job and start build monitoring
      try {
        // Update status to 'building' before triggering Jenkins
        // Use AppStatusService for consistent status management
        await AppStatusService.setStatus(app.id, "building");
        console.log(`[DeploymentService] Step 5/5: Status updated to 'building'`);
        
        // Use authenticated URL for Jenkins if available (for private repos), otherwise use regular URL
        const jenkinsRepoUrl = config.authenticated_url || config.repository_url;
        
        // Get env vars to pass to Jenkins/Kubernetes
        const envVarsToPass = config.env_vars || [];

        // Sync runtime secrets via backend service (do not embed runtime secret values in Jenkins job XML).
        await this.syncRuntimeEnvSecret(config.name, config.framework, envVarsToPass);
        
        await JenkinsService.createJob(
          config.name,
          app.id,
          jenkinsRepoUrl,
          config.branch,
          config.framework,
          config.size || 'small',
          'manual',
          envVarsToPass,
          containerPort
        );
        console.log(`[DeploymentService] Step 6/6: Jenkins job created and triggered`);

        // Start background polling for build status
        BuildPollingService.startPolling({
          appId: app.id,
          appName: config.name,
          buildNumber: 1, // First build for new job
          trigger: 'manual',
        });
        
      } catch (jenkinsError: unknown) {
        const errorMessage = jenkinsError instanceof Error ? jenkinsError.message : 'Unknown error';
        console.error(`[DeploymentService] Jenkins job creation failed:`, errorMessage);
        
        // Rollback: Delete DNS and DB record on Jenkins failure
        // Track rollback failures to include in error message
        const rollbackErrors: string[] = [];
        
        // Delete DNS first (most critical for re-deployment with same name)
        try {
          await DNSService.deleteRecord(config.name);
          console.log(`[DeploymentService] ✅ DNS rollback successful`);
        } catch (dnsErr) {
          const dnsErrMsg = dnsErr instanceof Error ? dnsErr.message : 'Unknown error';
          console.error(`[DeploymentService] ❌ Failed to rollback DNS:`, dnsErrMsg);
          rollbackErrors.push(`DNS cleanup failed: ${dnsErrMsg}`);
        }
        
        // Delete DB record
        try {
          await Platform_Apps.delete(app.id, config.user_id);
          console.log(`[DeploymentService] ✅ DB rollback successful`);
        } catch (dbErr) {
          const dbErrMsg = dbErr instanceof Error ? dbErr.message : 'Unknown error';
          console.error(`[DeploymentService] ❌ Failed to rollback DB record:`, dbErrMsg);
          rollbackErrors.push(`DB cleanup failed: ${dbErrMsg}`);
        }
        
        // Include rollback failures in error message so user knows manual cleanup may be needed
        const fullError = rollbackErrors.length > 0
          ? `Jenkins job creation failed: ${errorMessage}. Warning: Partial cleanup failed (${rollbackErrors.join('; ')}). Please contact support if you cannot redeploy with the same name.`
          : `Jenkins job creation failed: ${errorMessage}`;
        
        throw new Error(fullError);
      }

      // Update deployment URL
      const { getAppUrl } = await import('@/config/domain');
      const deploymentUrl = getAppUrl(config.name);
      await Platform_Apps.update(app.id, { deployment_url: deploymentUrl });

      // Get build number for response
      const buildNumber = await JenkinsService.getLatestBuildNumber(config.name) || 1;

      console.log(`[DeploymentService] ✅ Deployment completed successfully`);
      console.log(`[DeploymentService] App ID: ${app.id}`);
      console.log(`[DeploymentService] URL: ${deploymentUrl}`);
      console.log(`[DeploymentService] Jenkins: https://jenkins.hav0k.dev/job/${config.name}-job/`);

      return {
        success: true,
        app_id: app.id,
        deployment_url: deploymentUrl,
        port: containerPort,
        build_number: buildNumber,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown deployment error';
      console.error(`[DeploymentService] ❌ Deployment failed:`, errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Delete an application and its infrastructure
   * @param appId - The app ID to delete
   * @param userId - The user ID requesting deletion
   * @param isAdmin - If true, bypass ownership check (for admin operations)
   */
  static async delete(appId: string, userId: string, isAdmin: boolean = false): Promise<boolean> {
    console.log(`[DeploymentService] Starting deletion for app: ${appId}${isAdmin ? ' (admin override)' : ''}`);

    try {
      // Get app details
      const appResult = await Platform_Apps.get(appId);
      if (!appResult.success) {
        throw new Error("App not found");
      }

      const app = appResult.data;

      // Verify ownership (skip if admin)
      if (!isAdmin && app.user_id !== userId) {
        throw new Error("Unauthorized");
      }

      // Clean up custom domains BEFORE database deletion (to avoid cascade)
      await this.cleanupCustomDomains(appId, app.name);

      // Delete from database (will cascade to platform_app_domains)
      await Platform_Apps.delete(appId, userId);
      console.log(`[DeploymentService] Database record deleted`);

      // Clean up infrastructure (now waits for completion)
      await this.cleanupInfrastructure(app.name);

      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[DeploymentService] ❌ Deletion failed:`, errorMessage);
      throw error;
    }
  }

  /**
   * Clean up custom domains (Ingress + DNS) before app deletion
   */
  private static async cleanupCustomDomains(appId: string, appName: string): Promise<void> {
    try {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const supabase = await createServiceClient();

      // Get all active custom domains for this app
      const { data: customDomains, error } = await supabase
        .from('platform_app_domains')
        .select('id, domain, status')
        .eq('app_id', appId)
        .in('status', ['verified', 'active']);

      if (error) {
        console.error('[DeploymentService] Error fetching custom domains:', error);
        return; // Don't fail deletion if custom domains fetch fails
      }

      if (!customDomains || customDomains.length === 0) {
        console.log('[DeploymentService] No custom domains to clean up');
        return;
      }

      console.log(`[DeploymentService] Cleaning up ${customDomains.length} custom domain(s)`);

      // Clean up each custom domain (Ingress + DNS)
      for (const domain of customDomains) {
        try {
          // Remove from Kubernetes Ingress if active
          if (domain.status === 'active') {
            const { KubernetesCustomDomainService } = await import('./kubernetes-custom-domain');
            await KubernetesCustomDomainService.removeCustomDomainFromIngress(appName, domain.domain);
            console.log(`[DeploymentService] ✅ Removed ${domain.domain} from Ingress`);
          }

          // Delete DNS record for custom domain
          try {
            const { DNSService } = await import('./dns');
            await DNSService.deleteCustomDomainRecord(domain.domain);
            console.log(`[DeploymentService] ✅ Deleted DNS record for ${domain.domain}`);
          } catch (dnsError) {
            console.error(`[DeploymentService] Failed to delete DNS for ${domain.domain}:`, dnsError);
            // Continue even if DNS cleanup fails
          }
        } catch (domainError) {
          console.error(`[DeploymentService] Failed to cleanup custom domain ${domain.domain}:`, domainError);
          // Continue with other domains even if one fails
        }
      }

      console.log('[DeploymentService] ✅ Custom domains cleanup completed');
    } catch (error) {
      console.error('[DeploymentService] Error during custom domains cleanup:', error);
      // Don't fail the entire deletion if custom domain cleanup fails
    }
  }

  /**
   * Delete only Jenkins job for an app (decoupled operation)
   */
  static async deleteJenkinsJob(appName: string): Promise<void> {
    console.log(`[DeploymentService] Deleting Jenkins job for ${appName}`);
    try {
      await JenkinsService.deleteJob(appName);
      console.log(`[DeploymentService] ✅ Jenkins job deleted for ${appName}`);
    } catch (error) {
      console.error(`[DeploymentService] ❌ Failed to delete Jenkins job for ${appName}:`, error);
      throw error;
    }
  }

  /**
   * Delete only Kubernetes resources for an app (decoupled operation)
   */
  static async deleteKubernetesResources(appName: string): Promise<void> {
    console.log(`[DeploymentService] Creating Jenkins deletion job for Kubernetes resources of ${appName}`);
    try {
      // Use Jenkins to handle the deletion
      await JenkinsService.createDeleteJob(appName);
      console.log(`[DeploymentService] ✅ Jenkins deletion job created and triggered for ${appName}`);
    } catch (error) {
      console.error(`[DeploymentService] ❌ Failed to create Jenkins deletion job for ${appName}:`, error);
      throw error;
    }
  }

  /**
   * Delete only DNS record for an app (decoupled operation)
   */
  static async deleteDnsRecord(appName: string): Promise<void> {
    console.log(`[DeploymentService] Deleting DNS record for ${appName}`);
    try {
      await DNSService.deleteRecord(appName);
      console.log(`[DeploymentService] ✅ DNS record deleted for ${appName}`);
    } catch (error) {
      console.error(`[DeploymentService] ❌ Failed to delete DNS record for ${appName}:`, error);
      throw error;
    }
  }

  /**
   * Clean up infrastructure asynchronously
   */
  private static async cleanupInfrastructure(appName: string): Promise<void> {
    console.log(`[DeploymentService] Cleaning up infrastructure for ${appName}`);

    const errors: string[] = [];

    // 1. Delete DNS record FIRST (most important for re-deployment)
    try {
      await DNSService.deleteRecord(appName);
      console.log(`[DeploymentService] ✅ DNS record deleted for ${appName}`);
    } catch (error: unknown) {
      console.error(`[DeploymentService] DNS cleanup error:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`DNS: ${errorMessage}`);
      // Don't throw - continue with other cleanup
    }

    // 2. Delete Jenkins job
    try {
      await InfrastructureCleanupService.deleteJenkinsJob(appName);
    } catch (error: unknown) {
      console.error(`[DeploymentService] Jenkins cleanup error:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Jenkins: ${errorMessage}`);
      // Don't throw - continue with other cleanup
    }

    // 3. Delete Kubernetes resources using Jenkins deletion job
    try {
      await InfrastructureCleanupService.deleteKubernetesResources(appName);
    } catch (error: unknown) {
      console.error(`[DeploymentService] K8s cleanup error:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`K8s: ${errorMessage}`);
      // Don't throw - DNS already deleted, so re-deployment will work
    }

    if (errors.length > 0) {
      console.warn(`[DeploymentService] ⚠️ Cleanup completed with errors: ${errors.join(', ')}`);
    } else {
      console.log(`[DeploymentService] ✅ Infrastructure cleanup completed for ${appName}`);
    }
  }
}
