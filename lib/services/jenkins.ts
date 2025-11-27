/**
 * Jenkins Service - Handles CI/CD job operations
 */
import jenkins from "@/lib/jenkins";
import {
  createSimpleTestPipeline,
  createNodeJsPipeline,
  createExpressPipeline,
  createPythonPipeline,
  PipelineType,
  type PipelineTypeValue,
} from "@/lib/jenkins/pipelines";

export class JenkinsService {
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
    } catch (error: any) {
      console.error(`[JenkinsService] Failed to create job:`, error?.message);
      throw new Error(`Jenkins job creation failed: ${error?.message}`);
    }

    // Trigger build immediately (job creation might need a moment, hence the small delay)
    // Using Promise instead of setTimeout to ensure it completes
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      await jenkins.job.build(jobName);
      console.log(`[JenkinsService] ✅ Build #1 triggered for: ${jobName}`);
      console.log(`[JenkinsService] Monitor at: ${process.env.JENKINS_URL}/job/${jobName}/`);
    } catch (error: any) {
      console.error(`[JenkinsService] ❌ Error triggering build:`, error?.message);
      // Try to delete the created job since build failed
      await jenkins.job.destroy(jobName).catch((err: any) => 
        console.error(`[JenkinsService] Failed to cleanup job after build failure:`, err)
      );
      throw new Error(`Jenkins build trigger failed: ${error?.message}`);
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
   * Check if job exists
   */
  static async jobExists(appName: string): Promise<boolean> {
    const jobName = `${appName}-job`;
    
    try {
      await jenkins.job.get(jobName);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get job status
   */
  static async getJobStatus(appName: string): Promise<any> {
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
    } catch (error: any) {
      console.error(`[JenkinsService] Error getting latest build number:`, error?.message);
      return null;
    }
  }

  /**
   * Get build information
   */
  static async getBuildInfo(appName: string, buildNumber: number): Promise<any> {
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
    } catch (error: any) {
      console.error(`[JenkinsService] Error getting build info:`, error?.message);
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
    } catch (error: any) {
      console.error(`[JenkinsService] Error getting build log:`, error?.message);
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
    } catch (error: any) {
      console.error(`[JenkinsService] Error checking build status:`, error?.message);
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
        return createExpressPipeline(appName, githubUrl, branch, port, size);

      case 'python':
      case 'django':
      case 'flask':
      case 'fastapi':
        console.log(`[JenkinsService] Using PYTHON pipeline`);
        return createPythonPipeline(appName, githubUrl, branch, port, size);

      case 'nodejs':
      case 'node.js':
      case 'node':
      case 'nextjs':
      case 'next.js':
      case 'react':
      case 'vue':
      case 'vue.js':
      default:
        console.log(`[JenkinsService] Using NODE.JS pipeline (requires Dockerfile)`);
        return createNodeJsPipeline(appName, githubUrl, branch, port, size);
    }
  }
}
