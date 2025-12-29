/**
 * Build Polling Service
 * Handles background polling of Jenkins build status
 */
import { JenkinsService } from "./jenkins";
import { Platform_Apps } from "@/lib/supabase/queries";
import { KubernetesInfoService } from "./kubernetes-info";

export interface BuildPollConfig {
  appId: string;
  appName: string;
  buildNumber: number;
  maxPolls?: number;
  pollInterval?: number;
  startupWait?: number;
  buildStartTimeout?: number;
}

export interface BuildPollResult {
  status: 'running' | 'failed';
  result: string;
  duration: number;
  pollCount: number;
}

export class BuildPollingService {
  private static readonly DEFAULT_MAX_POLLS = 180; // 30 minutes
  private static readonly DEFAULT_POLL_INTERVAL = 10000; // 10 seconds
  private static readonly DEFAULT_STARTUP_WAIT = 5000; // 5 seconds
  private static readonly DEFAULT_BUILD_START_TIMEOUT = 60000; // 1 minute

  /**
   * Start polling for build status
   * Runs in background and updates database when complete
   */
  static async startPolling(config: BuildPollConfig): Promise<void> {
    const {
      appId,
      appName,
      buildNumber,
      maxPolls = this.DEFAULT_MAX_POLLS,
      pollInterval = this.DEFAULT_POLL_INTERVAL,
      startupWait = this.DEFAULT_STARTUP_WAIT,
      buildStartTimeout = this.DEFAULT_BUILD_START_TIMEOUT,
    } = config;

    console.log(`[BuildPolling] Starting polling for ${appName} build #${buildNumber}`);
    console.log(`[BuildPolling] Config: max=${maxPolls} polls, interval=${pollInterval}ms, startup=${startupWait}ms`);

    // Wait before first poll to give Jenkins time to start the build
    setTimeout(() => {
      this.poll({
        appId,
        appName,
        buildNumber,
        maxPolls,
        pollInterval,
        buildStartTimeout,
        pollCount: 0,
        buildFound: false,
      }).catch(err => console.error(`[BuildPolling] Fatal error:`, err));
    }, startupWait);
  }

  /**
   * Internal polling loop
   */
  private static async poll(context: {
    appId: string;
    appName: string;
    buildNumber: number;
    maxPolls: number;
    pollInterval: number;
    buildStartTimeout: number;
    pollCount: number;
    buildFound: boolean;
  }): Promise<void> {
    const { appId, appName, buildNumber, maxPolls, pollInterval } = context;
    let { pollCount, buildFound } = context;

    pollCount++;

    // Check for timeout
    if (pollCount > maxPolls) {
      await this.handleTimeout(appId, appName, pollCount, pollInterval);
      return;
    }

    try {
      const buildStatus = await JenkinsService.checkBuildStatus(appName, buildNumber);

      // Mark build as found on first successful poll
      if (!buildFound) {
        buildFound = true;
        console.log(`[BuildPolling] ✓ Build #${buildNumber} started for ${appName}`);
      }

      // Log poll status
      this.logPollStatus(pollCount, appName, buildStatus);

      // Check if build is complete
      if (!buildStatus.building) {
        await this.handleBuildComplete(appId, appName, buildStatus);
        return;
      }

      // Build still in progress, schedule next poll
      setTimeout(() => {
        this.poll({
          ...context,
          pollCount,
          buildFound,
        }).catch(err => console.error(`[BuildPolling] Poll error:`, err));
      }, pollInterval);

    } catch (error: unknown) {
      await this.handlePollError(error, {
        ...context,
        pollCount,
        buildFound,
      });
    }
  }

  /**
   * Handle build completion
   */
  private static async handleBuildComplete(
    appId: string,
    appName: string,
    buildStatus: { status: string; result: string | null; building: boolean }
  ): Promise<void> {
    console.log(`[BuildPolling] ✅ Build complete for ${appName}`);
    console.log(`[BuildPolling] Final status: ${buildStatus.status} (result: ${buildStatus.result || 'unknown'})`);

    await Platform_Apps.update(appId, { 
      status: buildStatus.status as "running" | "failed" 
    });

    // Best-effort: log the currently running Kubernetes images to verify cluster connectivity
    if (buildStatus.status === 'running') {
      KubernetesInfoService.logAppImages(appName, `post-build-success build=${buildStatus.result || 'unknown'}`)
        .catch(() => undefined);
    }
  }

  /**
   * Handle polling timeout
   */
  private static async handleTimeout(
    appId: string,
    appName: string,
    pollCount: number,
    pollInterval: number
  ): Promise<void> {
    const timeoutMinutes = Math.floor((pollCount * pollInterval) / 60000);
    console.log(`[BuildPolling] ⚠️ Timeout for ${appName} after ${timeoutMinutes} minutes`);
    
    await Platform_Apps.update(appId, { status: "failed" });
  }

  /**
   * Handle errors during polling
   */
  private static async handlePollError(
    error: unknown,
    context: {
      appId: string;
      appName: string;
      buildNumber: number;
      maxPolls: number;
      pollInterval: number;
      buildStartTimeout: number;
      pollCount: number;
      buildFound: boolean;
    }
  ): Promise<void> {
    const { appId, appName, pollCount, pollInterval, buildStartTimeout, buildFound } = context;
    const errorMessage = error instanceof Error ? error.message : '';

    // Handle "build not found" error
    if (errorMessage.includes('not found')) {
      const waitTime = pollCount * pollInterval;
      
      // Still waiting for build to start
      if (!buildFound && waitTime < buildStartTimeout) {
        const waitSeconds = Math.floor(waitTime / 1000);
        console.log(`[BuildPolling] Waiting for build to start... (${waitSeconds}s)`);
        
        // Retry
        setTimeout(() => {
          this.poll(context).catch(err => console.error(`[BuildPolling] Retry error:`, err));
        }, pollInterval);
        return;
      }
      
      // Build never started
      if (!buildFound) {
        console.error(`[BuildPolling] ❌ Build never started for ${appName} after ${Math.floor(buildStartTimeout / 1000)}s`);
        await Platform_Apps.update(appId, { status: "failed" });
        return;
      }
    }

    // Other errors
    console.error(`[BuildPolling] Error polling ${appName}:`, errorMessage);

    // Retry if not exceeded max polls
    if (pollCount < context.maxPolls) {
      setTimeout(() => {
        this.poll(context).catch(err => console.error(`[BuildPolling] Retry error:`, err));
      }, pollInterval);
    }
  }

  /**
   * Log poll status
   */
  private static logPollStatus(
    pollCount: number,
    appName: string,
    buildStatus: { building: boolean; result: string | null }
  ): void {
    const result = buildStatus.result || 'in-progress';
    console.log(`[BuildPolling] Poll ${pollCount}: ${appName} - building: ${buildStatus.building}, result: ${result}`);
  }

  /**
   * Get current polling status (for monitoring)
   */
  static async getCurrentStatus(appName: string, buildNumber: number): Promise<{
    building: boolean;
    result: string | null;
    status: string;
  } | null> {
    try {
      return await JenkinsService.checkBuildStatus(appName, buildNumber);
    } catch {
      return null;
    }
  }
}
