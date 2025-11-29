/**
 * Deployment Service - Orchestrates app deployment
 */
import { Platform_Apps } from "@/lib/supabase/queries";
import { DNSService } from "./dns";
import { JenkinsService } from "./jenkins";
import { BuildPollingService } from "./build-polling";
import { PortAllocator } from "./port-allocator";
import { InfrastructureCleanupService } from "./infrastructure-cleanup";
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
  /**
   * Deploy a new application
   */
  static async deploy(config: DeploymentConfig): Promise<DeploymentResult> {
    console.log(`[DeploymentService] Starting deployment for ${config.name}`);
    console.log(`[DeploymentService] Framework: ${config.framework || 'not specified'}`);
    console.log(`[DeploymentService] Repository: ${config.repository_url}`);
    console.log(`[DeploymentService] Branch: ${config.branch}`);

    try {
      // Step 1: Allocate port
      const port = await PortAllocator.allocate();
      if (!port) {
        throw new Error("No available ports");
      }
      console.log(`[DeploymentService] Step 1/5: Port allocated - ${port}`);

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
        port,
        ip: process.env.KUBE_IP || null,
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
      // try {
      //   if (!process.env.KUBE_IP) {
      //     throw new Error("KUBE_IP environment variable not configured");
      //   }
      //   await DNSService.createRecord(config.name, process.env.KUBE_IP);
      //   console.log(`[DeploymentService] Step 4/5: DNS record created - ${config.name}.uizb210.xyz`);
      // } catch (dnsError: any) {
      //   console.error(`[DeploymentService] DNS creation failed:`, dnsError?.message);
      //   // Rollback: Delete database record and free the port
      //   await Platform_Apps.delete(app.id, config.user_id).catch(err => 
      //     console.error(`[DeploymentService] Failed to rollback DB record:`, err)
      //   );
      //   throw new Error(`DNS creation failed: ${dnsError?.message}`);
      // }

      // Step 5: Create Jenkins job and start build monitoring
      try {
        // Update status to 'building' before triggering Jenkins
        await Platform_Apps.update(app.id, { status: "building" });
        console.log(`[DeploymentService] Step 4/5: Status updated to 'building'`);
        
        // Use authenticated URL for Jenkins if available (for private repos), otherwise use regular URL
        const jenkinsRepoUrl = config.authenticated_url || config.repository_url;
        
        await JenkinsService.createJob(
          config.name,
          jenkinsRepoUrl,
          config.branch,
          port,
          config.framework,
          config.size || 'small'
        );
        console.log(`[DeploymentService] Step 5/5: Jenkins job created and triggered`);

        // Start background polling for build status
        BuildPollingService.startPolling({
          appId: app.id,
          appName: config.name,
          buildNumber: 1, // First build for new job
        });
        
      } catch (jenkinsError: any) {
        console.error(`[DeploymentService] Jenkins job creation failed:`, jenkinsError?.message);
        // Rollback: Delete DNS and DB record on Jenkins failure
        await Promise.all([
          DNSService.deleteRecord(config.name).catch(err => 
            console.error(`[DeploymentService] Failed to rollback DNS:`, err)
          ),
          Platform_Apps.delete(app.id, config.user_id).catch(err => 
            console.error(`[DeploymentService] Failed to rollback DB record:`, err)
          )
        ]);
        throw new Error(`Jenkins job creation failed: ${jenkinsError?.message}`);
      }

      // Update deployment URL
      const deploymentUrl = `https://${config.name}.uizb210.xyz`;
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
        port,
        build_number: buildNumber,
      };
    } catch (error: any) {
      console.error(`[DeploymentService] ❌ Deployment failed:`, error?.message);
      return {
        success: false,
        error: error?.message || "Unknown deployment error",
      };
    }
  }

  /**
   * Delete an application and its infrastructure
   */
  static async delete(appId: string, userId: string): Promise<boolean> {
    console.log(`[DeploymentService] Starting deletion for app: ${appId}`);

    try {
      // Get app details
      const appResult = await Platform_Apps.get(appId);
      if (!appResult.success) {
        throw new Error("App not found");
      }

      const app = appResult.data;

      // Verify ownership
      if (app.user_id !== userId) {
        throw new Error("Unauthorized");
      }

      // Delete from database first
      await Platform_Apps.delete(appId, userId);
      console.log(`[DeploymentService] Database record deleted`);

      // Clean up infrastructure (now waits for completion)
      await this.cleanupInfrastructure(app.name);

      return true;
    } catch (error: any) {
      console.error(`[DeploymentService] ❌ Deletion failed:`, error?.message);
      throw error;
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

    // Use the new InfrastructureCleanupService for decoupled deletion
    try {
      // Delete Jenkins job
      await InfrastructureCleanupService.deleteJenkinsJob(appName);
    } catch (error: any) {
      console.error(`[DeploymentService] Jenkins cleanup error:`, error);
    }

    try {
      // Delete Kubernetes resources using Jenkins deletion job
      await InfrastructureCleanupService.deleteKubernetesResources(appName);
    } catch (error: any) {
      console.error(`[DeploymentService] K8s cleanup error:`, error);
      throw error; // Re-throw to ensure the API knows about the failure
    }

    console.log(`[DeploymentService] ✅ Infrastructure cleanup completed for ${appName} (Jenkins and K8s deletion jobs)`);
  }
}
