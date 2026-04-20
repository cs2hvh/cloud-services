import { getRatesForPlatformApp } from "@/config/pricing";
import { Platform_App_Deployments } from "@/lib/supabase/queries";
import { Platform_Apps } from "@/lib/supabase/queries/platform_apps";
import { Billing } from "@/lib/supabase/queries/billing";

type PlatformAppSize = "small" | "medium" | "large";

export class PlatformAppBillingService {
  private static normalizeSize(size?: string | null): PlatformAppSize {
    if (size === "medium" || size === "large") {
      return size;
    }
    return "small";
  }

  /**
   * Activate billing only once, when the app reaches its first confirmed
   * successful deployment. This avoids charging during the initial build
   * window where Jenkins has started but the app is not yet healthy.
   */
  static async activateInitialBillingIfNeeded(
    appId: string,
    currentDeploymentId?: string | null
  ): Promise<{
    success: boolean;
    activated: boolean;
    alreadyActive: boolean;
    skipped: boolean;
    reason?: string;
    error?: string;
  }> {
    const appResult = await Platform_Apps.get(appId);
    if (!appResult.success || !appResult.data) {
      return {
        success: false,
        activated: false,
        alreadyActive: false,
        skipped: false,
        error: appResult.error || "App not found while activating billing",
      };
    }

    const app = appResult.data as {
      user_id: string;
      size?: string | null;
      active_deployment_id?: string | null;
    };

    const activeBilling = await Billing.get_active_platform_app({
      serviceId: appId,
      userId: app.user_id,
    });

    if (!activeBilling.success) {
      return {
        success: false,
        activated: false,
        alreadyActive: false,
        skipped: false,
        error: activeBilling.error || "Failed to inspect platform app billing state",
      };
    }

    if (activeBilling.data) {
      return {
        success: true,
        activated: false,
        alreadyActive: true,
        skipped: true,
        reason: "Billing already active for this app",
      };
    }

    // Prefer the deployment currently being finalized. Both success call sites invoke
    // billing activation before set_active_for_app(), so this remains a stable way to
    // distinguish "first successful deployment" from later successful redeployments.
    const referenceDeploymentId = currentDeploymentId ?? app.active_deployment_id ?? null;
    if (referenceDeploymentId) {
      const previousSuccessful = await Platform_App_Deployments.get_previous_successful(
        appId,
        referenceDeploymentId
      );

      if (!previousSuccessful.success) {
        return {
          success: false,
          activated: false,
          alreadyActive: false,
          skipped: false,
          error:
            previousSuccessful.error ||
            "Failed to inspect deployment history while activating billing",
        };
      }

      if (previousSuccessful.data) {
        return {
          success: true,
          activated: false,
          alreadyActive: false,
          skipped: true,
          reason: "App already has a previous successful deployment; skipping initial billing",
        };
      }
    }

    const size = this.normalizeSize(app.size);
    const { initialCost, hourlyRate } = await getRatesForPlatformApp(size);

    try {
      await Billing.activate_platform_app({
        userId: app.user_id,
        serviceId: appId,
        initialCost,
        hourlyRate,
      });

      return {
        success: true,
        activated: true,
        alreadyActive: false,
        skipped: false,
      };
    } catch (error) {
      return {
        success: false,
        activated: false,
        alreadyActive: false,
        skipped: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
