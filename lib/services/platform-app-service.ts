/**
 * Platform App Service
 * Centralized business logic for platform app operations
 * Used by both internal service endpoints and public v1 API
 */
import { DeploymentService } from "./deployment";
import { Platform_Apps, Platform_App_Deployments } from "@/lib/supabase/queries";
import { Projects } from "@/lib/supabase/queries/projects";
import { Billing } from "@/lib/supabase/queries/billing";
import { NotificationService, createServiceNotification } from "@/lib/notifications/service";
import { AppStatusService } from "./app-status";

export interface DeleteAppOptions {
  appId: string;
  userId: string;
  isAdmin?: boolean;
}

export interface DeleteAppResult {
  success: boolean;
  appName: string;
  error?: string;
}

export interface GetAppOptions {
  appId: string;
  userId: string;
  syncStatus?: boolean;  // Sync live status from Kubernetes
  includeEnvVars?: boolean;
}

export interface ListAppsOptions {
  userId: string;
  includeRollbackInfo?: boolean;  // Check deployment history for rollback capability
}

export class PlatformAppService {
  /**
   * Get a single app by ID
   * - Fetches app from database
   * - Optionally syncs live status from Kubernetes
   * - Optionally includes environment variables
   * 
   * @throws Error if app not found or unauthorized
   */
  static async getApp(options: GetAppOptions) {
    const { appId, userId, syncStatus = false, includeEnvVars = false } = options;

    const result = await Platform_Apps.get(appId);
    
    if (!result.success || !result.data) {
      const error = new Error('App not found') as Error & { code?: string };
      error.code = 'NOT_FOUND';
      throw error;
    }

    const app = result.data;

    // Verify ownership
    if (app.user_id !== userId) {
      const error = new Error('Unauthorized') as Error & { code?: string };
      error.code = 'FORBIDDEN';
      throw error;
    }

    let syncedStatus = app.status;

    // Sync live status from K8s if requested
    if (syncStatus) {
      try {
        const syncResult = await AppStatusService.syncStatus(
          appId,
          app.name,
          app.status as "running" | "failed" | "pending" | "building" | "stopped"
        );
        syncedStatus = syncResult.currentStatus;
      } catch (syncErr) {
        console.warn('[PlatformAppService.getApp] Status sync failed:', syncErr);
        // Don't fail the request, use cached status
      }
    }

    // Get environment variables if requested
    let envVars = undefined;
    if (includeEnvVars) {
      try {
        envVars = await Platform_Apps.get_env_vars(appId);
      } catch (envErr) {
        console.warn('[PlatformAppService.getApp] Env vars fetch failed:', envErr);
      }
    }

    return {
      ...app,
      status: syncedStatus,
      env_vars: envVars,
    };
  }

  /**
   * List all apps for a user
   * - Fetches all apps owned by user
   * - Optionally checks rollback capability (requires deployment history lookup)
   */
  static async listApps(options: ListAppsOptions) {
    const { userId, includeRollbackInfo = false } = options;

    const apps = await Platform_Apps.list_by_owner(userId);

    if (!includeRollbackInfo) {
      return apps || [];
    }

    // Add rollback capability check
    const appsWithRollback = await Promise.all(
      (apps || []).map(async (app: { id: string; active_deployment_id?: string | null }) => {
        try {
          const prev = await Platform_App_Deployments.get_previous_successful(
            app.id,
            app.active_deployment_id ?? null
          );
          const canRollback = !!(prev.success && prev.data);
          return { ...app, can_rollback: canRollback };
        } catch (err) {
          console.warn(`[PlatformAppService.listApps] Rollback check failed for ${app.id}:`, err);
          return { ...app, can_rollback: false };
        }
      })
    );

    return appsWithRollback;
  }
  /**
   * Delete a platform app with full cleanup
   * - Deletes infrastructure via DeploymentService
   * - Closes billing (prorated)
   * - Adds project activity log
   * - Creates user notification
   * 
   * @throws Error if deletion fails
   */
  static async deleteApp(options: DeleteAppOptions): Promise<DeleteAppResult> {
    const { appId, userId, isAdmin = false } = options;

    // Get app details before deletion for logging
    const appDetails = await Platform_Apps.get(appId);
    const appName = appDetails.success ? appDetails.data?.name : 'Unknown';
    const projectId = appDetails.success ? appDetails.data?.project_id : null;
    const repoName = appDetails.success ? appDetails.data?.repository_name : 'Unknown';

    try {
      // 1. Delete infrastructure using deployment service
      await DeploymentService.delete(appId, userId, isAdmin);

      // 2. Close active billing (prorated final charge)
      try {
        const billingResult = await Billing.close_active_service("platform_apps", {
          userId,
          serviceId: appId,
          failOnInsufficient: false, // Don't block deletion if user has no balance
        });
        console.log('[PlatformAppService.deleteApp] Billing closed:', {
          appId,
          charged: billingResult.charged,
          newBalance: billingResult.newBalance,
        });
      } catch (billingError) {
        console.warn('[PlatformAppService.deleteApp] Failed to close billing:', billingError);
        // Don't fail the deletion - billing cleanup can be handled separately
      }

      // 3. Add project activity log if project_id exists
      if (projectId) {
        try {
          await Projects.add_log({
            project_id: projectId,
            event: "Platform App Deleted",
            text: `Deleted app "${appName}" (${repoName})`,
          });
        } catch (logError) {
          console.warn('[PlatformAppService.deleteApp] Failed to add project log:', logError);
        }
      }

      // 4. Create success notification
      try {
        await NotificationService.create(
          createServiceNotification({
            userId,
            type: 'success',
            action: 'deleted',
            serviceType: 'platform_app',
            serviceName: appName,
            serviceId: appId,
          })
        );
      } catch (notifError) {
        console.error('[PlatformAppService.deleteApp] Failed to create notification:', notifError);
      }

      return { success: true, appName };

    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";

      // Create failure notification
      try {
        await NotificationService.create(
          createServiceNotification({
            userId,
            type: 'error',
            action: 'failed',
            serviceType: 'platform_app',
            serviceName: appName,
            error: `Deletion failed: ${errorMsg}`,
          })
        );
      } catch (notifError) {
        console.error('[PlatformAppService.deleteApp] Failed to create error notification:', notifError);
      }

      throw error; // Re-throw for caller to handle
    }
  }
}
