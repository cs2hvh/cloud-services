/**
 * Build Polling Service
 * Handles background polling of Jenkins build status
 */
import { JenkinsService } from "./jenkins";
import { AppStatusService } from "./app-status";
import { KubernetesInfoService } from "./kubernetes-info";
import { AppOperationFinalizer } from "@/lib/app-operations";
import {
  BUILD_POLLING_FINALIZATION_GRACE_MS,
  BUILD_POLLING_HEALTH_CHECK_INTERVAL_MS,
  BUILD_POLLING_HEALTH_CHECK_MAX_ATTEMPTS,
  BUILD_POLLING_STALE_BUILD_AGE_MS,
} from "./build-polling.constants";

export interface BuildPollConfig {
  appId: string;
  appName: string;
  buildNumber: number;
  userId?: string;
  trigger?: 'manual' | 'webhook' | 'rollback' | 'resize';
  resizeContext?: {
    previousSize: 'small' | 'medium' | 'large';
    targetSize: 'small' | 'medium' | 'large';
  };
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

type PlatformAppSize = 'small' | 'medium' | 'large';

export class BuildPollingService {
  private static readonly DEFAULT_MAX_POLLS = 180; // 30 minutes
  private static readonly DEFAULT_POLL_INTERVAL = 10000; // 10 seconds
  private static readonly DEFAULT_STARTUP_WAIT = 5000; // 5 seconds
  private static readonly DEFAULT_BUILD_START_TIMEOUT = 60000; // 1 minute
  private static readonly HEALTH_CHECK_MAX_ATTEMPTS = BUILD_POLLING_HEALTH_CHECK_MAX_ATTEMPTS; // 60 seconds total
  private static readonly HEALTH_CHECK_INTERVAL = BUILD_POLLING_HEALTH_CHECK_INTERVAL_MS; // 10 seconds
  static readonly STALE_BUILD_AGE_MS = BUILD_POLLING_STALE_BUILD_AGE_MS;
  static readonly BUILD_FINALIZATION_GRACE_MS = BUILD_POLLING_FINALIZATION_GRACE_MS;
  private static readonly finalizer = new AppOperationFinalizer();

  static isStaleBuildRecord(createdAt?: string | null): boolean {
    if (!createdAt) return false;
    const createdMs = new Date(createdAt).getTime();
    if (!Number.isFinite(createdMs)) return false;
    return Date.now() - createdMs >= this.STALE_BUILD_AGE_MS;
  }

  private static getSizeFromReplicaCount(replicas?: number | null): PlatformAppSize | null {
    if (!replicas || replicas <= 1) return 'small';
    if (replicas === 2) return 'medium';
    if (replicas >= 3) return 'large';
    return null;
  }

  private static async getActualRuntimeSize(appName: string): Promise<PlatformAppSize | null> {
    try {
      const deployment = await KubernetesInfoService.getDeploymentInfo(appName);
      return this.getSizeFromReplicaCount(deployment?.replicas ?? null);
    } catch (error) {
      console.warn(`[BuildPolling] Failed to determine runtime size for ${appName}:`, error);
      return null;
    }
  }

  private static async getResizeRecoveryContext(
    appName: string,
    targetSize?: PlatformAppSize | null
  ): Promise<BuildPollConfig['resizeContext'] | undefined> {
    if (!targetSize) return undefined;

    const actualRuntimeSize = await this.getActualRuntimeSize(appName);
    return {
      previousSize: actualRuntimeSize ?? targetSize,
      targetSize,
    };
  }

  private static async getCurrentImageIdentity(appName: string): Promise<{
    image_tag?: string | null;
    image_digest?: string | null;
  }> {
    try {
      const images = await KubernetesInfoService.getDeploymentImages(appName);
      const primary = images[0];
      if (!primary) return {};

      const digestMatch = primary.imageID?.match(/@sha256:[a-f0-9]+$/i);
      return {
        image_tag: primary.image || null,
        image_digest: digestMatch?.[0] ?? null,
      };
    } catch (error) {
      console.warn(`[BuildPolling] Failed to read deployment image identity for ${appName}:`, error);
      return {};
    }
  }

  static async recoverBuild(params: {
    appId: string;
    appName: string;
    buildNumber: number;
    trigger: 'manual' | 'webhook' | 'rollback' | 'resize';
    desiredSize?: PlatformAppSize | null;
  }): Promise<{
    success: boolean;
    recovered: boolean;
    stillBuilding?: boolean;
    status?: 'success' | 'failed';
    message?: string;
    error?: string;
  }> {
    const { appId, appName, buildNumber, trigger, desiredSize } = params;

    const resizeContext =
      trigger === 'resize'
        ? await this.getResizeRecoveryContext(appName, desiredSize ?? undefined)
        : undefined;

    let buildStatus: Awaited<ReturnType<typeof JenkinsService.checkBuildStatus>>;

    try {
      buildStatus = await JenkinsService.checkBuildStatus(appName, buildNumber);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('not found')) {
        const failureReason = 'Build never started';
        await AppStatusService.setStatus(appId, 'failed', failureReason);
        await this.finalizeBuildRecord({
          appId,
          appName,
          buildNumber,
          trigger,
          status: 'failed',
          failureReason,
          allowedCurrentStatuses: ['building'],
          resizeContext,
        });
        return {
          success: true,
          recovered: true,
          status: 'failed',
          message: failureReason,
        };
      }

      return {
        success: false,
        recovered: false,
        error: errorMessage,
      };
    }

    if (buildStatus.building) {
      return {
        success: true,
        recovered: false,
        stillBuilding: true,
        message: 'Build is still running on Jenkins',
      };
    }

    await this.handleBuildComplete(
      appId,
      appName,
      buildStatus,
      buildNumber,
      trigger,
      resizeContext
    );

    return {
      success: true,
      recovered: true,
      status: buildStatus.result === 'SUCCESS' ? 'success' : 'failed',
    };
  }

  private static async finalizeBuildRecord(
    params: {
      appId: string;
      appName: string;
      buildNumber?: number;
      trigger: 'manual' | 'webhook' | 'rollback' | 'resize';
      status: 'success' | 'failed';
      failureReason?: string | null;
      allowedCurrentStatuses: Array<'building' | 'success' | 'failed'>;
      resizeContext?: BuildPollConfig['resizeContext'];
    }
  ): Promise<void> {
    const {
      appId,
      appName,
      buildNumber,
      trigger,
      status,
      failureReason,
      allowedCurrentStatuses,
    } = params;

    if (!buildNumber) return;

    const imageIdentity =
      status === 'success' ? await this.getCurrentImageIdentity(appName) : {};

    await this.finalizer.finalizeBuildOperation({
      appId,
      appName,
      buildNumber,
      trigger,
      status,
      failureReason: status === 'failed' ? (failureReason ?? null) : null,
      imageTag: imageIdentity.image_tag,
      imageDigest: imageIdentity.image_digest,
      allowedCurrentStatuses: allowedCurrentStatuses,
      allowLegacyCreate: false,
    });
  }

  /**
   * Start polling for build status
   * Runs in background and updates database when complete
   */
  static async startPolling(config: BuildPollConfig): Promise<void> {
    const {
      appId,
      appName,
      buildNumber,
      userId,
      trigger = 'manual',
      resizeContext,
      maxPolls = this.DEFAULT_MAX_POLLS,
      pollInterval = this.DEFAULT_POLL_INTERVAL,
      startupWait = this.DEFAULT_STARTUP_WAIT,
      buildStartTimeout = this.DEFAULT_BUILD_START_TIMEOUT,
    } = config;

    console.log(`[BuildPolling] Starting polling for ${appName} build #${buildNumber} (trigger: ${trigger})`);
    console.log(`[BuildPolling] Config: max=${maxPolls} polls, interval=${pollInterval}ms, startup=${startupWait}ms`);

    // Wait before first poll to give Jenkins time to start the build
    setTimeout(() => {
      this.poll({
        appId,
        appName,
        buildNumber,
        userId,
        trigger,
        resizeContext,
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
    userId?: string;
    trigger: 'manual' | 'webhook' | 'rollback' | 'resize';
    resizeContext?: BuildPollConfig['resizeContext'];
    maxPolls: number;
    pollInterval: number;
    buildStartTimeout: number;
    pollCount: number;
    buildFound: boolean;
  }): Promise<void> {
    const { appId, appName, buildNumber, userId, trigger, maxPolls, pollInterval, resizeContext } = context;
    let { pollCount, buildFound } = context;

    pollCount++;

    // Check for timeout
    if (pollCount > maxPolls) {
      await this.handleTimeout(appId, appName, pollCount, pollInterval, buildNumber, trigger, resizeContext);
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
        await this.handleBuildComplete(appId, appName, buildStatus, buildNumber, userId, trigger, resizeContext);
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
   * If build succeeded, verify the app is actually healthy before marking as 'running'
   * For resize, update billing rate only after successful completion
   * Records deployment history for rollback capability
   */
  private static async handleBuildComplete(
    appId: string,
    appName: string,
    buildStatus: { status: string; result: string | null; building: boolean },
    buildNumber?: number,
    userId?: string,
    trigger: 'manual' | 'webhook' | 'rollback' | 'resize' = 'manual',
    resizeContext?: BuildPollConfig['resizeContext']
  ): Promise<void> {
    console.log(`[BuildPolling] ✅ Build complete for ${appName}`);
    console.log(`[BuildPolling] Final status: ${buildStatus.status} (result: ${buildStatus.result || 'unknown'})`);

    // If build failed, mark as failed immediately
    if (buildStatus.status === 'failed' || buildStatus.result !== 'SUCCESS') {
      const failureReason = `Build failed: ${buildStatus.result || 'Unknown error'}`;
      
      // Use AppStatusService for consistent status management
      const updateResult = await AppStatusService.setStatus(appId, "failed", failureReason);

      if (!updateResult.success) {
        console.error(`[BuildPolling] ❌ Failed to update app status to failed: ${updateResult.error}`);
      }
      
      await this.finalizeBuildRecord({
        appId,
        appName,
        buildNumber,
        trigger,
        status: 'failed',
        failureReason,
        allowedCurrentStatuses: ['building'],
        resizeContext,
      });
      console.log(`[BuildPolling] App status set to failed for build #${buildNumber ?? 'unknown'}`);
      return;
    }

    // Build succeeded - now verify the app is actually healthy
    console.log(`[BuildPolling] 🔍 Verifying app health for ${appName}...`);
    
    const healthCheck = await this.waitForHealthy(appName);
    
    if (healthCheck.healthy) {
      if (trigger === 'resize' && resizeContext?.targetSize) {
        const actualRuntimeSize = await this.getActualRuntimeSize(appName);
        if (actualRuntimeSize !== resizeContext.targetSize) {
          const failureReason = `Resize verification failed: expected ${resizeContext.targetSize}, got ${actualRuntimeSize ?? 'unknown'}`;
          console.log(`[BuildPolling] ❌ ${failureReason}`);
          const updateResult = await AppStatusService.setStatus(appId, "failed", failureReason);
          if (!updateResult.success) {
            console.error(`[BuildPolling] ❌ Failed to update app status to failed (resize verify): ${updateResult.error}`);
          }
          await this.finalizeBuildRecord({
            appId,
            appName,
            buildNumber,
            trigger,
            status: 'failed',
            failureReason,
            allowedCurrentStatuses: ['building', 'success'],
            resizeContext,
          });
          return;
        }
      }

      // Update billing rate for successful resize (after verification, before marking as running)
      if (trigger === 'resize' && resizeContext?.targetSize && userId) {
        try {
          const { Billing } = await import('@/lib/supabase/queries/billing');
          const { getRatesForPlatformApp } = await import('@/config/pricing');
          const { hourlyRate } = await getRatesForPlatformApp(resizeContext.targetSize);
          await Billing.update_active_platform_app_rate({ serviceId: appId, newHourlyRate: hourlyRate });
          console.log(`[BuildPolling] ✅ Billing rate updated for resize to ${resizeContext.targetSize} (${hourlyRate}/hr)`);
        } catch (billingErr) {
          console.warn(`[BuildPolling] ⚠️ Failed to update billing rate for successful resize:`, billingErr);
          // Don't fail the entire build - the app is healthy and resized, billing update is secondary
        }

        try {
          const { AuditLogService } = await import('@/lib/audit');
          await AuditLogService.create({
            user_id: userId,
            user_role: 'user',
            action: 'update',
            service_type: 'platform_app',
            service_id: appId,
            service_name: appName,
            after_state: { size: resizeContext.targetSize },
            metadata: { update_type: 'resize', trigger },
          });
        } catch (auditErr) {
          console.warn(`[BuildPolling] ⚠️ Failed to create audit log for resize:`, auditErr);
        }
      }

      console.log(`[BuildPolling] ✅ App ${appName} is healthy and running`);
      // Use AppStatusService for consistent status management
      const updateResult = await AppStatusService.setStatus(appId, "running");

      if (!updateResult.success) {
        console.error(`[BuildPolling] ❌ Failed to update app status to running: ${updateResult.error}`);
      } else {
        console.log(`[BuildPolling] ✅ App status updated to 'running' in DB`);
      }
      await this.finalizeBuildRecord({
        appId,
        appName,
        buildNumber,
        trigger,
        status: 'success',
        allowedCurrentStatuses: ['building'],
        resizeContext,
      });

      console.log(`[BuildPolling] ✅ Build #${buildNumber} confirmed healthy`);
    } else {
      const failureReason = `Health check failed: ${healthCheck.reason}`;
      
      console.log(`[BuildPolling] ❌ App ${appName} failed health check - ${healthCheck.reason}`);
      // Use AppStatusService for consistent status management
      const updateResult = await AppStatusService.setStatus(appId, "failed", failureReason);

      if (!updateResult.success) {
        console.error(`[BuildPolling] ❌ Failed to update app status to failed (health check): ${updateResult.error}`);
      }
      
      await this.finalizeBuildRecord({
        appId,
        appName,
        buildNumber,
        trigger,
        status: 'failed',
        failureReason,
        allowedCurrentStatuses: ['building', 'success'],
        resizeContext,
      });
      
      console.log(`[BuildPolling] 📝 Recorded health-check failure for build #${buildNumber ?? 'unknown'}`);
    }
  }

  /**
   * Wait for app to become healthy (pods running and ready)
   * Polls health status for up to 60 seconds
   */
  private static async waitForHealthy(appName: string): Promise<{ healthy: boolean; reason: string }> {
    let lastReason = 'Health verification timed out';

    for (let attempt = 1; attempt <= this.HEALTH_CHECK_MAX_ATTEMPTS; attempt++) {
      try {
        const health = await AppStatusService.checkK8sHealth(appName);
        
        lastReason = health.reason;
        console.log(
          `[BuildPolling] Health check ${attempt}/${this.HEALTH_CHECK_MAX_ATTEMPTS}: ${health.healthy ? 'healthy' : 'unhealthy'} - ${health.reason}`
        );
        
        if (health.healthy) {
          return { healthy: true, reason: health.reason };
        }
        
        // If pods exist but not ready, keep waiting
        if (health.podsTotal > 0 && attempt < this.HEALTH_CHECK_MAX_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, this.HEALTH_CHECK_INTERVAL));
          continue;
        }
        
        // If no pods found after multiple attempts, consider it failed
        if (health.podsTotal === 0 && attempt >= 3) {
          console.log(`[BuildPolling] No pods found after ${attempt} attempts`);
          return { healthy: false, reason: health.reason };
        }
        
        // Wait before next attempt
        if (attempt < this.HEALTH_CHECK_MAX_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, this.HEALTH_CHECK_INTERVAL));
        }
      } catch (error) {
        console.error(`[BuildPolling] Health check error (attempt ${attempt}):`, error);
        lastReason = error instanceof Error ? error.message : 'Unknown health check error';
        // On error, wait and retry (Prometheus might not be ready)
        if (attempt < this.HEALTH_CHECK_MAX_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, this.HEALTH_CHECK_INTERVAL));
        }
      }
    }

    console.log(`[BuildPolling] ⚠️ Health verification failed: ${lastReason}`);
    return { healthy: false, reason: lastReason };
  }

  /**
   * Handle polling timeout
   */
  private static async handleTimeout(
    appId: string,
    appName: string,
    pollCount: number,
    pollInterval: number,
    buildNumber?: number,
    trigger: 'manual' | 'webhook' | 'rollback' | 'resize' = 'manual',
    resizeContext?: BuildPollConfig['resizeContext']
  ): Promise<void> {
    const timeoutMinutes = Math.floor((pollCount * pollInterval) / 60000);
    const failureReason = `Build timeout: No response after ${timeoutMinutes} minutes`;
    
    console.log(`[BuildPolling] ⚠️ Timeout for ${appName} after ${timeoutMinutes} minutes`);
    
    // Use AppStatusService for consistent status management
    const updateResult = await AppStatusService.setStatus(appId, "failed", failureReason);

    if (!updateResult.success) {
        console.error(`[BuildPolling] ❌ Failed to update app status to timeout: ${updateResult.error}`);
    }
    
    await this.finalizeBuildRecord({
      appId,
      appName,
      buildNumber,
      trigger,
      status: 'failed',
      failureReason,
      allowedCurrentStatuses: ['building'],
      resizeContext,
    });
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
      trigger: 'manual' | 'webhook' | 'rollback' | 'resize';
      resizeContext?: BuildPollConfig['resizeContext'];
      maxPolls: number;
      pollInterval: number;
      buildStartTimeout: number;
      pollCount: number;
      buildFound: boolean;
    }
  ): Promise<void> {
    const { appId, appName, pollCount, pollInterval, buildStartTimeout, buildFound, resizeContext } = context;
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
        const failureReason = "Build never started";
        console.error(`[BuildPolling] ❌ Build never started for ${appName} after ${Math.floor(buildStartTimeout / 1000)}s`);
        // Use AppStatusService for consistent status management
        await AppStatusService.setStatus(appId, "failed", failureReason);
        await this.finalizeBuildRecord({
          appId,
          appName,
          buildNumber: context.buildNumber,
          trigger: context.trigger,
          status: 'failed',
          failureReason,
          allowedCurrentStatuses: ['building'],
          resizeContext,
        });
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
