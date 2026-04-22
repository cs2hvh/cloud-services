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

export class JenkinsService {
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

    xml = xml.replace(
      /git clone --branch ([^\s]+) ([^\s]+) \./g,
      (_match, branchArg: string, repoUrl: string) => {
        const safeRepoUrl = repoUrl.replace(/"/g, '\\"');
        return [
          `REPO_URL="${'$'}{GIT_AUTH_URL:-${safeRepoUrl}}"`,
          "set +x",
          `git clone --branch ${branchArg} "$REPO_URL" .`,
          "set -x",
        ].join("\n              ");
      }
    );

    return xml;
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

      await jenkins.job.build({
        name: jobName,
        parameters: buildParams,
      });
      
      console.log(`[JenkinsService] Build #${expectedBuildNumber} triggered for: ${jobName}`);
      console.log(`[JenkinsService] Monitor at: ${this.getSafeJenkinsUrl()}/job/${jobName}/${expectedBuildNumber}/`);
      
      return expectedBuildNumber;
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
    const pipeline = createDeletePipeline(appName, APP_DOMAIN);

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

      const text = data.text ?? '';
      const more = data.more === true;
      // X-Text-Size is the byte offset Jenkins expects on the next request.
      // Prefer it over character count so multi-byte characters don't drift.
      const nextStart = data.size != null ? parseInt(data.size, 10) : start + text.length;

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
  private static filterDeploymentLogs(fullLog: string): string {
    // Step 1: Clean Jenkins encoding artifacts (universal across all pipelines)
    const cleanLog = fullLog
      .replace(/ha:\/\/\/\/[A-Za-z0-9+/=]+/g, '')           // Jenkins hash markers
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')                // ANSI escape
      .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')              // Unicode ANSI
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');        // Control chars

    const lines = cleanLog.split('\n');
    const outputLines: string[] = [];
    
    // Track state for final banner
    let domain = '';
    let isFinalSuccess = false;
    let isFinalFailure = false;

    // Universal blocklist - ONLY Jenkins internal noise (not framework specific)
    // These patterns are generated by Jenkins itself, not pipeline scripts
    const blockPatterns = [
      // Jenkins pipeline engine markers
      /^\[Pipeline\]/,
      /^\[PodInfo\]/,
      /^Started by user/,
      /^Created Pod:/,
      /^Agent .* is provisioned/,
      /^Running on .* in \/home\/jenkins/,
      /^\*{8,}/,                          // Masked credentials ********
      /^Masking supported pattern/,
      
      // Kubernetes pod template YAML (always generated by k8s plugin)
      /^(apiVersion|kind|metadata|spec|containers|volumes|initContainers|nodeSelector):/,
      /^(dnsConfig|dnsPolicy|hostNetwork|restartPolicy|activeDeadlineSeconds):/,
      /^(labels|annotations|namespace|nameservers|buildUrl|runUrl|label):/,
      /^(imagePullPolicy|resources|limits|requests|volumeMounts|mountPath):/,
      /^(workingDir|tty|env|readOnly|medium|memory|cpu|value):/,
      /^- (name|command|mountPath|emptyDir)/i,  // YAML array items
      /^- ".*"$/,                          // YAML array strings
      /^---$/,
      /^kubernetes\.io\//,
      
      // Pod template name/label lines (jenkins job names, workspace volumes)
      /^jenkins(\/|:)/,                    // jenkins: "slave", jenkins/label:, jenkins/label-digest:
      /^name:.*(-job-|workspace|jenkins)/i,
      /^name: "(git|kaniko|kubectl|trivy|jnlp)"$/,  // Container names
      
      // Jenkins agent environment variables
      /JENKINS_(SECRET|AGENT|URL|NAME|WEB_SOCKET)/,
      /REMOTING_OPTS/,
      /withCredentials/,
      /kubernetes\.jenkins\.io/,
      
      // Container images (internal)
      /gcr\.io\/kaniko-project/,
      /jenkins\/inbound-agent/,
      /alpine\/(git|k8s)/,
      /\/jenkins-agent/,
      /agent\.jar/,
      
      // Pod status messages
      /Container \[.*\] .* waiting/,
      /Pod \[Pending\]/,
      /\[Containers(NotReady|NotInitialized)\]/,
      /\[PodInitializing\]/,
      
      // Shell echo commands (we show the output, not the command)
      /^\+ echo /,
      // Other shell prefixes
      /^\+ (?!.*STAGE:)/,
      
      // Credentials
      /AUTH=/,
      /\$DOCKER_PASS/,
      /\$KUBECONFIG/,
      /gh[op]_[a-zA-Z0-9]+/,              // GitHub tokens
      
      // HTML error pages
      /^<[!a-zA-Z\/]/,
      
      // Response codes from webhooks
      /^'\d{3}'$/,
      /^\d{3}'$/,                          // 404' without leading quote
      /^'$/,                               // Stray single quote
      
      // Progress bars
      /^\d+\.\d+ MiB \/ \d+\.\d+ MiB/,
      
      // Webhook/deployment record noise
      /^Sending deployment record/,
      /^Payload:/,
      /^Response \(HTTP/,
      /%\{http_code\}/,
      /-X POST.*webhook/,
      /^Finished: (SUCCESS|FAILURE)$/,    // We show our own banner instead
    ];

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty, preserve one blank line for spacing
      if (!trimmed) {
        if (outputLines.length > 0 && outputLines[outputLines.length - 1] !== '') {
          outputLines.push('');
        }
        continue;
      }

      // Track final state
      if (trimmed.includes('PIPELINE: Success') || trimmed.includes('Finished: SUCCESS')) isFinalSuccess = true;
      if (trimmed.includes('PIPELINE: Failure') || trimmed.includes('Finished: FAILURE')) isFinalFailure = true;
      
      // Extract domain (handle both "Domain:" and "Service URL:" formats)
      const domainMatch = trimmed.match(/(?:Domain|Service URL):\s*(?:https?:\/\/)?(\S+)/);
      if (domainMatch) domain = domainMatch[1];

      // Check blocklist
      if (blockPatterns.some(p => p.test(trimmed))) continue;
      
      // Skip YAML-like lines from pod templates (key: "value" or key: value with internal refs)
      if (/^(name|image):.*(?:jenkins|docker\.io|gcr\.io|aquasec)/i.test(trimmed)) continue;
      if (/^index\.docker\.io/.test(trimmed)) continue;

      // Transform and add
      const outputLine = trimmed
        .replace('STAGE: ', '[STAGE] ')                      // Stage markers
        .replace(/INFO\[\d+\]\s*/, '')                      // Kaniko INFO prefix
        .replace(/hav0ky\//g, '')                           // Docker username
        .replace(/deployment\.apps\//g, '')                 // k8s prefixes
        .replace(/service\//g, '')
        .replace(/ingress\.networking\.k8s\.io\//g, '')
        .replace(/certificate\.cert-manager\.io\//g, '');

      outputLines.push(outputLine);
    }

    // Add final status banner
    if (isFinalSuccess) {
      outputLines.push('', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      outputLines.push('DEPLOYMENT SUCCESSFUL');
      if (domain) outputLines.push(`URL: https://${domain}`);
      outputLines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } else if (isFinalFailure) {
      outputLines.push('', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      outputLines.push('DEPLOYMENT FAILED');
      outputLines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    // Remove consecutive blank lines
    const result = outputLines.filter((line, i, arr) => 
      !(line === '' && i > 0 && arr[i - 1] === '')
    );

    return result.join('\n').trim() || 'Build in progress...';
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

    const pipeline = createResizePipeline(
      appName,
      size,
      appId,
      webhookBaseUrl,
      deploymentRecordSecret,
      envVars,
      containerPort,
      framework,
      operationId ?? '',
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

    await jenkins.job.build(jobName);

    console.log(`[JenkinsService] Resize build #${expectedBuildNumber} triggered for: ${jobName}`);
    console.log(`[JenkinsService] Monitor at: ${this.getSafeJenkinsUrl()}/job/${jobName}/${expectedBuildNumber}/`);

    return expectedBuildNumber;
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
