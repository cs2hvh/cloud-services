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
      const deploymentInfo = await KubernetesInfoService.getDeploymentInfo(appName, namespace);

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
    currentDbStatus?: AppStatus
  ): Promise<StatusSyncResult> {
    try {
      // Get current DB status if not provided
      let previousStatus = currentDbStatus;
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

      // Determine new status based on K8s state
      const newStatus: AppStatus = health.healthy ? "running" : "failed";

      // Grace period: after a deployment completes, pods may still be stabilising
      // (rolling update). Don't flip running → failed during the grace window.
      if (previousStatus === "running" && newStatus === "failed") {
        const lastSet = this.recentStatusSets.get(appId);
        if (lastSet && Date.now() - lastSet < this.STATUS_GRACE_PERIOD_MS) {
          return {
            success: true,
            previousStatus,
            currentStatus: previousStatus,
            changed: false,
            reason: `Skipping running→failed transition during grace period (${health.reason})`,
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
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
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
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
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
