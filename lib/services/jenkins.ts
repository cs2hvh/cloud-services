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
  createNuxtJsPipeline,
  createDeletePipeline,
  createViteReactPipeline,
  createVuePipeline,
  createAngularPipeline,
  createSvelteKitPipeline,
  createDockerfilePipeline,
  createJavaPipeline,
  createResizePipeline,
} from "@/lib/jenkins/pipelines";
import { getPlatformAppRetentionPolicy } from "@/lib/platform-apps/retention";

export class JenkinsService {
  private static readonly QUEUE_BUILD_NUMBER_POLL_TIMEOUT_MS = 120_000; // 2 minutes
  private static readonly QUEUE_BUILD_NUMBER_POLL_INTERVAL_MS = 1_500; // 1.5 seconds
  private static readonly RETENTION_POLICY = getPlatformAppRetentionPolicy();

  /**
   * Get Jenkins URL without credentials for safe logging
   */
  private static getSafeJenkinsUrl(): string {
    const jenkinsUrl = process.env.JENKINS_URL || '';
    try {
      const url = new URL(jenkinsUrl);
      url.username = '';
      url.password = '';
      return url.toString().replace(/\/$/, '');
    } catch {
      return jenkinsUrl.replace(/\/\/[^@]+@/, '//');
    }
  }

  /**
   * Public accessor for safe Jenkins URL in logs from other services.
   */
  static getSafeBaseUrlForLogs(): string {
    return this.getSafeJenkinsUrl();
  }

  /**
   * Remove embedded credentials from repository URL.
   */
  private static sanitizeGitUrl(gitUrl: string): string {
    return gitUrl
      .replace(/https:\/\/[^@]+@github\.com\//, "https://github.com/")
      .replace(/https:\/\/oauth2:[^@]+@gitlab\.com\//, "https://gitlab.com/")
      .replace(/https:\/\/x-token-auth:[^@]+@bitbucket\.org\//, "https://bitbucket.org/")
      .replace(/https:\/\/[^@]+@/g, "https://");
  }

  /**
   * Ensure every generated pipeline supports ephemeral auth URL injection
   * and does not print tokenized clone commands.
   */
  private static hardenPipelineXml(pipelineXml: string): string {
    let xml = pipelineXml;

    if (!xml.includes("<name>GIT_AUTH_URL</name>") && xml.includes("</parameterDefinitions>")) {
      const gitAuthParam = `        <hudson.model.PasswordParameterDefinition>
          <name>GIT_AUTH_URL</name>
          <description>Ephemeral authenticated repository URL for private repo checkout (optional)</description>
          <defaultValue></defaultValue>
        </hudson.model.PasswordParameterDefinition>
`;
      xml = xml.replace("</parameterDefinitions>", `${gitAuthParam}      </parameterDefinitions>`);
    }

    // Match the full "git clone --depth=1 ... . || git clone --branch ... ." pattern atomically
    // and replace with a single GIT_AUTH_URL-aware command that suppresses TTY prompts.
    // This handles the pattern used by every pipeline template:
    //   git clone --depth=1 --branch <branch> <url> . || git clone --branch <branch> <url> .
    xml = xml.replace(
      /git clone --depth=\d+ --branch ([^\s]+) ([^\s]+) \. \|\| git clone --branch [^\s]+ [^\s]+ \./g,
      (_match, branchArg: string, repoUrl: string) => {
        const safeRepoUrl = repoUrl.replace(/"/g, '\\"');
        return [
          `REPO_URL="${'$'}{GIT_AUTH_URL:-${safeRepoUrl}}"`,
          "set +x",
          `GIT_TERMINAL_PROMPT=0 git clone --depth=1 --branch ${branchArg} "$REPO_URL" .`,
          "set -x",
        ].join("\n              ");
      }
    );

    xml = this.injectBuildRetentionOptions(xml);

    return xml;
  }

  private static injectBuildRetentionOptions(pipelineXml: string): string {
    if (
      pipelineXml.includes("buildDiscarder(") ||
      !pipelineXml.includes("pipeline {")
    ) {
      return pipelineXml;
    }

    const policy = this.RETENTION_POLICY.jenkins;
    const optionsBlock = `  options {
    buildDiscarder(logRotator(
      numToKeepStr: '${policy.buildsToKeep}',
      daysToKeepStr: '${policy.daysToKeep}',
      artifactNumToKeepStr: '${policy.artifactBuildsToKeep}',
      artifactDaysToKeepStr: '${policy.artifactDaysToKeep}'
    ))
  }

`;

    const environmentIndex = pipelineXml.indexOf("\n  environment {");
    if (environmentIndex !== -1) {
      return `${pipelineXml.slice(0, environmentIndex + 1)}${optionsBlock}${pipelineXml.slice(environmentIndex + 1)}`;
    }

    const stagesIndex = pipelineXml.indexOf("\n  stages {");
    if (stagesIndex !== -1) {
      return `${pipelineXml.slice(0, stagesIndex + 1)}${optionsBlock}${pipelineXml.slice(stagesIndex + 1)}`;
    }

    return pipelineXml.replace("pipeline {\n", `pipeline {\n${optionsBlock}`);
  }

  private static async getLatestBuildNumberForJob(jobName: string): Promise<number | null> {
    try {
      const jobInfo = await jenkins.job.get(jobName);
      return jobInfo?.lastBuild?.number ?? null;
    } catch {
      return null;
    }
  }

  private static async resolveBuildNumberFromQueue(params: {
    jobName: string;
    queueItemNumber: number | null | undefined;
    fallbackBuildNumber: number;
  }): Promise<number> {
    const { jobName, queueItemNumber, fallbackBuildNumber } = params;

    if (
      typeof queueItemNumber !== "number" ||
      !Number.isFinite(queueItemNumber) ||
      queueItemNumber <= 0
    ) {
      console.warn(
        `[JenkinsService] Queue item id missing for ${jobName}; falling back to expected build #${fallbackBuildNumber}`
      );
      return fallbackBuildNumber;
    }

    const startedAt = Date.now();
    let attempts = 0;

    while (Date.now() - startedAt < this.QUEUE_BUILD_NUMBER_POLL_TIMEOUT_MS) {
      attempts++;

      try {
        const queueItem = (await jenkins.queue.item(queueItemNumber)) as
          | {
              cancelled?: boolean;
              why?: string;
              executable?: { number?: number };
            }
          | undefined;

        const executableBuildNumber = queueItem?.executable?.number;
        if (
          typeof executableBuildNumber === "number" &&
          Number.isFinite(executableBuildNumber) &&
          executableBuildNumber > 0
        ) {
          return executableBuildNumber;
        }

        if (queueItem?.cancelled) {
          throw new Error(
            `Queue item #${queueItemNumber} for ${jobName} was cancelled` +
              (queueItem.why ? `: ${queueItem.why}` : "")
          );
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const lower = message.toLowerCase();
        const isNotFound = lower.includes("404") || lower.includes("not found");
        const isCancelled = lower.includes("was cancelled");

        if (isCancelled) {
          throw error instanceof Error ? error : new Error(message);
        }

        if (isNotFound) {
          const latestBuildNumber = await this.getLatestBuildNumberForJob(jobName);
          if (
            typeof latestBuildNumber === "number" &&
            latestBuildNumber >= fallbackBuildNumber
          ) {
            console.log(
              `[JenkinsService] Queue item #${queueItemNumber} for ${jobName} is no longer available; using latest build #${latestBuildNumber}`
            );
            return latestBuildNumber;
          }
        } else if (attempts % 10 === 0) {
          console.warn(
            `[JenkinsService] Still resolving queue item #${queueItemNumber} for ${jobName}: ${message}`
          );
        }
      }

      await new Promise((resolve) =>
        setTimeout(resolve, this.QUEUE_BUILD_NUMBER_POLL_INTERVAL_MS)
      );
    }

    console.warn(
      `[JenkinsService] Timed out resolving queue item #${queueItemNumber} for ${jobName}; falling back to expected build #${fallbackBuildNumber}`
    );
    return fallbackBuildNumber;
  }

  /**
   * Trigger a build for an existing Jenkins job
   * Used by webhooks for auto-deploy
   * @param appName - The application name
   * @param commitSha - Optional specific commit SHA to checkout
   */
  static async triggerBuild(
    appName: string,
    commitSha?: string,
    gitAuthUrl?: string
  ): Promise<number> {
    if (!process.env.JENKINS_URL) {
      throw new Error("JENKINS_URL not configured");
    }

    const jobName = `${appName}-job`;
    
    console.log(`[JenkinsService] Triggering build for: ${jobName}`);
    if (commitSha) {
      console.log(`[JenkinsService] Target commit: ${commitSha}`);
    }

    try {
      // Check if job exists first
      const exists = await this.jobExists(appName);
      if (!exists) {
        throw new Error(`Job ${jobName} does not exist`);
      }

      // Get the current latest build number BEFORE triggering
      // This ensures we know what the next build number will be
      const currentBuildNumber = await this.getLatestBuildNumber(appName) || 0;
      const expectedBuildNumber = currentBuildNumber + 1;

      // Trigger the build with parameters
      // IMPORTANT: Jobs with parameter definitions MUST use buildWithParameters
      // Passing empty COMMIT_SHA uses branch HEAD (default behavior)
      const buildParams: Record<string, string | boolean> = {
        COMMIT_SHA: commitSha || "",
      };
      if (gitAuthUrl) {
        buildParams.GIT_AUTH_URL = gitAuthUrl;
      }

      const queueItemNumber = await jenkins.job.build({
        name: jobName,
        parameters: buildParams,
      });

      const actualBuildNumber = await this.resolveBuildNumberFromQueue({
        jobName,
        queueItemNumber,
        fallbackBuildNumber: expectedBuildNumber,
      });

      console.log(`[JenkinsService] Build #${actualBuildNumber} triggered for: ${jobName}`);
      console.log(
        `[JenkinsService] Monitor at: ${this.getSafeJenkinsUrl()}/job/${jobName}/${actualBuildNumber}/`
      );

      return actualBuildNumber;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JenkinsService] Error triggering build for ${jobName}:`, errorMessage);
      throw new Error(`Failed to trigger build: ${errorMessage}`);
    }
  }

  /**
   * Create and trigger a Jenkins job
   */
  static async createJob(
    appName: string,
    appId: string,
    githubUrl: string,
    branch: string,
    framework?: string,
    size: string = 'small',
    deployTrigger: 'manual' | 'webhook' | 'rollback' = 'manual',
    envVars: Array<{ key: string; value: string }> = [],
    containerPort?: number,
    gitAuthUrl?: string
  ): Promise<void> {
    if (!process.env.JENKINS_URL) {
      throw new Error("JENKINS_URL not configured");
    }

    const jobName = `${appName}-job`;
    
    console.log(`[JenkinsService] Creating job: ${jobName}`);
    console.log(`[JenkinsService] Framework: ${framework || 'default'}, Branch: ${branch}`);
    console.log(`[JenkinsService] Environment variables: ${envVars.length}`);
    if (containerPort) {
      console.log(`[JenkinsService] Container port: ${containerPort}`);
    }

    const cleanGitUrl = this.sanitizeGitUrl(githubUrl);

    // Select pipeline based on framework
    const pipelineRaw = JenkinsService.selectPipeline(
      appName,
      appId,
      cleanGitUrl,
      branch,
      framework,
      size,
      deployTrigger,
      envVars,
      containerPort
    );
    const pipeline = this.hardenPipelineXml(pipelineRaw);

    // Upsert: update existing job config first, create only if it doesn't exist yet.
    // This ensures every redeploy picks up the latest pipeline template.
    try {
      await jenkins.job.config(jobName, pipeline);
      console.log(`[JenkinsService] Updated existing Jenkins job config: ${jobName}`);
    } catch (updateError: unknown) {
      const updateMessage = updateError instanceof Error ? updateError.message : String(updateError);
      const is404 =
        updateMessage.includes('404') ||
        updateMessage.toLowerCase().includes('not found') ||
        updateMessage.toLowerCase().includes('does not exist');

      if (!is404) {
        console.error(`[JenkinsService] Failed to update job:`, updateMessage);
        throw new Error(`Jenkins job update failed: ${updateMessage}`);
      }

      // Job doesn't exist yet — create it
      try {
        await jenkins.job.create(jobName, pipeline);
        console.log(`[JenkinsService] Created Jenkins job: ${jobName}`);
      } catch (createError: unknown) {
        const createMessage = createError instanceof Error ? createError.message : String(createError);
        // Race-safe: if job was created between our check and create, update config
        try {
          await jenkins.job.config(jobName, pipeline);
          console.log(`[JenkinsService] Job config set after create race: ${jobName}`);
        } catch {
          throw new Error(`Jenkins job creation failed: ${createMessage}`);
        }
      }
    }

    // Trigger build immediately (job creation might need a moment, hence the small delay)
    // Using Promise instead of setTimeout to ensure it completes
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      // Use buildWithParameters for jobs that have parameter definitions
      // Pass empty COMMIT_SHA to use branch HEAD (default behavior)
      await jenkins.job.build({
        name: jobName,
        parameters: {
          COMMIT_SHA: '',
          ...(gitAuthUrl ? { GIT_AUTH_URL: gitAuthUrl } : {}),
        }
      });
      console.log(`[JenkinsService] Build #1 triggered for: ${jobName}`);
      console.log(`[JenkinsService] Monitor at: ${this.getSafeJenkinsUrl()}/job/${jobName}/`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JenkinsService] Error triggering build:`, errorMessage);
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
    const pipeline = this.injectBuildRetentionOptions(
      createDeletePipeline(appName, APP_DOMAIN)
    );

    // Create the job
    try {
      await jenkins.job.create(jobName, pipeline);
      console.log(`[JenkinsService] Created Jenkins deletion job: ${jobName}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JenkinsService] Failed to create deletion job:`, errorMessage);
      throw new Error(`Jenkins deletion job creation failed: ${errorMessage}`);
    }

    // Trigger build immediately
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      await jenkins.job.build(jobName);
      console.log(`[JenkinsService] Build triggered for deletion job: ${jobName}`);
      console.log(`[JenkinsService] Monitor at: ${this.getSafeJenkinsUrl()}/job/${jobName}/`);
      
      // Wait a bit for the build to be registered in Jenkins
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get the actual build number
      const buildNumber = await this.getLatestDeleteBuildNumber(appName);
      if (buildNumber) {
        console.log(`[JenkinsService] Build #${buildNumber} confirmed for deletion job: ${jobName}`);
        return buildNumber;
      } else {
        // Fallback to build #1 if we can't get the build number
        console.log(`[JenkinsService]  Could not get build number, using fallback #1 for: ${jobName}`);
        return 1;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JenkinsService] Error triggering deletion build:`, errorMessage);
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
    
    console.log(`[JenkinsService] Deleted Jenkins job: ${jobName}`);
  }

  /**
   * Delete a Jenkins deletion job
   */
  static async deleteDeleteJob(appName: string): Promise<void> {
    const jobName = `${appName}-delete-job`;
    
    console.log(`[JenkinsService] Deleting deletion job: ${jobName}`);
    
    await jenkins.job.destroy(jobName);
    
    console.log(`[JenkinsService] Deleted Jenkins deletion job: ${jobName}`);
  }

  /**
   * Delete a Jenkins resize job
   */
  static async deleteResizeJob(appName: string): Promise<void> {
    const jobName = this.getResizeJobName(appName);

    console.log(`[JenkinsService] Deleting resize job: ${jobName}`);

    await jenkins.job.destroy(jobName);

    console.log(`[JenkinsService] Deleted Jenkins resize job: ${jobName}`);
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
   * Get build logs (all stages).
   * Returns progressive log text plus Jenkins metadata:
   *   - nextStart: the actual byte offset for the next request (from X-Text-Size header)
   *   - more: whether Jenkins has more data ready right now (X-More-Data header)
   */
  static async getBuildLog(
    appName: string,
    buildNumber: number,
    start = 0,
  ): Promise<{ text: string; more: boolean; nextStart: number }> {
    const jobName = `${appName}-job`;

    try {
      const data = await jenkins.build.log(jobName, buildNumber, {
        start,
        type: 'text',
        meta: true,
      }) as { text: string; more: boolean; size?: string };

      const rawText = data.text ?? '';
      const more = data.more === true;
      // X-Text-Size is the byte offset Jenkins expects on the next request.
      // Prefer it over character count so multi-byte characters don't drift.
      const nextStart = data.size != null ? parseInt(data.size, 10) : start + rawText.length;

      // Sanitise before sending to the browser — strips internal infra details
      // and security-sensitive stack information.
      const text = this.sanitizeRawBuildLogs(rawText);

      return { text, more, nextStart };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JenkinsService] Error getting build log:`, errorMessage);
      throw error;
    }
  }

  /**
   * Get deployment logs only using Jenkins Blue Ocean API (stage-specific logs)
   * Falls back to filtering if Blue Ocean is not available
   */
  static async getDeploymentLog(appName: string, buildNumber: number): Promise<string> {
    const jobName = `${appName}-job`;
    
    try {
      // Try Blue Ocean API first for stage-specific logs
      const stageLog = await this.getStageLogFromBlueOcean(jobName, buildNumber, ['Deploy to Kubernetes', 'Verify Deployment']);
      if (stageLog) {
        console.log(`[JenkinsService] Using Blue Ocean logs (filtered)`);
        return stageLog;
      }
      
      // Fallback: get full log and filter (if Blue Ocean not available)
      console.log(`[JenkinsService] Blue Ocean API not available, using fallback filter`);
      const fullLog = await jenkins.build.log(jobName, buildNumber, { type: 'text' });
      console.log(`[JenkinsService] Raw log length: ${fullLog.length}, applying filter...`);
      const filtered = this.filterDeploymentLogs(fullLog);
      console.log(`[JenkinsService] Filtered log length: ${filtered.length}`);
      return filtered;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JenkinsService] Error getting deployment log:`, errorMessage);
      throw error;
    }
  }

  /**
   * Get logs for specific stages using Jenkins Blue Ocean REST API
   * Blue Ocean API: /blue/rest/organizations/jenkins/pipelines/{job}/runs/{build}/nodes/
   */
  private static async getStageLogFromBlueOcean(
    jobName: string, 
    buildNumber: number, 
    stageNames: string[]
  ): Promise<string | null> {
    const jenkinsUrl = process.env.JENKINS_URL;
    if (!jenkinsUrl) return null;

    try {
      // Strip credentials from URL (fetch doesn't allow credentials in URL)
      const cleanUrl = jenkinsUrl.replace(/https?:\/\/[^:]+:[^@]+@/, (match) => {
        return match.startsWith('https') ? 'https://' : 'http://';
      });
      
      // Get pipeline nodes (stages) from Blue Ocean API
      const nodesUrl = `${cleanUrl}/blue/rest/organizations/jenkins/pipelines/${jobName}/runs/${buildNumber}/nodes/`;
      const nodesResponse = await fetch(nodesUrl, {
        headers: this.getAuthHeaders(),
      });

      if (!nodesResponse.ok) {
        console.log(`[JenkinsService] Blue Ocean API returned ${nodesResponse.status}`);
        return null;
      }

      const nodes = await nodesResponse.json() as Array<{
        id: string;
        displayName: string;
        result: string;
        state: string;
      }>;

      // Find the deployment-related stages
      const deploymentStages = nodes.filter(node => 
        stageNames.some(name => node.displayName.includes(name))
      );

      if (deploymentStages.length === 0) {
        return null;
      }

      // Fetch logs for each deployment stage
      const stageLogs: string[] = [];
      for (const stage of deploymentStages) {
        const logUrl = `${cleanUrl}/blue/rest/organizations/jenkins/pipelines/${jobName}/runs/${buildNumber}/nodes/${stage.id}/log/`;
        const logResponse = await fetch(logUrl, {
          headers: this.getAuthHeaders(),
        });

        if (logResponse.ok) {
          const logText = await logResponse.text();
          stageLogs.push(`=== ${stage.displayName} ===\n${logText}`);
        }
      }

      if (stageLogs.length === 0) {
        return null;
      }

      // Filter the Blue Ocean logs too
      return this.filterDeploymentLogs(stageLogs.join('\n\n'));
    } catch (error) {
      console.log(`[JenkinsService] Blue Ocean API error:`, error);
      return null;
    }
  }

  /**
   * Get authentication headers for Jenkins API calls
   */
  private static getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    // Extract credentials from JENKINS_URL if present (format: http://user:pass@host)
    const jenkinsUrl = process.env.JENKINS_URL || '';
    const urlMatch = jenkinsUrl.match(/https?:\/\/([^:]+):([^@]+)@/);
    if (urlMatch) {
      const [, username, password] = urlMatch;
      const auth = Buffer.from(`${username}:${password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    return headers;
  }

  /**
   * Filter logs to show only deployment-related content (fallback method)
   */
  /**
   * Filter deployment logs - SIMPLE APPROACH
   * 
   * PRINCIPLES:
   * 1. Pass through ALL original log content
   * 2. Only HIDE sensitive/infrastructure details
   * 3. Clean up Jenkins markers and ANSI codes
   * 4. NO pattern matching for stages - just blocklist filtering
   * 
   * HIDDEN:
   * - Jenkins internal markers ([Pipeline], [8mha:, etc.)
   * - Kubernetes internal names (deployment.apps/, service/, ingress/)
   * 
   * SIMPLIFIED APPROACH - Framework Agnostic:
   * Only filter Jenkins internal noise that appears in ALL pipelines.
   * Pipeline authors control what users see via echo statements.
   * No need to update when adding new frameworks/pipelines.
   */
  /**
   * Stages the user should see in both live and archived logs.
   * Any stage not in this set (Security/*, and anything added in future) is
   * silently dropped at the section boundary — no regex needed.
   */
  private static readonly VISIBLE_STAGES = new Set([
    'Initialize',
    'Checkout Repository',
    'Validate Prerequisites',
    'Detect Project Type',
    'Inspect Files',
    'Validate Structure',
    'Prepare Dockerfile',
    'Validate Dockerfile',
    'Create Environment Secret',
    'Build Docker Image',
    'Deploy to Kubernetes',
    'Verify Deployment',
    'Verify Deletion',
    'Verify Environment Secret',
    'Delete Kubernetes Resources',
  ]);

  /**
   * Per-line cleanup applied only inside user-visible sections.
   * Security tool output is excluded at the section level, so this list covers
   * only noise that leaks within user-facing stages (credentials, Jenkins engine
   * lines, Kaniko internals, Dockerfile directives, git progress).
   */
  private static readonly LINE_BLOCK_PATTERNS: RegExp[] = [
    // Jenkins pipeline engine
    /^\[Pipeline\]/,
    /^\[PodInfo\]/,
    /^Started by user/,
    /^Created Pod:/,
    /^Agent .* is provisioned/,
    /^Running on .* in \/home\/jenkins/,
    /^\*{8,}/,
    /^Masking supported pattern/,
    // Credentials / tokens
    /JENKINS_(SECRET|AGENT|URL|NAME|WEB_SOCKET)/,
    /REMOTING_OPTS/,
    /withCredentials/,
    /AUTH=/,
    /\$DOCKER_PASS/,
    /\$KUBECONFIG/,
    /gh[op]_[a-zA-Z0-9]{20,}/,
    // Shell set -x echo prefix
    /^\+ /,
    // HTML error pages
    /^<[!a-zA-Z\/]/,
    // Build result line (shown via banner instead)
    /^Finished: (SUCCESS|FAILURE|ABORTED)$/,
    // Webhook curl noise within Deploy stage
    /^Sending deployment record/,
    /^Payload:/,
    /^Response \(HTTP/,
    /%\{http_code\}/,
    /-X POST.*webhook/,
    /^'\d{3}'$/,
    /^\d{3}'$/,
    /^'$/,
    // MiB/KiB progress bars
    /^\d+\.\d+ (MiB|KiB) \/ \d+\.\d+ (MiB|KiB)/,
    // npm noise within Build stage
    /^npm notice/,
    /^npm warn config only/,
    /^\d+ packages are looking for funding/,
    /^run `npm fund` for details/,
    // Kaniko internals within Build Docker Image
    /^Retrieving image /,
    /^Returning cached image manifest/,
    /^Built cross stage deps:/,
    /^Executing \d+ build triggers/,
    /^Checking for cached layer /,
    /^No cached layer found for cmd /,
    /^Unpacking rootfs/,
    /^Taking snapshot of files/,
    /^Resolving srcs \[/,
    /^Cmd: (workdir|\/bin\/sh|EXPOSE)$/,
    /^Args: \[/,
    /^Running: \[/,
    /^Changed working directory to /,
    /^Creating directory .* with uid /,
    /^No files changed in this command/,
    /^Adding exposed port:/,
    /^Pushing layer /,
    /^Pushing image to .*-cache[:/]/,
    /^Pushed .*@sha256:/,
    /^Resolved base name .* to /,
    /^Building stage '.*' \[idx:/,
    /^Using caching version of cmd:/,
    /^Found cached layer/,
    // Dockerfile directive echoes from Kaniko
    /^FROM /,
    /^WORKDIR /,
    /^ARG /,
    /^ENV /,
    /^USER /,
    /^HEALTHCHECK/,
    /^ENTRYPOINT/,
    /^COPY --from=/,
    /^RUN (if \[|corepack|addgroup|adduser|mkdir -p )/,
    /^# ---/,
    // Git clone progress
    /^Updating files:\s+\d+%/,
    /^remote: (Counting|Compressing|Enumerating) objects:/,
    /^Receiving objects:\s+\d+%/,
    /^Resolving deltas:\s+\d+%/,
    // Section banner lines (=====) used in Prepare Dockerfile and similar stages
    /^={10,}$/,
    // PIPELINE: type label lines within sections (e.g. "PIPELINE: Express Deployment Pipeline")
    /^PIPELINE:/,
    // BuildKit noise — only user build steps (#N [X/Y] ...) and CACHED survive.
    // Filters: internal ops, auth tokens, layer hash progress, timing, push/export/cache ops.
    /^#\d+ \[(?:internal|auth)\]/,
    /^#\d+ (?:sha256:|extracting |exporting |pushing |writing |sending |preparing |importing |inferred |transferring |resolve |DONE \d|\.{3}$)/,
  ];

  /**
   * Shared helper: trim the line and strip the Kaniko INFO[XXXX] timestamp prefix.
   * Called by both filter functions so they operate on identical normalised input.
   */
  private static normalizeLine(raw: string): string {
    return raw.trim().replace(/^INFO\[\d+\]\s*/, '');
  }

  /**
   * Shared helper: apply k8s / Docker username transforms to a display line.
   */
  private static transformLine(line: string): string {
    return line
      .replace('STAGE: ', '[STAGE] ')
      .replace(/hav0ky\//g, '')
      .replace(/deployment\.apps\//g, '')
      .replace(/service\//g, '')
      .replace(/ingress\.networking\.k8s\.io\//g, '')
      .replace(/certificate\.cert-manager\.io\//g, '');
  }

  /**
   * Shared stateful check: are we inside a Dockerfile dump that should be hidden?
   *
   * Returns the UPDATED flag value.  Call this BEFORE the block-list check.
   * If the returned value is true the caller should `continue` (skip the line).
   * If the line is an end-marker the flag is reset to false and the line is shown.
   */
  private static updateDockerfileSkip(trimmed: string, skip: boolean): { skip: boolean; hide: boolean } {
    if (skip) {
      // End markers: resume showing output
      if (
        /^Detected /.test(trimmed) ||
        trimmed === 'Dockerfile preparation completed' ||
        trimmed === 'Checking for build-time ARG instructions...'  // generic-docker: ARG analysis follows dump
      ) {
        return { skip: false, hide: false }; // show this line, stop skipping
      }
      return { skip: true, hide: true };
    }
    // Start markers for existing Dockerfile dump
    if (trimmed === 'Dockerfile contents:') return { skip: true, hide: true };
    // Start marker for generated Dockerfile dump (followed immediately by Dockerfile text)
    if (/^Package manager: .+ \(will be passed as build arg\)/.test(trimmed)) return { skip: true, hide: true };
    return { skip: false, hide: false };
  }

  /**
   * Split a cleaned log string into sections at STAGE:/PIPELINE: boundaries.
   * Lines before the first marker are discarded — that is where pod bootstrap YAML lives.
   */
  private static parseSections(cleanLog: string) {
    const sections: Array<{ type: 'STAGE' | 'PIPELINE'; name: string; lines: string[] }> = [];
    let current: (typeof sections)[number] | null = null;

    for (const line of cleanLog.split('\n')) {
      const trimmed = JenkinsService.normalizeLine(line);
      // Only STAGE: lines and the three terminal PIPELINE: markers are section boundaries.
      // Other PIPELINE: lines (e.g. "PIPELINE: Express Deployment Pipeline") stay inside
      // the current section so their content (App Name, Branch, etc.) is shown to the user.
      const stageMatch = trimmed.match(/^STAGE:\s+(.+)$/);
      const terminalMatch = trimmed.match(/^PIPELINE:\s+(Success|Failure|Cleanup)$/);
      if (stageMatch) {
        current = { type: 'STAGE', name: stageMatch[1].trim(), lines: [] };
        sections.push(current);
      } else if (terminalMatch) {
        current = { type: 'PIPELINE', name: terminalMatch[1].trim(), lines: [] };
        sections.push(current);
      } else if (current) {
        current.lines.push(line);
      }
    }
    return sections;
  }

  /**
   * Per-line cleanup applied only inside user-visible sections.
   * Security tool output never reaches here — excluded at the section level.
   */
  private static filterSectionLines(lines: string[]): string[] {
    const out: string[] = [];
    let skipDockerfile = false;
    // BuildKit repeats the step header (#N [X/Y] step) each time it has a progress
    // update. After stripping the noise lines in between, only the first occurrence matters.
    const seenBuildkitSteps = new Set<string>();

    for (const line of lines) {
      const trimmed = JenkinsService.normalizeLine(line);

      const df = JenkinsService.updateDockerfileSkip(trimmed, skipDockerfile);
      skipDockerfile = df.skip;
      if (df.hide) continue;

      if (!trimmed) {
        if (out.length > 0 && out[out.length - 1] !== '') out.push('');
        continue;
      }

      if (JenkinsService.LINE_BLOCK_PATTERNS.some((p: RegExp) => p.test(trimmed))) continue;

      // Deduplicate repeated BuildKit step headers
      if (/^#\d+ \[\d+\/\d+\] /.test(trimmed)) {
        if (seenBuildkitSteps.has(trimmed)) continue;
        seenBuildkitSteps.add(trimmed);
      }

      out.push(JenkinsService.transformLine(trimmed));
    }
    return out;
  }

  /** Live build view — same section-based logic as archived logs. */
  private static sanitizeRawBuildLogs(raw: string): string {
    const cleanLog = raw
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/ha:\/\/\/\/[A-Za-z0-9+/=]+/g, '')
      .replace(/\r/g, '')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

    const out: string[] = [];
    for (const section of JenkinsService.parseSections(cleanLog)) {
      if (section.type === 'PIPELINE') continue;
      if (!JenkinsService.VISIBLE_STAGES.has(section.name)) continue;
      out.push(`[STAGE] ${section.name}`);
      out.push(...JenkinsService.filterSectionLines(section.lines));
      if (out[out.length - 1] !== '') out.push('');
    }
    return out.filter((l, i, arr) => !(l === '' && i > 0 && arr[i - 1] === '')).join('\n');
  }

  /** Archived log view — identical section logic, plus final status banner. */
  private static filterDeploymentLogs(fullLog: string): string {
    const cleanLog = fullLog
      .replace(/ha:\/\/\/\/[A-Za-z0-9+/=]+/g, '')
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/\r/g, '')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

    const out: string[] = [];
    let domain = '';
    let isFinalSuccess = false;
    let isFinalFailure = false;

    for (const section of JenkinsService.parseSections(cleanLog)) {
      if (section.type === 'PIPELINE') {
        if (section.name === 'Success') {
          isFinalSuccess = true;
          for (const line of section.lines) {
            const m = JenkinsService.normalizeLine(line).match(/(?:Domain|Service URL):\s*(?:https?:\/\/)?(\S+)/);
            if (m) domain = m[1];
          }
        } else if (section.name === 'Failure') {
          isFinalFailure = true;
        }
        continue;
      }

      if (!JenkinsService.VISIBLE_STAGES.has(section.name)) continue;

      out.push(`[STAGE] ${section.name}`);
      out.push(...JenkinsService.filterSectionLines(section.lines));
      if (out[out.length - 1] !== '') out.push('');
    }

    if (isFinalSuccess) {
      out.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      out.push('DEPLOYMENT SUCCESSFUL');
      if (domain) out.push(`URL: https://${domain}`);
      out.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } else if (isFinalFailure) {
      out.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      out.push('DEPLOYMENT FAILED');
      out.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    return out
      .filter((l, i, arr) => !(l === '' && i > 0 && arr[i - 1] === ''))
      .join('\n').trim() || 'Build in progress...';
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

  // ─── Resize Job (separate from main app job) ───────────────────────────

  /**
   * Get the resize job name for an app.
   */
  static getResizeJobName(appName: string): string {
    return `${appName}-resize-job`;
  }

  /**
   * Ensure the resize Jenkins job exists with the correct pipeline config.
   * Uses upsert pattern: update first, create if 404.
   */
  static async ensureResizeJob(
    appName: string,
    appId: string,
    size: string,
    envVars: Array<{ key: string; value: string }> = [],
    containerPort?: number,
    framework?: string | null,
    operationId?: string,
  ): Promise<void> {
    if (!process.env.JENKINS_URL) {
      throw new Error("JENKINS_URL not configured");
    }

    const jobName = this.getResizeJobName(appName);
    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || process.env.DOMAIN || '';
    const deploymentRecordSecret = process.env.JENKINS_DEPLOYMENT_RECORD_SECRET || '';

    const pipeline = this.injectBuildRetentionOptions(
      createResizePipeline(
        appName,
        size,
        appId,
        webhookBaseUrl,
        deploymentRecordSecret,
        envVars,
        containerPort,
        framework,
        operationId ?? '',
      )
    );

    console.log(`[JenkinsService] Ensuring resize job: ${jobName} (size: ${size})`);

    // 1) Try updating existing job config
    try {
      await jenkins.job.config(jobName, pipeline);
      console.log(`[JenkinsService] Resize job config updated: ${jobName}`);
      return;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const is404 =
        message.includes('404') ||
        message.toLowerCase().includes('not found') ||
        message.toLowerCase().includes('does not exist');
      if (!is404) {
        throw new Error(`Failed to update resize job ${jobName}: ${message}`);
      }
    }

    // 2) Create if missing
    try {
      await jenkins.job.create(jobName, pipeline);
      console.log(`[JenkinsService] Resize job created: ${jobName}`);
    } catch (createError: unknown) {
      const createMessage = createError instanceof Error ? createError.message : String(createError);

      // Race-safe: if job was created between our check and create, update config
      try {
        await jenkins.job.config(jobName, pipeline);
        console.log(`[JenkinsService] Resize job config set after create race: ${jobName}`);
        return;
      } catch {
        // ignore – throw original create error below
      }

      throw new Error(`Failed to create resize job ${jobName}: ${createMessage}`);
    }
  }

  /**
   * Trigger a resize job build and return the build number.
   */
  static async triggerResizeBuild(appName: string): Promise<number> {
    const jobName = this.getResizeJobName(appName);

    console.log(`[JenkinsService] Triggering resize build for: ${jobName}`);

    const currentBuildNumber = await this.getResizeLatestBuildNumber(appName) || 0;
    const expectedBuildNumber = currentBuildNumber + 1;

    const queueItemNumber = await jenkins.job.build(jobName);
    const actualBuildNumber = await this.resolveBuildNumberFromQueue({
      jobName,
      queueItemNumber,
      fallbackBuildNumber: expectedBuildNumber,
    });

    console.log(`[JenkinsService] Resize build #${actualBuildNumber} triggered for: ${jobName}`);
    console.log(
      `[JenkinsService] Monitor at: ${this.getSafeJenkinsUrl()}/job/${jobName}/${actualBuildNumber}/`
    );

    return actualBuildNumber;
  }

  /**
   * Get the latest build number for a resize job.
   */
  static async getResizeLatestBuildNumber(appName: string): Promise<number | null> {
    const jobName = this.getResizeJobName(appName);
    try {
      const info = await jenkins.job.get(jobName);
      return info.lastBuild?.number ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Check build status for a resize job.
   */
  static async checkResizeBuildStatus(appName: string, buildNumber: number): Promise<{
    building: boolean;
    result: 'SUCCESS' | 'FAILURE' | 'ABORTED' | 'UNSTABLE' | null;
    status: 'running' | 'failed' | 'building';
  }> {
    const jobName = this.getResizeJobName(appName);

    try {
      const buildInfo = await jenkins.build.get(jobName, buildNumber);

      let status: 'running' | 'failed' | 'building' = 'building';
      if (!buildInfo.building) {
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
      console.error(`[JenkinsService] Error checking resize build status:`, errorMessage);
      if (errorMessage.includes('404') || errorMessage.includes('not found') || errorObj.statusCode === 404) {
        const notFoundError = new Error(`Build #${buildNumber} not found for ${jobName}`) as Error & { notFound: boolean };
        notFoundError.notFound = true;
        throw notFoundError;
      }
      throw error;
    }
  }

  /**
   * Get deployment log for a resize job.
   */
  static async getResizeDeploymentLog(appName: string, buildNumber: number): Promise<string> {
    const jobName = this.getResizeJobName(appName);

    try {
      const fullLog = await jenkins.build.log(jobName, buildNumber, { type: 'text' });
      console.log(`[JenkinsService] Resize log length: ${fullLog.length}`);
      return this.filterDeploymentLogs(fullLog);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[JenkinsService] Error getting resize deployment log:`, errorMessage);
      throw error;
    }
  }

  /**
   * Select appropriate pipeline based on framework
   */
  private static selectPipeline(
    appName: string,
    appId: string,
    githubUrl: string,
    branch: string,
    framework?: string,
    size: string = 'small',
    deployTrigger: 'manual' | 'webhook' | 'rollback' = 'manual',
    envVars: Array<{ key: string; value: string }> = [],
    containerPort?: number
  ): string {
    const fw = framework?.toLowerCase();
    
    // WEBHOOK_BASE_URL (ngrok / tunnel) takes priority in dev; DOMAIN is the production fallback
    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || process.env.DOMAIN || '';
    const deploymentRecordSecret = process.env.JENKINS_DEPLOYMENT_RECORD_SECRET || '';

    switch (fw) {
      case 'simple-test':
      case 'test':
        console.log(`[JenkinsService] Using SIMPLE TEST pipeline (no Docker/K8s)`);
        return createSimpleTestPipeline(appName, githubUrl, branch);

      case 'dockerfile':
      case 'custom':
        console.log(`[JenkinsService] Using GENERIC DOCKERFILE pipeline (existing Dockerfile)`);
        return createDockerfilePipeline(appName, githubUrl, branch, size, APP_DOMAIN, appId, webhookBaseUrl, deploymentRecordSecret, deployTrigger, envVars, containerPort);

      case 'java':
      case 'maven':
      case 'spring':
      case 'spring-boot':
      case 'springboot':
        console.log(`[JenkinsService] Using JAVA/MAVEN pipeline (auto-Dockerfile with Maven build)`);
        return createJavaPipeline(appName, githubUrl, branch, size, APP_DOMAIN, appId, webhookBaseUrl, deploymentRecordSecret, deployTrigger, envVars, containerPort);

      case 'express':
      case 'express.js':
        console.log(`[JenkinsService] Using EXPRESS pipeline (auto-Dockerfile)`);
        return createExpressPipeline(appName, githubUrl, branch, size, APP_DOMAIN, appId, webhookBaseUrl, deploymentRecordSecret, deployTrigger, envVars, containerPort);

      case 'python':
      case 'django':
      case 'flask':
      case 'fastapi':
        console.log(`[JenkinsService] Using PYTHON pipeline`);
        return createPythonPipeline(appName, githubUrl, branch, size, APP_DOMAIN, appId, webhookBaseUrl, deploymentRecordSecret, deployTrigger, envVars, containerPort);

      case 'nextjs':
      case 'next.js':
        console.log(`[JenkinsService] Using NEXT.JS pipeline (auto-Dockerfile with standalone support)`);
        return createNextJsPipeline(appName, githubUrl, branch, size, APP_DOMAIN, appId, webhookBaseUrl, deploymentRecordSecret, deployTrigger, envVars, containerPort);

      case 'nuxtjs':
      case 'nuxt.js':
      case 'nuxt':
        console.log(`[JenkinsService] Using NUXT.JS pipeline (auto-Dockerfile with Nitro server)`);
        return createNuxtJsPipeline(appName, githubUrl, branch, size, APP_DOMAIN, appId, webhookBaseUrl, deploymentRecordSecret, deployTrigger, envVars, containerPort);

      case 'vite-react':
      case 'vitereact':
      case 'react-vite':
        console.log(`[JenkinsService] Using VITE-REACT pipeline (auto-Dockerfile with Vite build)`);
        return createViteReactPipeline(appName, githubUrl, branch, size, APP_DOMAIN, appId, webhookBaseUrl, deploymentRecordSecret, deployTrigger, envVars, containerPort);

      case 'vue':
      case 'vue.js':
      case 'vuejs':
        console.log(`[JenkinsService] Using VUE pipeline (auto-Dockerfile with Vite build)`);
        return createVuePipeline(appName, githubUrl, branch, size, APP_DOMAIN, appId, webhookBaseUrl, deploymentRecordSecret, deployTrigger, envVars, containerPort);

      case 'angular':
        console.log(`[JenkinsService] Using ANGULAR pipeline (auto-Dockerfile with Angular CLI)`);
        return createAngularPipeline(appName, githubUrl, branch, size, APP_DOMAIN, appId, webhookBaseUrl, deploymentRecordSecret, deployTrigger, envVars, containerPort);

      case 'sveltekit':
        console.log(`[JenkinsService] Using SVELTEKIT pipeline (auto-Dockerfile with Node adapter)`);
        return createSvelteKitPipeline(appName, githubUrl, branch, size, APP_DOMAIN, appId, webhookBaseUrl, deploymentRecordSecret, deployTrigger, envVars, containerPort);

      case 'nodejs':
      case 'node.js':
      case 'node':
      case 'react': // Standard React (CRA) - requires Dockerfile
      default:
        console.log(`[JenkinsService] Using NODE.JS pipeline (requires Dockerfile)`);
        return createNodeJsPipeline(appName, githubUrl, branch, size, APP_DOMAIN, appId, webhookBaseUrl, deploymentRecordSecret, deployTrigger, envVars, containerPort);
    }
  }

  /**
   * Update an existing Jenkins job configuration with new parameters
   * Used by auto-deploy to refresh the Git URL with fresh access token
   */
  static async updateJobConfig(
    appName: string,
    appId: string,
    githubUrl: string,
    branch: string,
    framework?: string,
    size: string = 'small',
    deployTrigger: 'manual' | 'webhook' | 'rollback' = 'webhook',
    envVars: Array<{ key: string; value: string }> = [],
    containerPort?: number
  ): Promise<void> {
    if (!process.env.JENKINS_URL) {
      throw new Error("JENKINS_URL not configured");
    }

    const jobName = `${appName}-job`;
    const cleanGitUrl = this.sanitizeGitUrl(githubUrl);
    
    console.log(`[JenkinsService] Updating job config: ${jobName}`);
    console.log(`[JenkinsService] New Git URL: ${cleanGitUrl}`);
    console.log(`[JenkinsService] Size: ${size}, EnvVars: ${envVars.length}`);
    if (containerPort) {
      console.log(`[JenkinsService] Container port: ${containerPort}`);
    }

    // Generate new pipeline with updated config
    const pipelineRaw = JenkinsService.selectPipeline(
      appName,
      appId,
      cleanGitUrl,
      branch, 
      framework, 
      size,
      deployTrigger,
      envVars,
      containerPort
    );
    const pipeline = this.hardenPipelineXml(pipelineRaw);

    try {
      // Update the job configuration using Jenkins API
      await jenkins.job.config(jobName, pipeline);
      console.log(`[JenkinsService] Job config updated: ${jobName}`);
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
