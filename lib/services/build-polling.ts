/**
 * Build Polling Service
 * Handles background polling of Jenkins build status
 */
import { JenkinsService } from "./jenkins";
import { AppStatusService } from "./app-status";
import { KubernetesInfoService } from "./kubernetes-info";
import { AppOperationFinalizer } from "@/lib/app-operations";
import { extractDigestFromImageID, parseImageRef } from "@/lib/container-image/image-ref";
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
  userEmail?: string;
  operationId?: string; // required for resize: the DB record ID to update by
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

      // Normalize: strip docker.io/ prefix Kubernetes adds to short image refs
      const parsed = primary.image ? parseImageRef(primary.image) : null;
      const normalizedTag = parsed
        ? primary.image?.trim().replace(/^docker\.io\//, '') ?? null
        : null;

      // Capture only the digest itself — exclude the leading '@' separator
      return {
        image_tag: normalizedTag ?? null,
        image_digest: extractDigestFromImageID(primary.imageID),
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
    userId?: string; // Optional: for audit logging during recovery
    operationId?: string; // Required for resize: the DB record UUID
  }): Promise<{
    success: boolean;
    recovered: boolean;
    stillBuilding?: boolean;
    status?: 'success' | 'failed';
    message?: string;
    error?: string;
  }> {
    const { appId, appName, buildNumber, trigger, desiredSize, userId, operationId } = params;

    const resizeContext =
      trigger === 'resize'
        ? await this.getResizeRecoveryContext(appName, desiredSize ?? undefined)
        : undefined;

    let buildStatus: Awaited<ReturnType<typeof JenkinsService.checkBuildStatus>>;

    try {
      buildStatus = await this.checkBuildStatusForTrigger(appName, buildNumber, trigger);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('not found')) {
        const failureReason = 'Build never started';
        await AppStatusService.setStatus(appId, 'failed', failureReason);
        await this.finalizeBuildRecord({
          appId,
          appName,
          buildNumber,
          operationId,
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
      userId, // userId now optionally available from recovery context
      undefined, // userEmail not available in recovery context
      trigger,
      resizeContext,
      operationId
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
      operationId?: string;
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
      operationId,
      trigger,
      status,
      failureReason,
      allowedCurrentStatuses,
    } = params;

    // For resize, operationId is the identity; for all others, buildNumber is required
    if (!buildNumber && !operationId) return;

    const imageIdentity =
      status === 'success' ? await this.getCurrentImageIdentity(appName) : {};

    await this.finalizer.finalizeBuildOperation({
      appId,
      appName,
      buildNumber,
      operationId,
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
  private static async logResizeAudit(params: {
    appId: string;
    appName: string;
    userId: string;
    userEmail?: string;
    resizeContext: NonNullable<BuildPollConfig['resizeContext']>;
    trigger: string;
    status: 'success' | 'failed';
    failureReason?: string;
  }): Promise<void> {
    try {
      const { AuditLogService } = await import('@/lib/audit');
      await AuditLogService.create({
        user_id: params.userId,
        user_role: 'user',
        ...(params.userEmail ? { user_email: params.userEmail } : {}),
        action: 'update',
        service_type: 'platform_apps',
        service_id: params.appId,
        service_name: params.appName,
        before_state: { size: params.resizeContext.previousSize },
        after_state: params.status === 'success' ? { size: params.resizeContext.targetSize } : undefined,
        metadata: { update_type: 'resize', trigger: params.trigger, status: params.status, ...(params.failureReason ? { failure_reason: params.failureReason } : {}) },
      });
    } catch (auditErr) {
      console.warn(`[BuildPolling] ⚠️ Failed to create audit log for resize:`, auditErr);
    }

    // Notification fires alongside audit (confirmed outcome, not trigger-time)
    try {
      const { NotificationService, createServiceNotification } = await import('@/lib/notifications');
      await NotificationService.create(
        createServiceNotification({
          userId: params.userId,
          serviceType: 'platform_app',
          action: params.status === 'success' ? 'resized' : 'failed',
          serviceName: params.appName,
          serviceId: params.appId,
          ...(params.status === 'failed' ? { error: params.failureReason } : {}),
          metadata: {
            old_size: params.resizeContext.previousSize,
            new_size: params.resizeContext.targetSize,
            status: params.status,
          },
        })
      );
    } catch (notifErr) {
      console.warn(`[BuildPolling] ⚠️ Failed to create notification for resize:`, notifErr);
    }
  }

  /**
   * Fire a deployment outcome notification for redeploy/auto-deploy triggers.
   * Resize has its own logResizeAudit path. Rollback is synchronous (no polling).
   */
  private static async logDeployNotification(params: {
    appId: string;
    appName: string;
    userId: string;
    trigger: string;
    status: 'success' | 'failed';
    buildNumber?: number;
    failureReason?: string;
  }): Promise<void> {
    try {
      const { NotificationService, createServiceNotification } = await import('@/lib/notifications');
      await NotificationService.create(
        createServiceNotification({
          userId: params.userId,
          serviceType: 'platform_app',
          action: params.status === 'success' ? 'deployed' : 'failed',
          serviceName: params.appName,
          serviceId: params.appId,
          ...(params.status === 'failed' ? { error: params.failureReason } : {}),
          metadata: {
            trigger: params.trigger,
            build_number: params.buildNumber,
            status: params.status,
          },
        })
      );
    } catch (notifErr) {
      console.warn(`[BuildPolling] ⚠️ Failed to create deploy notification:`, notifErr);
    }
  }

  static async startPolling(config: BuildPollConfig): Promise<void> {
    const {
      appId,
      appName,
      buildNumber,
      userId,
      userEmail,
      operationId,
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
        userEmail,
        operationId,
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
    userEmail?: string;
    operationId?: string;
    trigger: 'manual' | 'webhook' | 'rollback' | 'resize';
    resizeContext?: BuildPollConfig['resizeContext'];
    maxPolls: number;
    pollInterval: number;
    buildStartTimeout: number;
    pollCount: number;
    buildFound: boolean;
  }): Promise<void> {
    const { appId, appName, buildNumber, userId, userEmail, operationId, trigger, maxPolls, pollInterval, resizeContext } = context;
    let { pollCount, buildFound } = context;

    pollCount++;

    // Check for timeout
    if (pollCount > maxPolls) {
      await this.handleTimeout(appId, appName, pollCount, pollInterval, buildNumber, trigger, resizeContext, operationId);
      return;
    }

    try {
      const buildStatus = await this.checkBuildStatusForTrigger(appName, buildNumber, trigger);

      // Mark build as found on first successful poll
      if (!buildFound) {
        buildFound = true;
        console.log(`[BuildPolling] ✓ Build #${buildNumber} started for ${appName}`);
      }

      // Log poll status
      this.logPollStatus(pollCount, appName, buildStatus);

      // Check if build is complete
      if (!buildStatus.building) {
        await this.handleBuildComplete(appId, appName, buildStatus, buildNumber, userId, userEmail, trigger, resizeContext, operationId);
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
    userEmail?: string,
    trigger: 'manual' | 'webhook' | 'rollback' | 'resize' = 'manual',
    resizeContext?: BuildPollConfig['resizeContext'],
    operationId?: string
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
        operationId,
        trigger,
        status: 'failed',
        failureReason,
        allowedCurrentStatuses: ['building'],
        resizeContext,
      });
      if (trigger === 'resize' && resizeContext && userId) {
        await this.logResizeAudit({ appId, appName, userId, userEmail, resizeContext, trigger, status: 'failed', failureReason });
      } else if (trigger !== 'resize' && userId) {
        await this.logDeployNotification({ appId, appName, userId, trigger, status: 'failed', buildNumber, failureReason });
      }
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
            operationId,
            trigger,
            status: 'failed',
            failureReason,
            allowedCurrentStatuses: ['building', 'success'],
            resizeContext,
          });
          if (userId) {
            await this.logResizeAudit({ appId, appName, userId, userEmail, resizeContext, trigger, status: 'failed', failureReason });
          }
          return;
        }
      }

      // Billing rate update + app.size update + lock release all happen in
      // finalizeBuildRecord → AppOperationFinalizer → AppBuildSideEffectsService
      // No need to handle them inline here.

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
        operationId,
        trigger,
        status: 'success',
        allowedCurrentStatuses: ['building'],
        resizeContext,
      });
      // Audit log fires after finalization so it only records confirmed outcomes
      if (trigger === 'resize' && resizeContext && userId) {
        await this.logResizeAudit({ appId, appName, userId, userEmail, resizeContext, trigger, status: 'success' });
      } else if (trigger !== 'resize' && userId) {
        await this.logDeployNotification({ appId, appName, userId, trigger, status: 'success', buildNumber });
      }

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
        operationId,
        trigger,
        status: 'failed',
        failureReason,
        allowedCurrentStatuses: ['building', 'success'],
        resizeContext,
      });
      if (trigger === 'resize' && resizeContext && userId) {
        await this.logResizeAudit({ appId, appName, userId, userEmail, resizeContext, trigger, status: 'failed', failureReason });
      } else if (trigger !== 'resize' && userId) {
        await this.logDeployNotification({ appId, appName, userId, trigger, status: 'failed', buildNumber, failureReason });
      }
      
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
    resizeContext?: BuildPollConfig['resizeContext'],
    operationId?: string
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
      operationId,
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
      operationId?: string;
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
          operationId: context.operationId,
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

  /**
   * Dispatch to the correct Jenkins check method based on trigger type.
   * Resize uses the dedicated resize job; everything else uses the main app job.
   */
  private static checkBuildStatusForTrigger(
    appName: string,
    buildNumber: number,
    trigger: 'manual' | 'webhook' | 'rollback' | 'resize',
  ) {
    if (trigger === 'resize') {
      return JenkinsService.checkResizeBuildStatus(appName, buildNumber);
    }
    return JenkinsService.checkBuildStatus(appName, buildNumber);
  }
}
