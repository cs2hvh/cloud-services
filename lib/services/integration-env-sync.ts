import { analyzeEnvLifecycle, type EnvApplyMode } from "@/lib/env/lifecycle";
import { reconcileRuntimeEnv } from "./runtime-env-reconciler";

export interface IntegrationEnvSyncOptions {
  appId: string;
  appName: string;
  appStatus: string | null | undefined;
  framework: string | null | undefined;
  envVars: Array<{ key: string; value: string }>;
  logPrefix: string;
}

export interface IntegrationEnvSyncOutcome {
  redeployTriggered: boolean;
  appliedLive: boolean;
  requiresRedeploy: boolean;
  applyMode: EnvApplyMode;
  hint: string;
  reason: string;
}

/**
 * Applies integration-injected env vars with the same lifecycle behavior used by env update APIs.
 * Keeps integration behavior consistent across database and object-storage flows.
 */
export async function applyLifecycleAwareIntegrationEnvSync(
  options: IntegrationEnvSyncOptions
): Promise<IntegrationEnvSyncOutcome> {
  const { appId, appName, appStatus, framework, envVars, logPrefix } = options;
  const lifecycle = analyzeEnvLifecycle(framework ?? null, envVars);

  if (appStatus !== "running" && appStatus !== "failed") {
    return {
      redeployTriggered: false,
      appliedLive: false,
      requiresRedeploy: true,
      applyMode: "persisted_only",
      hint: "Changes are saved. Redeploy to apply them.",
      reason: `App is not currently running (status: ${appStatus ?? "unknown"})`,
    };
  }

  const syncAction =
    lifecycle.mode === "build_time_only" || lifecycle.ignoredOnly
      ? "secret_only"
      : "secret_and_restart";

  const runtimeSync = await reconcileRuntimeEnv({
    appName,
    framework: framework ?? null,
    envVars,
    policy: "best_effort",
    action: syncAction,
    cleanupWhenEmpty: true,
    reconcileDeploymentEnvFrom: syncAction === "secret_only",
  });

  const syncFailed = runtimeSync.status === "warning" || runtimeSync.status === "failed";
  const skippedLiveApply =
    runtimeSync.status === "skipped" && syncAction === "secret_and_restart";
  const restartTriggered =
    runtimeSync.status === "applied" && syncAction === "secret_and_restart";

  if (restartTriggered) {
    try {
      const { AppStatusService } = await import("./app-status");
      const syncResult = await AppStatusService.syncAfterK8sOperation(appId, appName, 5000);
      if (syncResult.changed) {
        console.log(
          `[${logPrefix}] ✅ Status synced: ${syncResult.previousStatus} → ${syncResult.currentStatus}`
        );
      }
    } catch (syncError) {
      console.error(`[${logPrefix}] Status sync failed (non-critical):`, syncError);
    }
  }

  const requiresRedeploy =
    syncFailed ||
    skippedLiveApply ||
    (!lifecycle.ignoredOnly && lifecycle.requiresRedeploy);

  const applyMode: EnvApplyMode =
    lifecycle.ignoredOnly || syncFailed || skippedLiveApply
      ? "persisted_only"
      : lifecycle.mode;

  let hint = "Environment variables were applied with a rolling restart.";
  if (syncFailed) {
    hint = "Changes are saved. Retry later or redeploy after Kubernetes connectivity is restored.";
  } else if (lifecycle.ignoredOnly) {
    hint = "All integration keys are ignored by this framework pipeline.";
  } else if (requiresRedeploy && restartTriggered) {
    hint = "Runtime changes are live now. Redeploy to apply build-time variables.";
  } else if (requiresRedeploy) {
    hint = "Changes are saved. Redeploy to apply build-time variables.";
  }

  return {
    redeployTriggered: restartTriggered,
    appliedLive: restartTriggered,
    requiresRedeploy,
    applyMode,
    hint,
    reason: syncFailed || skippedLiveApply ? runtimeSync.reason : lifecycle.reason,
  };
}
