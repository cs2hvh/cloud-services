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
    framework?: string
  ): Promise<void> {
    if (!process.env.JENKINS_URL) {
      throw new Error("JENKINS_URL not configured");
    }

    const jobName = `${appName}-job`;
    
    console.log(`[JenkinsService] Creating job: ${jobName}`);
    console.log(`[JenkinsService] Framework: ${framework || 'default'}, Branch: ${branch}, Port: ${port}`);

    // Select pipeline based on framework
    const pipeline = JenkinsService.selectPipeline(appName, githubUrl, branch, port.toString(), framework);

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
   * Select appropriate pipeline based on framework
   */
  private static selectPipeline(
    appName: string,
    githubUrl: string,
    branch: string,
    port: string,
    framework?: string
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
        return createExpressPipeline(appName, githubUrl, branch, port);

      case 'python':
      case 'django':
      case 'flask':
      case 'fastapi':
        console.log(`[JenkinsService] Using PYTHON pipeline`);
        return createPythonPipeline(appName, githubUrl, branch, port);

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
        return createNodeJsPipeline(appName, githubUrl, branch, port);
    }
  }
}
