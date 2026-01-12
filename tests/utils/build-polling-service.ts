/**
 * BuildPollingService - Polls Jenkins for build status
 * Stub implementation for testing
 */

export interface BuildInfo {
  buildNumber: number;
  status: 'pending' | 'running' | 'success' | 'failed';
  duration: number;
  timestamp: string;
}

export interface BuildLog {
  lines: string[];
  hasMore: boolean;
}

export class BuildPollingService {
  private static pollingIntervals = new Map<string, NodeJS.Timeout>();

  /**
   * Start polling for build status
   */
  static async startPolling(
    appId: string,
    buildNumber: number,
    onUpdate: (status: BuildInfo) => void
  ): Promise<void> {
    // Stub: Immediately call onUpdate with success
    onUpdate({
      buildNumber,
      status: 'success',
      duration: 120000,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Stop polling for build
   */
  static stopPolling(appId: string): void {
    const interval = this.pollingIntervals.get(appId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(appId);
    }
  }

  /**
   * Get current build status from Jenkins
   */
  static async getBuildStatus(appId: string, buildNumber: number): Promise<BuildInfo> {
    // Stub: Return success status
    return {
      buildNumber,
      status: 'success',
      duration: 120000,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get build logs
   */
  static async getBuildLogs(appId: string, buildNumber: number): Promise<BuildLog> {
    // Stub: Return mock logs
    return {
      lines: [
        'Starting build...',
        'Installing dependencies...',
        'Build successful',
      ],
      hasMore: false,
    };
  }

  /**
   * Wait for build completion with timeout
   */
  static async waitForCompletion(
    appId: string,
    buildNumber: number,
    timeoutMs: number = 300000
  ): Promise<BuildInfo> {
    // Stub: Return success immediately
    return {
      buildNumber,
      status: 'success',
      duration: 120000,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Retry failed build
   */
  static async retryBuild(appId: string, buildNumber: number): Promise<number> {
    // Stub: Return new build number
    return buildNumber + 1;
  }
}
