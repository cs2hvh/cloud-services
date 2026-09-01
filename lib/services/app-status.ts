/**
 * App Status Service - SINGLE SOURCE OF TRUTH for app status
 * 
 * This service is the ONLY place that should determine and update app status.
 * 
 * Status Flow:
 * - "pending"  → App created, not deployed yet
 * - "building" → Jenkins build in progress
 * - "running"  → Pods are healthy in K8s (at least 1 ready)
 * - "failed"   → Pods crashed or not ready
 * - "stopped"  → Manually stopped by user
 * 
 * The K8s cluster is the SOURCE OF TRUTH for running/failed state.
 * This service syncs that state to Supabase.
 */

import { Platform_Apps } from "@/lib/supabase/queries";
import { GENERIC_SERVICE_ERROR } from "@/lib/api/error-sanitizer";
import { KubernetesInfoService } from "./kubernetes-info";

export type AppStatus = "pending" | "building" | "running" | "failed" | "stopped" | "deleting";

export interface StatusSyncResult {
  success: boolean;
  previousStatus: AppStatus;
  currentStatus: AppStatus;
  changed: boolean;
  reason?: string;
  error?: string;
}

export interface K8sHealthCheck {
  podsTotal: number;
  podsReady: number;
  podsRunning: number;
  healthy: boolean;
  /** true when the K8s API itself was unreachable — pods may still be running */
  unreachable?: boolean;
  reason: string;
}

export class AppStatusService {
  /** Grace period (ms) after an explicit setStatus() call during which
   *  syncStatus() will NOT flip running → failed. This prevents the brief
   *  "Failed" flash that occurs while K8s pods are still stabilising after
   *  a deployment completes. */
  private static readonly STATUS_GRACE_PERIOD_MS = 120_000; // 2 minutes

  /** appId → timestamp of last explicit setStatus() call */
  // NOTE: This is an in-memory map and is not shared across instances. In a
  // multi-process or multi-node deployment, a server restart or different
  // process will not have this history, which means the grace period can be
  // bypassed if the process that recorded the setStatus() is gone. This is a
  // known limitation; a durable store would be required to make the grace
  // period resilient across restarts/replicas.
  private static recentStatusSets = new Map<string, number>();
  /**
   * Check the actual health state from Kubernetes
   * This is the SOURCE OF TRUTH
   */
  static async checkK8sHealth(appName: string, namespace = 'default'): Promise<K8sHealthCheck> {
    try {
      const podInfo = await KubernetesInfoService.getPodInfo(appName, namespace);
      // rethrowTransport: a connectivity failure must surface as `unreachable`
      // below, not as "Deployment not found" — otherwise syncStatus marks a
      // perfectly healthy app as failed and nothing ever corrects it.
      const deploymentInfo = await KubernetesInfoService.getDeploymentInfo(appName, namespace, true);

      if (!deploymentInfo) {
        return {
          podsTotal: 0,
          podsReady: 0,
          podsRunning: 0,
          healthy: false,
          reason: "Deployment not found in K8s",
        };
      }

      const podsTotal = deploymentInfo.replicas || 0;
      const podsReady = deploymentInfo.readyReplicas || 0;
      const podsRunning = podInfo?.phase === 'Running' ? 1 : 0;

      // Consider healthy if at least 1 pod is ready
      const healthy = podsReady > 0;

      return {
        podsTotal,
        podsReady,
        podsRunning,
        healthy,
        reason: healthy 
          ? `${podsReady}/${podsTotal} pods ready`
          : `No ready pods (${podsReady}/${podsTotal})`,
      };
    } catch (error) {
      console.error(`[AppStatusService] K8s health check failed for ${appName}:`, error);
      return {
        podsTotal: 0,
        podsReady: 0,
        podsRunning: 0,
        healthy: false,
        unreachable: true,
        reason: `K8s check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Sync app status from K8s to Supabase
   * This is the MAIN function that should be called to update status
   * 
   * @param appId - The app UUID
   * @param appName - The app name (for K8s lookup)
   * @param currentDbStatus - Current status in database (optional, will fetch if not provided)
   * @returns StatusSyncResult
   */
  static async syncStatus(
    appId: string,
    appName: string,
    currentDbStatus?: AppStatus,
    /** ISO timestamp of the app row's last DB write — used for a durable grace
     *  period across serverless instances. Pass `app.updated_at` when available. */
    appUpdatedAt?: string
  ): Promise<StatusSyncResult> {
    try {
      // Get current DB status (and updated_at for durable grace period) if not provided
      let previousStatus = currentDbStatus;
      let durableUpdatedAt = appUpdatedAt;
      if (!previousStatus) {
        const appResult = await Platform_Apps.get(appId);
        if (!appResult.success || !appResult.data) {
          return {
            success: false,
            previousStatus: "pending",
            currentStatus: "pending",
            changed: false,
            error: "App not found in database",
          };
        }
        previousStatus = appResult.data.status as AppStatus;
        durableUpdatedAt = appResult.data.updated_at ?? undefined;
      }

      // pending, stopped, and deleting are never K8s-managed — always skip.
      if (previousStatus === "pending" || previousStatus === "stopped" || previousStatus === "deleting") {
        return {
          success: true,
          previousStatus,
          currentStatus: previousStatus,
          changed: false,
          reason: `Status '${previousStatus}' is not synced from K8s`,
        };
      }

      // building is exclusively managed by BuildPollingService — always skip.
      // syncStatus must never override it: the client-side stale-build
      // reconciliation (use-app-build-state Effect 3) races with
      // BuildPollingService.waitForHealthy(); letting syncStatus write
      // "failed" here causes a brief flash before BuildPolling sets "running".
      if (previousStatus === "building") {
        return {
          success: true,
          previousStatus,
          currentStatus: previousStatus,
          changed: false,
          reason: `Status '${previousStatus}' is managed by BuildPollingService`,
        };
      }

      // Check K8s health (SOURCE OF TRUTH)
      const health = await this.checkK8sHealth(appName);

      // If K8s API is unreachable, preserve current status — don't flip to failed
      // due to a transient network issue or K8s control-plane hiccup.
      if (health.unreachable) {
        console.warn(`[AppStatusService] K8s unreachable for ${appName}, preserving status '${previousStatus}': ${health.reason}`);
        return {
          success: true,
          previousStatus,
          currentStatus: previousStatus,
          changed: false,
          reason: `K8s unreachable — status preserved: ${health.reason}`,
        };
      }

      // Determine new status based on K8s state
      const newStatus: AppStatus = health.healthy ? "running" : "failed";

      // Grace period: after a deployment completes, pods may still be stabilising
      // (rolling update). Don't flip running → failed during the grace window.
      //
      // Two sources — whichever fires:
      //   1. In-memory (recentStatusSets): only works in the same process instance
      //   2. Durable (DB updated_at): works across serverless instances/restarts
      //      — applyOperationStatus/setStatus both write updated_at via Platform_Apps.update
      if (previousStatus === "running" && newStatus === "failed") {
        const inMemoryGrace = (() => {
          const lastSet = this.recentStatusSets.get(appId);
          return lastSet != null && Date.now() - lastSet < this.STATUS_GRACE_PERIOD_MS;
        })();
        const durableGrace = (() => {
          if (!durableUpdatedAt) return false;
          return Date.now() - new Date(durableUpdatedAt).getTime() < this.STATUS_GRACE_PERIOD_MS;
        })();
        if (inMemoryGrace || durableGrace) {
          const source = inMemoryGrace ? "in-memory" : "durable(updated_at)";
          return {
            success: true,
            previousStatus,
            currentStatus: previousStatus,
            changed: false,
            reason: `Skipping running→failed transition during grace period [${source}] (${health.reason})`,
          };
        }
      }

      // Only update if changed
      if (newStatus === previousStatus) {
        return {
          success: true,
          previousStatus,
          currentStatus: newStatus,
          changed: false,
          reason: health.reason,
        };
      }

      // Update database
      const updateResult = await Platform_Apps.update(appId, {
        status: newStatus,
        last_failure_reason: newStatus === "failed" ? health.reason : null,
      });

      if (!updateResult.success) {
        return {
          success: false,
          previousStatus,
          currentStatus: previousStatus,
          changed: false,
          error: `Failed to update DB: ${updateResult.error}`,
        };
      }

      console.log(`[AppStatusService] ✅ Status synced: ${appName} ${previousStatus} → ${newStatus} (${health.reason})`);

      return {
        success: true,
        previousStatus,
        currentStatus: newStatus,
        changed: true,
        reason: health.reason,
      };
    } catch (error) {
      console.error(`[AppStatusService] Sync failed for ${appName}:`, error);
      return {
        success: false,
        previousStatus: currentDbStatus || "pending",
        currentStatus: currentDbStatus || "pending",
        changed: false,
        error: GENERIC_SERVICE_ERROR,
      };
    }
  }

  /**
   * Reconcile many apps against K8s using a SINGLE API call.
   *
   * syncStatus() is per-app and costs one API read each, which is why the app
   * list was never synced and its `status` column silently went stale. This
   * reads the whole namespace once and applies the same rules.
   *
   * If the API is unreachable, nothing is written — every status is preserved.
   * Reporting "unreachable" as "no deployments found" would mark every healthy
   * app as failed, which is exactly the failure this is meant to prevent.
   */
  static async syncStatusesBulk(
    apps: { id: string; name: string; status: string; updated_at?: string | null }[],
    namespace = "default"
  ): Promise<{
    changed: number;
    skipped: number;
    unreachable: boolean;
    /** appId → newly written status, for callers holding stale copies in memory. */
    updates: Map<string, AppStatus>;
  }> {
    const updates = new Map<string, AppStatus>();
    if (apps.length === 0) return { changed: 0, skipped: 0, unreachable: false, updates };

    let readiness: Map<string, { replicas: number; readyReplicas: number }>;
    try {
      readiness = await KubernetesInfoService.listDeploymentReadiness(namespace);
    } catch (error) {
      console.warn(
        `[AppStatusService] Bulk sync skipped — K8s unreachable: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return { changed: 0, skipped: apps.length, unreachable: true, updates };
    }

    let changed = 0;
    let skipped = 0;

    for (const app of apps) {
      const previousStatus = app.status as AppStatus;

      // Same exclusions as syncStatus: these states are not K8s-derived.
      if (
        previousStatus === "pending" ||
        previousStatus === "stopped" ||
        previousStatus === "deleting" ||
        previousStatus === "building"
      ) {
        skipped++;
        continue;
      }

      const info = readiness.get(app.name);
      const newStatus: AppStatus = info && info.readyReplicas > 0 ? "running" : "failed";

      if (newStatus === previousStatus) {
        skipped++;
        continue;
      }

      // Don't flip running → failed while a rollout is still stabilising.
      if (previousStatus === "running" && newStatus === "failed") {
        const inMemoryGrace = (() => {
          const lastSet = this.recentStatusSets.get(app.id);
          return lastSet != null && Date.now() - lastSet < this.STATUS_GRACE_PERIOD_MS;
        })();
        const durableGrace = app.updated_at
          ? Date.now() - new Date(app.updated_at).getTime() < this.STATUS_GRACE_PERIOD_MS
          : false;
        if (inMemoryGrace || durableGrace) {
          skipped++;
          continue;
        }
      }

      const reason = info
        ? `${info.readyReplicas}/${info.replicas} pods ready`
        : "Deployment not found in K8s";

      const updateResult = await Platform_Apps.update(app.id, {
        status: newStatus,
        last_failure_reason: newStatus === "failed" ? reason : null,
      });

      if (updateResult.success) {
        console.log(
          `[AppStatusService] ✅ Bulk synced: ${app.name} ${previousStatus} → ${newStatus} (${reason})`
        );
        updates.set(app.id, newStatus);
        changed++;
      } else {
        console.error(`[AppStatusService] Bulk sync failed for ${app.name}: ${updateResult.error}`);
        skipped++;
      }
    }

    return { changed, skipped, unreachable: false, updates };
  }

  /**
   * Force set status (use sparingly - only for build start/end, manual stop, etc.)
   * This bypasses K8s check for states that aren't K8s-managed
   */
  static async setStatus(
    appId: string,
    status: AppStatus,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const updateData: Record<string, unknown> = { status };
      
      if (status === "failed" && reason) {
        updateData.last_failure_reason = reason;
      } else if (status === "running") {
        updateData.last_failure_reason = null;
      }

      const result = await Platform_Apps.update(appId, updateData);
      
      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Record the timestamp so syncStatus() can enforce a grace period
      this.recentStatusSets.set(appId, Date.now());

      console.log(`[AppStatusService] ✅ Status set: ${appId} → ${status}${reason ? ` (${reason})` : ''}`);
      return { success: true };
    } catch (error) {
      console.error(`[AppStatusService] Set status failed:`, error);
      return { 
        success: false, 
        error: GENERIC_SERVICE_ERROR,      };
    }
  }

  // ─── Operation outcome helpers ─────────────────────────────────────────────
  //
  // These are the ONLY place the "what status should an app be after operation
  // X?" rule lives. All callers (AppOperationFinalizer, BuildPollingService,
  // recover-build, etc.) must go through applyOperationStatus instead of
  // calling setStatus or writing to the DB directly with a status field.

  /**
   * Pure rule: given an operation outcome, return what app status + failure
   * reason the app should have.
   *
   * Rule:
   *   success            → running,  clear failure reason
   *   failed + prior release live → running,  record failure reason (new build failed but old one still serves)
   *   failed + no prior release  → failed,   record failure reason
   */
  static resolveOperationStatus(params: {
    operationStatus: "success" | "failed";
    hasActiveDeployment: boolean;
    failureReason?: string | null;
  }): { status: AppStatus; lastFailureReason: string | null } {
    if (params.operationStatus === "success") {
      return { status: "running", lastFailureReason: null };
    }
    if (params.hasActiveDeployment) {
      // Old release is still live — don't downgrade the whole app to "failed"
      return { status: "running", lastFailureReason: params.failureReason ?? null };
    }
    return { status: "failed", lastFailureReason: params.failureReason ?? null };
  }

  /**
   * Apply the canonical post-operation status to the database.
   * This is the SINGLE place that writes running/failed after any build, resize,
   * rollback, or runtime operation completes.
   *
   * It fetches active_deployment_id from the DB, delegates to
   * resolveOperationStatus for the decision, then writes atomically.
   */
  static async applyOperationStatus(params: {
    appId: string;
    operationStatus: "success" | "failed";
    trigger: string;
    commitSha?: string | null;
    failureReason?: string | null;
  }): Promise<void> {
    const appRecord = await Platform_Apps.get(params.appId);
    if (!appRecord.success) {
      // Non-fatal: on DB failure, assume a prior release IS live (conservative toward
      // availability — don't downgrade a running app to "failed" just because we
      // couldn't confirm the active_deployment_id).
      console.warn(
        `[AppStatusService] applyOperationStatus: DB lookup failed for ${params.appId}: ${appRecord.error}`
      );
    }
    // If DB lookup failed we assume hasActiveDeployment=true to avoid wrongly
    // marking a live app as failed. The failure reason is still stored.
    const hasActiveDeployment =
      !appRecord.success || appRecord.data?.active_deployment_id != null;

    const { status, lastFailureReason } = this.resolveOperationStatus({
      operationStatus: params.operationStatus,
      hasActiveDeployment,
      failureReason: params.failureReason,
    });

    const result = await Platform_Apps.update(params.appId, {
      status,
      last_deploy_trigger: params.trigger,
      last_deploy_commit: params.commitSha ?? null,
      last_failure_reason: lastFailureReason,
    });

    if (!result.success) {
      throw new Error(result.error || "applyOperationStatus: DB update failed");
    }

    // Record timestamp so syncStatus() grace period works correctly
    this.recentStatusSets.set(params.appId, Date.now());

    console.log(
      `[AppStatusService] applyOperationStatus: ${params.appId} → ${status}` +
        (lastFailureReason ? ` (${lastFailureReason})` : "") +
        (hasActiveDeployment && params.operationStatus === "failed"
          ? " [prior release preserved]"
          : "")
    );
  }

  /**
   * Helper to sync status after a K8s operation (restart, link DB, etc.)
   * Waits a bit for pods to stabilize then syncs
   */
  static async syncAfterK8sOperation(
    appId: string,
    appName: string,
    waitMs = 5000
  ): Promise<StatusSyncResult> {
    // Wait for pods to stabilize
    if (waitMs > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
    
    return this.syncStatus(appId, appName);
  }
}
