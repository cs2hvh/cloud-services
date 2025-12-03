/**
 * Infrastructure Cleanup Service - Handles decoupled deletion of infrastructure components
 * This service allows for separate deletion of Jenkins, Kubernetes, and DNS resources
 * to avoid tight coupling as per project requirements.
 */

import { DNSService } from "./dns";
import { JenkinsService } from "./jenkins";
import { DeploymentService } from "./deployment";

export class InfrastructureCleanupService {
  /**
   * Delete only Jenkins job for an app (decoupled operation)
   */
  static async deleteJenkinsJob(appName: string): Promise<void> {
    console.log(`[InfrastructureCleanupService] Deleting Jenkins job for ${appName}`);
    try {
      await JenkinsService.deleteJob(appName);
      console.log(`[InfrastructureCleanupService] ✅ Jenkins job deleted for ${appName}`);
    } catch (error) {
      console.error(`[InfrastructureCleanupService] ❌ Failed to delete Jenkins job for ${appName}:`, error);
      throw error;
    }
  }

  /**
   * Delete only Kubernetes resources for an app (decoupled operation)
   * This now creates a Jenkins deletion job instead of directly deleting resources
   */
  static async deleteKubernetesResources(appName: string): Promise<void> {
    console.log(`[InfrastructureCleanupService] Creating Jenkins deletion job for Kubernetes resources of ${appName}`);
    try {
      // Create and trigger a Jenkins deletion job
      const buildNumber = await JenkinsService.createDeleteJob(appName);
      console.log(`[InfrastructureCleanupService] ✅ Jenkins deletion job created and triggered for ${appName} (Build #${buildNumber})`);
      
      // Wait for the job to complete (with timeout)
      await this.waitForDeleteJobCompletion(appName, buildNumber);
      
      console.log(`[InfrastructureCleanupService] ✅ Jenkins deletion job completed for ${appName}`);
    } catch (error) {
      console.error(`[InfrastructureCleanupService] ❌ Failed to create or wait for Jenkins deletion job for ${appName}:`, error);
      throw error;
    }
  }

  /**
   * Wait for Jenkins deletion job to complete
   */
  private static async waitForDeleteJobCompletion(appName: string, buildNumber: number, timeoutMs: number = 300000): Promise<void> {
    console.log(`[InfrastructureCleanupService] Waiting for Jenkins deletion job ${appName}-delete-job #${buildNumber} to complete...`);
    
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds
    let buildExists = false;
    let retryCount = 0;
    const maxRetries = 10; // Allow up to 10 retries for build to appear
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await JenkinsService.checkDeleteBuildStatus(appName, buildNumber);
        buildExists = true; // If we get here, the build exists
        
        if (!status.building) {
          if (status.result === 'SUCCESS') {
            console.log(`[InfrastructureCleanupService] ✅ Jenkins deletion job completed successfully`);
            // Clean up the delete job itself
            try {
              await JenkinsService.deleteDeleteJob(appName);
              console.log(`[InfrastructureCleanupService] ✅ Jenkins deletion job cleaned up`);
            } catch (cleanupError) {
              console.warn(`[InfrastructureCleanupService] ⚠️ Failed to cleanup delete job (non-critical):`, cleanupError);
            }
            return;
          } else {
            throw new Error(`Jenkins deletion job failed with result: ${status.result}`);
          }
        }
        
        console.log(`[InfrastructureCleanupService] Jenkins deletion job still running...`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error: any) {
        // Handle the case where the build doesn't exist yet
        if (error.notFound && !buildExists && retryCount < maxRetries) {
          retryCount++;
          console.log(`[InfrastructureCleanupService] Build not found yet, retrying... (${retryCount}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          continue;
        }
        
        console.error(`[InfrastructureCleanupService] Error checking deletion job status:`, error);
        throw error;
      }
    }
    
    throw new Error(`Jenkins deletion job timed out after ${timeoutMs}ms`);
  }

  /**
   * Delete only DNS record for an app (decoupled operation)
   */
  static async deleteDnsRecord(appName: string): Promise<void> {
    console.log(`[InfrastructureCleanupService] Deleting DNS record for ${appName}`);
    try {
      await DNSService.deleteRecord(appName);
      console.log(`[InfrastructureCleanupService] ✅ DNS record deleted for ${appName}`);
    } catch (error) {
      console.error(`[InfrastructureCleanupService] ❌ Failed to delete DNS record for ${appName}:`, error);
      throw error;
    }
  }

  /**
   * Delete all infrastructure components separately (without tight coupling)
   * This method executes deletions sequentially to ensure proper cleanup order
   */
  static async deleteAllInfrastructureSeparately(appName: string): Promise<void> {
    console.log(`[InfrastructureCleanupService] Starting decoupled infrastructure cleanup for ${appName}`);
    
    // Delete Jenkins job first (usually fastest)
    try {
      await this.deleteJenkinsJob(appName);
    } catch (error) {
      console.error(`[InfrastructureCleanupService] Jenkins deletion failed, continuing with other components:`, error);
    }

    // Delete Kubernetes resources next using Jenkins deletion job
    try {
      await this.deleteKubernetesResources(appName);
    } catch (error) {
      console.error(`[InfrastructureCleanupService] Kubernetes deletion failed, continuing with other components:`, error);
    }

    // Delete DNS record last (as per requirements, this can be skipped for now)
    // Uncomment the following lines when DNS deletion is needed
    /*
    try {
      await this.deleteDnsRecord(appName);
    } catch (error) {
      console.error(`[InfrastructureCleanupService] DNS deletion failed:`, error);
    }
    */

    console.log(`[InfrastructureCleanupService] ✅ Decoupled infrastructure cleanup completed for ${appName} (DNS step skipped as per requirements)`);
  }
}