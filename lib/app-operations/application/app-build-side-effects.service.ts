import { getRatesForPlatformApp } from "@/config/pricing";
import { Platform_Apps } from "@/lib/supabase/queries";
import { Billing } from "@/lib/supabase/queries/billing";
import { PlatformAppBillingService } from "@/lib/services/platform-app-billing";
import {
  PlatformAppBandwidthService,
  syncMaxRequestBodySize,
  removeBandwidthRestriction,
} from "@/lib/services/platform-app-bandwidth";
import { createServiceClient } from "@/lib/supabase/server";
import { monthBounds, dateOnly } from "@/lib/services/platform-app-bandwidth/utils";
import { AppOperationLogger } from "@/lib/app-operations/application/app-operation-logger";
import type {
  AppDeploymentRecord,
  AppDeploymentTrigger,
  AppOperationDetails,
} from "@/lib/app-operations/core/types";

type PlatformAppSize = "small" | "medium" | "large" | "xlarge" | "xxlarge";

function isPlatformAppSize(value: string | undefined): value is PlatformAppSize {
  return value === "small" || value === "medium" || value === "large" || value === "xlarge" || value === "xxlarge";
}

export class AppBuildSideEffectsService {
  constructor(private readonly logger = new AppOperationLogger({})) {}

  private async applyResizeSideEffects(params: {
    appId: string;
    appName: string;
    record: AppDeploymentRecord;
    details: AppOperationDetails;
    status: "success" | "failed";
  }): Promise<string[]> {
    const targetSize = isPlatformAppSize(params.details.target?.size)
      ? params.details.target.size
      : undefined;
    const sourceSize = isPlatformAppSize(params.details.source?.size)
      ? params.details.source.size
      : undefined;
    const warnings: string[] = [];

    if (!targetSize && !sourceSize) {
      return warnings;
    }

    const logger = this.logger.child({
      app_id: params.appId,
      app_name: params.appName,
      operation_id: params.record.id,
      build_number: params.record.build_number,
      trigger: params.record.trigger,
    });

    try {
      if (params.status === "success") {
        if (!targetSize) return warnings;
        const appUpdate = await Platform_Apps.update(params.appId, { size: targetSize });
        if (!appUpdate.success) {
          throw new Error(appUpdate.error || "Failed to update app size after resize");
        }

        const { hourlyRate } = await getRatesForPlatformApp(targetSize);
        const billingUpdate = await Billing.update_active_platform_app_rate({
          serviceId: params.appId,
          newHourlyRate: hourlyRate,
        });

        if (!billingUpdate.updated) {
          logger.info("Skipped resize billing rate update because billing is not active yet", {
            target_size: targetSize,
          });
        }

        // Sync NGINX proxy-body-size and lift any active bandwidth restriction.
        try {
          const quota = await PlatformAppBandwidthService.getQuotaForSize(targetSize);
          const planMaxBytes = quota.maxRequestBodyBytes;
          const planMaxMb = planMaxBytes !== null ? Math.floor(planMaxBytes / (1024 * 1024)) : null;

          // Re-fetch app to get latest custom_request_body_mb (may be set by user).
          const freshApp = await Platform_Apps.get(params.appId);
          const customMb = freshApp.success ? (freshApp.data?.custom_request_body_mb ?? null) : null;

          // Clamp custom value to new plan max (handles plan downgrades).
          const effectiveMb =
            customMb !== null && planMaxMb !== null
              ? Math.min(customMb, planMaxMb)
              : planMaxMb;
          const effectiveBodyBytes = effectiveMb !== null ? effectiveMb * 1024 * 1024 : planMaxBytes;

          // If we had to clamp the custom value, persist the updated limit.
          if (customMb !== null && planMaxMb !== null && customMb > planMaxMb) {
            await Platform_Apps.update(params.appId, { custom_request_body_mb: planMaxMb }).catch(() => {});
          }

          const bodyResult = await syncMaxRequestBodySize(params.appName, effectiveBodyBytes);
          if (!bodyResult.synced) {
            logger.warn("Failed to sync proxy-body-size after resize", {
              target_size: targetSize,
              error: bodyResult.error,
            });
          }

          // If the app was bandwidth-restricted on the old plan, check whether the
          // new (larger) quota resolves the restriction. Lift immediately so the user
          // doesn't have to wait for the next cron sync after upgrading.
          const currentUsage = await PlatformAppBandwidthService.getCurrentUsage(params.appId);
          if (currentUsage?.lifecycle_status === "restricted" && quota.totalBytes !== null) {
            const purchasedBytes = Number(currentUsage.purchased_bytes) || 0;
            const effectiveQuota = quota.totalBytes + purchasedBytes;
            if (Number(currentUsage.total_bytes) < effectiveQuota) {
              const liftResult = await removeBandwidthRestriction(params.appName);
              if (liftResult.removed) {
                const supabase = await createServiceClient();
                const { start } = monthBounds();
                await supabase
                  .from("platform_app_bandwidth_usage_monthly")
                  .update({ lifecycle_status: "ok", restored_at: new Date().toISOString(), restricted_at: null })
                  .eq("app_id", params.appId)
                  .eq("period_start", dateOnly(start));
                logger.info("Lifted bandwidth restriction after resize", { target_size: targetSize });
              }
            }
          }
        } catch (err) {
          logger.warn("Error syncing bandwidth/proxy-body-size after resize", {
            error: err instanceof Error ? err.message : String(err),
          });
        }

        logger.info("Applied resize success side effects", { target_size: targetSize });
        return warnings;
      }

      if (!sourceSize) return warnings;
      const appUpdate = await Platform_Apps.update(params.appId, { size: sourceSize });
      if (!appUpdate.success) {
        throw new Error(appUpdate.error || "Failed to restore app size after resize failure");
      }
      logger.info("Applied resize failure rollback side effects", {
        restored_size: sourceSize,
      });
      return warnings;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown resize side-effect error";
      warnings.push(message);
      logger.error("Failed to apply resize side effects", {
        status: params.status,
        source_size: sourceSize,
        target_size: targetSize,
        error: message,
      });
      return warnings;
    }
  }

  private async activateInitialBilling(params: {
    appId: string;
    appName: string;
    record: AppDeploymentRecord;
  }): Promise<string[]> {
    const warnings: string[] = [];
    const logger = this.logger.child({
      app_id: params.appId,
      app_name: params.appName,
      operation_id: params.record.id,
      build_number: params.record.build_number,
      trigger: params.record.trigger,
    });

    const billingActivation = await PlatformAppBillingService.activateInitialBillingIfNeeded(
      params.appId,
      params.record.id
    );

    if (!billingActivation.success) {
      warnings.push(billingActivation.error || "Failed to activate initial billing");
      logger.error("Failed to activate initial billing", {
        error: billingActivation.error,
      });
    }

    // Sync NGINX proxy-body-size to match the plan quota (or user's custom limit).
    // Non-critical: runs fire-and-forget style so a K8s error never fails the deploy.
    try {
      const appResult = await Platform_Apps.get(params.appId);
      if (appResult.success && appResult.data?.size) {
        const quota = await PlatformAppBandwidthService.getQuotaForSize(appResult.data.size);
        const planMaxBytes = quota.maxRequestBodyBytes;
        const planMaxMb = planMaxBytes !== null ? Math.floor(planMaxBytes / (1024 * 1024)) : null;
        const customMb = appResult.data.custom_request_body_mb ?? null;
        const effectiveMb =
          customMb !== null && planMaxMb !== null
            ? Math.min(customMb, planMaxMb)
            : planMaxMb;
        const effectiveBodyBytes = effectiveMb !== null ? effectiveMb * 1024 * 1024 : planMaxBytes;
        const bodyResult = await syncMaxRequestBodySize(params.appName, effectiveBodyBytes);
        if (!bodyResult.synced) {
          logger.warn("Failed to sync proxy-body-size after deploy", {
            app_size: appResult.data.size,
            error: bodyResult.error,
          });
        }
      }
    } catch (err) {
      logger.warn("Error syncing proxy-body-size after deploy", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return warnings;
  }

  async applyBuildFinalizationSideEffects(params: {
    appId: string;
    appName: string;
    record: AppDeploymentRecord;
    details: AppOperationDetails;
    trigger: AppDeploymentTrigger;
    status: "success" | "failed";
  }): Promise<string[]> {
    if (params.trigger === "resize") {
      return this.applyResizeSideEffects({
        appId: params.appId,
        appName: params.appName,
        record: params.record,
        details: params.details,
        status: params.status,
      });
    }

    if (params.status === "success" && params.trigger !== "rollback") {
      return this.activateInitialBilling({
        appId: params.appId,
        appName: params.appName,
        record: params.record,
      });
    }

    return [];
  }
}
