import { getRatesForPlatformApp } from "@/config/pricing";
import { Platform_Apps } from "@/lib/supabase/queries";
import { Billing } from "@/lib/supabase/queries/billing";
import { PlatformAppBillingService } from "@/lib/services/platform-app-billing";
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
