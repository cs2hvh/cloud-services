/**
 * Jenkins Service - Handles CI/CD job operations
 */
import jenkins from "@/lib/jenkins";
import { APP_DOMAIN } from "@/config/domain";
import {
  createSimpleTestPipeline,
  createNodeJsPipeline,
  createExpressPipeline,
  createPythonPipeline,
  createNextJsPipeline,
  createDeletePipeline,
  createViteReactPipeline,
  createVuePipeline,
  createAngularPipeline,
  createSvelteKitPipeline,
} from "@/lib/jenkins/pipelines";

export class JenkinsService {
  /**
   * Trigger a build for an existing Jenkins job
   * Used by webhooks for auto-deploy
   */
  static async triggerBuild(appName: string): Promise<number> {
    if (!process.env.JENKINS_URL) {
      throw new Error("JENKINS_URL not configured");
    }

    const jobName = `${appName}-job`;
    
    console.log(`[JenkinsService] Triggering build for: ${jobName}`);

    try {
      // Check if job exists first
      const exists = await this.jobExists(appName);
      if (!exists) {
        throw new Error(`Job ${jobName} does not exist`);
      }

      // Trigger the build
      await jenkins.job.build(jobName);
      
      // Wait a moment for build to be registered
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get the build number
      const buildNumber = await this.getLatestBuildNumber(appName) || 1;
      
      console.log(`[JenkinsService] ✅ Build #${buildNumber} triggered for: ${jobName}`);
      console.log(`[JenkinsService] Monitor at: ${process.env.JENKINS_URL}/job/${jobName}/${buildNumber}/`);
      
      return buildNumber;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JenkinsService] ❌ Error triggering build for ${jobName}:`, errorMessage);
      throw new Error(`Failed to trigger build: ${errorMessage}`);
    }
  }

  /**
   * Create and trigger a Jenkins job
   */
  static async createJob(
    appName: string,
    githubUrl: string,
    branch: string,
    port: number,
    framework?: string,
    size: string = 'small'
  ): Promise<void> {
    if (!process.env.JENKINS_URL) {
      throw new Error("JENKINS_URL not configured");
    }

    const jobName = `${appName}-job`;
    
    console.log(`[JenkinsService] Creating job: ${jobName}`);
    console.log(`[JenkinsService] Framework: ${framework || 'default'}, Branch: ${branch}, Port: ${port}`);

    // Select pipeline based on framework
    const pipeline = JenkinsService.selectPipeline(appName, githubUrl, branch, port.toString(), framework, size);

    // Create the job
    try {
      await jenkins.job.create(jobName, pipeline);
      console.log(`[JenkinsService] ✅ Created Jenkins job: ${jobName}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JenkinsService] Failed to create job:`, errorMessage);
      throw new Error(`Jenkins job creation failed: ${errorMessage}`);
    }

    // Trigger build immediately (job creation might need a moment, hence the small delay)
    // Using Promise instead of setTimeout to ensure it completes
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      await jenkins.job.build(jobName);
      console.log(`[JenkinsService] ✅ Build #1 triggered for: ${jobName}`);
      console.log(`[JenkinsService] Monitor at: ${process.env.JENKINS_URL}/job/${jobName}/`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JenkinsService] ❌ Error triggering build:`, errorMessage);
      // Try to delete the created job since build failed
      await jenkins.job.destroy(jobName).catch((err: unknown) => 
        console.error(`[JenkinsService] Failed to cleanup job after build failure:`, err)
      );
      throw new Error(`Jenkins build trigger failed: ${errorMessage}`);
    }
  }

  /**
   * Create a Jenkins deletion job
   */
  static async createDeleteJob(
    appName: string
  ): Promise<number> {
    if (!process.env.JENKINS_URL) {
      throw new Error("JENKINS_URL not configured");
    }

    const jobName = `${appName}-delete-job`;
    
    console.log(`[JenkinsService] Creating deletion job: ${jobName}`);

    // Create delete pipeline
    const pipeline = createDeletePipeline(appName, APP_DOMAIN);

    // Create the job
    try {
      await jenkins.job.create(jobName, pipeline);
      console.log(`[JenkinsService] ✅ Created Jenkins deletion job: ${jobName}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JenkinsService] Failed to create deletion job:`, errorMessage);
      throw new Error(`Jenkins deletion job creation failed: ${errorMessage}`);
    }

    // Trigger build immediately
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      await jenkins.job.build(jobName);
      console.log(`[JenkinsService] ✅ Build triggered for deletion job: ${jobName}`);
      console.log(`[JenkinsService] Monitor at: ${process.env.JENKINS_URL}/job/${jobName}/`);
      
      // Wait a bit for the build to be registered in Jenkins
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get the actual build number
      const buildNumber = await this.getLatestDeleteBuildNumber(appName);
      if (buildNumber) {
        console.log(`[JenkinsService] ✅ Build #${buildNumber} confirmed for deletion job: ${jobName}`);
        return buildNumber;
      } else {
        // Fallback to build #1 if we can't get the build number
        console.log(`[JenkinsService] ⚠️  Could not get build number, using fallback #1 for: ${jobName}`);
        return 1;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JenkinsService] ❌ Error triggering deletion build:`, errorMessage);
      // Try to delete the created job since build failed
      await jenkins.job.destroy(jobName).catch((err: unknown) => 
        console.error(`[JenkinsService] Failed to cleanup deletion job after build failure:`, err)
      );
      throw new Error(`Jenkins deletion build trigger failed: ${errorMessage}`);
    }
  }

  /**
   * Delete a Jenkins job
   */
  static async deleteJob(appName: string): Promise<void> {
    const jobName = `${appName}-job`;
    
    console.log(`[JenkinsService] Deleting job: ${jobName}`);
    
    await jenkins.job.destroy(jobName);
    
    console.log(`[JenkinsService] ✅ Deleted Jenkins job: ${jobName}`);
  }

  /**
   * Delete a Jenkins deletion job
   */
  static async deleteDeleteJob(appName: string): Promise<void> {
    const jobName = `${appName}-delete-job`;
    
    console.log(`[JenkinsService] Deleting deletion job: ${jobName}`);
    
    await jenkins.job.destroy(jobName);
    
    console.log(`[JenkinsService] ✅ Deleted Jenkins deletion job: ${jobName}`);
  }

  /**
   * Check if job exists
   */
  static async jobExists(appName: string): Promise<boolean> {
    const jobName = `${appName}-job`;
    
    try {
      await jenkins.job.get(jobName);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get job status
   */
  static async getJobStatus(appName: string): Promise<unknown> {
    const jobName = `${appName}-job`;
    return await jenkins.job.get(jobName);
  }

  /**
   * Get latest build number for a job
   */
  static async getLatestBuildNumber(appName: string): Promise<number | null> {
    const jobName = `${appName}-job`;
    
    try {
      const jobInfo = await jenkins.job.get(jobName);
      return jobInfo.lastBuild?.number || null;
    } catch {
      console.error(`[JenkinsService] Error getting latest build number:`);
      return null;
    }
  }

  /**
   * Get latest build number for a deletion job
   */
  static async getLatestDeleteBuildNumber(appName: string): Promise<number | null> {
    const jobName = `${appName}-delete-job`;
    
    try {
      const jobInfo = await jenkins.job.get(jobName);
      return jobInfo.lastBuild?.number || null;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JenkinsService] Error getting latest delete build number:`, errorMessage);
      return null;
    }
  }

  /**
   * Get build information
   */
  static async getBuildInfo(appName: string, buildNumber: number): Promise<{
    number: number;
    building: boolean;
    result: string | null;
    duration: number;
    timestamp: number;
    url: string;
  }> {
    const jobName = `${appName}-job`;
    
    try {
      const buildInfo = await jenkins.build.get(jobName, buildNumber);
      return {
        number: buildInfo.number,
        building: buildInfo.building,
        result: buildInfo.result, // SUCCESS, FAILURE, ABORTED, UNSTABLE, null (if building)
        duration: buildInfo.duration,
        timestamp: buildInfo.timestamp,
        url: buildInfo.url,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JenkinsService] Error getting build info:`, errorMessage);
      throw error;
    }
  }

  /**
   * Get build logs
   */
  static async getBuildLog(appName: string, buildNumber: number, start = 0): Promise<string> {
    const jobName = `${appName}-job`;
    
    try {
      const log = await jenkins.build.log(jobName, buildNumber, {
        start,
        type: 'text'
      });
      return log;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JenkinsService] Error getting build log:`, errorMessage);
      throw error;
    }
  }

  /**
   * Check if build is complete and return final status
   */
  static async checkBuildStatus(appName: string, buildNumber: number): Promise<{
    building: boolean;
    result: 'SUCCESS' | 'FAILURE' | 'ABORTED' | 'UNSTABLE' | null;
    status: 'running' | 'failed' | 'building';
  }> {
    const jobName = `${appName}-job`;
    
    try {
      const buildInfo = await jenkins.build.get(jobName, buildNumber);
      
      let status: 'running' | 'failed' | 'building' = 'building';
      
      if (!buildInfo.building) {
        // Build is complete
        status = buildInfo.result === 'SUCCESS' ? 'running' : 'failed';
      }
      
      return {
        building: buildInfo.building,
        result: buildInfo.result,
        status,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JenkinsService] Error checking build status:`, errorMessage);
      throw error;
    }
  }

  /**
   * Check if deletion build is complete and return final status
   */
  static async checkDeleteBuildStatus(appName: string, buildNumber: number): Promise<{
    building: boolean;
    result: 'SUCCESS' | 'FAILURE' | 'ABORTED' | 'UNSTABLE' | null;
    status: 'running' | 'failed' | 'building';
  }> {
    const jobName = `${appName}-delete-job`;
    
    try {
      const buildInfo = await jenkins.build.get(jobName, buildNumber);
      
      let status: 'running' | 'failed' | 'building' = 'building';
      
      if (!buildInfo.building) {
        // Build is complete
        status = buildInfo.result === 'SUCCESS' ? 'running' : 'failed';
      }
      
      return {
        building: buildInfo.building,
        result: buildInfo.result,
        status,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorObj = error as { statusCode?: number };
      console.error(`[JenkinsService] Error checking delete build status:`, errorMessage);
      // Mark as notFound if it's a 404 (build doesn't exist yet)
      if (errorMessage.includes('404') || errorMessage.includes('not found') || errorObj.statusCode === 404) {
        const notFoundError = new Error(`Build #${buildNumber} not found for ${jobName}`) as Error & { notFound: boolean };
        notFoundError.notFound = true;
        throw notFoundError;
      }
      throw error;
    }
  }

  /**
   * Select appropriate pipeline based on framework
   */
  private static selectPipeline(
    appName: string,
    githubUrl: string,
    branch: string,
    port: string,
    framework?: string,
    size: string = 'small'
  ): string {
    const fw = framework?.toLowerCase();

    switch (fw) {
      case 'simple-test':
      case 'test':
        console.log(`[JenkinsService] Using SIMPLE TEST pipeline (no Docker/K8s)`);
        return createSimpleTestPipeline(appName, githubUrl, branch);

      case 'express':
      case 'express.js':
        console.log(`[JenkinsService] Using EXPRESS pipeline (auto-Dockerfile)`);
        return createExpressPipeline(appName, githubUrl, branch, port, size, APP_DOMAIN);

      case 'python':
      case 'django':
      case 'flask':
      case 'fastapi':
        console.log(`[JenkinsService] Using PYTHON pipeline`);
        return createPythonPipeline(appName, githubUrl, branch, port, size, APP_DOMAIN);

      case 'nextjs':
      case 'next.js':
        console.log(`[JenkinsService] Using NEXT.JS pipeline (auto-Dockerfile with standalone support)`);
        return createNextJsPipeline(appName, githubUrl, branch, port, size, APP_DOMAIN);

      case 'vite-react':
      case 'vitereact':
      case 'react-vite':
        console.log(`[JenkinsService] Using VITE-REACT pipeline (auto-Dockerfile with Vite build)`);
        return createViteReactPipeline(appName, githubUrl, branch, port, size, APP_DOMAIN);

      case 'vue':
      case 'vue.js':
      case 'vuejs':
        console.log(`[JenkinsService] Using VUE pipeline (auto-Dockerfile with Vite build)`);
        return createVuePipeline(appName, githubUrl, branch, port, size, APP_DOMAIN);

      case 'angular':
        console.log(`[JenkinsService] Using ANGULAR pipeline (auto-Dockerfile with Angular CLI)`);
        return createAngularPipeline(appName, githubUrl, branch, port, size, APP_DOMAIN);

      case 'sveltekit':
        console.log(`[JenkinsService] Using SVELTEKIT pipeline (auto-Dockerfile with Node adapter)`);
        return createSvelteKitPipeline(appName, githubUrl, branch, port, size, APP_DOMAIN);

      case 'nodejs':
      case 'node.js':
      case 'node':
      case 'react': // Standard React (CRA) - requires Dockerfile
      default:
        console.log(`[JenkinsService] Using NODE.JS pipeline (requires Dockerfile)`);
        return createNodeJsPipeline(appName, githubUrl, branch, port, size, APP_DOMAIN);
    }
  }

  /**
   * Update an existing Jenkins job configuration with new parameters
   * Used by auto-deploy to refresh the Git URL with fresh access token
   */
  static async updateJobConfig(
    appName: string,
    githubUrl: string,
    branch: string,
    port: number,
    framework?: string,
    size: string = 'small'
  ): Promise<void> {
    if (!process.env.JENKINS_URL) {
      throw new Error("JENKINS_URL not configured");
    }

    const jobName = `${appName}-job`;
    
    console.log(`[JenkinsService] Updating job config: ${jobName}`);
    console.log(`[JenkinsService] New Git URL: ${githubUrl.replace(/https:\/\/[^@]+@/, 'https://***@')}`);

    // Generate new pipeline with updated config
    const pipeline = JenkinsService.selectPipeline(
      appName, 
      githubUrl, 
      branch, 
      port.toString(), 
      framework, 
      size
    );

    try {
      // Update the job configuration using Jenkins API
      await jenkins.job.config(jobName, pipeline);
      console.log(`[JenkinsService] ✅ Job config updated: ${jobName}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JenkinsService] Failed to update job config:`, errorMessage);
      throw new Error(`Jenkins job config update failed: ${errorMessage}`);
    }
  }

  /**
   * Get job configuration XML
   */
  static async getJobConfig(appName: string): Promise<string> {
    const jobName = `${appName}-job`;
    
    try {
      const config = await jenkins.job.config(jobName);
      return config;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JenkinsService] Failed to get job config:`, errorMessage);
      throw new Error(`Failed to get job config: ${errorMessage}`);
    }
  }
}