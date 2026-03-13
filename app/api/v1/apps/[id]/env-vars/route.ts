import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1ExtractId, v1TransformValidationError, v1VerifyOwnership } from "@/lib/api/v1-helpers";
import { Platform_Apps } from "@/lib/supabase/queries";
import { analyzeEnvLifecycle, ReplaceEnvVarsRequestSchema, type EnvVar } from "@/lib/env/lifecycle";
import { reconcileRuntimeEnv } from "@/lib/services/runtime-env-reconciler";

async function getOwnedApp(appId: string, userId: string) {
  const existing = await Platform_Apps.get(appId);
  if (!existing.success || !existing.data) {
    return { app: null, error: v1Error("NOT_FOUND", 404, "App not found") };
  }

  const ownershipError = v1VerifyOwnership(existing.data.user_id, userId, "app", "modify");
  if (ownershipError) {
    return { app: null, error: ownershipError };
  }

  return { app: existing.data, error: null };
}

export const GET = withV1Auth("apps:env:list", async (_req, auth, context) => {
  const { id, error } = await v1ExtractId(context);
  if (error) {
    return error;
  }

  const ownership = await getOwnedApp(id, auth.userId);
  if (ownership.error) {
    return ownership.error;
  }

  const envVars = await Platform_Apps.get_env_vars(id);

  return v1Ok({
    data: {
      app_id: id,
      framework: ownership.app!.framework ?? null,
      env_vars: envVars.map((env: { key: string; value: string }) => ({
        key: env.key,
        value: env.value,
      })),
    },
    meta: {
      total: envVars.length,
    },
  });
});

export const PUT = withV1Auth("apps:env:replace", async (req, auth, context) => {
  const { id, error } = await v1ExtractId(context);
  if (error) {
    return error;
  }

  const ownership = await getOwnedApp(id, auth.userId);
  if (ownership.error) {
    return ownership.error;
  }

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return v1Error("VALIDATION_ERROR", 400, "Invalid request body");
  }

  const validation = ReplaceEnvVarsRequestSchema.safeParse(parsedBody);
  if (!validation.success) {
    return v1TransformValidationError(validation.error);
  }

  const envVars = validation.data.env_vars as EnvVar[];
  const setResult = await Platform_Apps.set_env_vars(id, envVars);
  if (!setResult.success) {
    return v1Error("UPDATE_FAILED", 500, "Failed to update environment variables");
  }

  const app = ownership.app!;
  const lifecycle = analyzeEnvLifecycle(app.framework ?? null, envVars);
  const ignoredKeys = lifecycle.ignoredKeys;

  // Persisted only until next deploy if the app is not running.
  if (app.status !== "running") {
    return v1Ok({
      data: {
        app_id: id,
        framework: app.framework ?? null,
        env_vars: envVars,
        apply: {
          applied_live: false,
          requires_redeploy: true,
          mode: "persisted_only",
          reason: `App is not currently running (status: ${app.status}).`,
          hint: "Redeploy to apply environment variables.",
          ignored_keys: ignoredKeys,
        },
      },
    });
  }

  const syncAction = lifecycle.mode === "build_time_only" || lifecycle.ignoredOnly
    ? "secret_only"
    : "secret_and_restart";
  const runtimeSync = await reconcileRuntimeEnv({
    appName: app.name,
    framework: app.framework ?? null,
    envVars,
    policy: "best_effort",
    action: syncAction,
    cleanupWhenEmpty: true,
    reconcileDeploymentEnvFrom: syncAction === "secret_only",
  });

  if (runtimeSync.status === "warning" || runtimeSync.status === "failed") {
    return v1Ok({
      data: {
        app_id: id,
        framework: app.framework ?? null,
        env_vars: envVars,
        apply: {
          applied_live: false,
          requires_redeploy: true,
          mode: "persisted_only",
          reason: runtimeSync.reason,
          hint: "Changes are saved. Retry update or redeploy after Kubernetes connectivity is restored.",
          ignored_keys: ignoredKeys,
        },
      },
    });
  }

  if (runtimeSync.status === "skipped" && syncAction === "secret_and_restart") {
    return v1Ok({
      data: {
        app_id: id,
        framework: app.framework ?? null,
        env_vars: envVars,
        apply: {
          applied_live: false,
          requires_redeploy: true,
          mode: "persisted_only",
          reason: runtimeSync.reason,
          hint: "Environment variables are saved. Redeploy to apply changes.",
          ignored_keys: ignoredKeys,
        },
      },
    });
  }

  if (lifecycle.ignoredOnly) {
    return v1Ok({
      data: {
        app_id: id,
        framework: app.framework ?? null,
        env_vars: envVars,
        apply: {
          applied_live: false,
          requires_redeploy: false,
          mode: "persisted_only",
          reason: lifecycle.reason,
          hint: "All provided keys are ignored by this framework pipeline. Use required public prefixes.",
          ignored_keys: ignoredKeys,
        },
      },
    });
  }

  if (lifecycle.mode === "build_time_only") {
    return v1Ok({
      data: {
        app_id: id,
        framework: app.framework ?? null,
        env_vars: envVars,
        apply: {
          applied_live: false,
          requires_redeploy: true,
          mode: lifecycle.mode,
          reason: lifecycle.reason,
          hint: "Build-time variables are saved. Redeploy to apply changes.",
          ignored_keys: ignoredKeys,
        },
      },
    });
  }

  // Best-effort status sync after rolling restart.
  try {
    const { AppStatusService } = await import("@/lib/services/app-status");
    await AppStatusService.syncAfterK8sOperation(id, app.name, 5000);
  } catch {
    // Non-blocking: env updates are already persisted and applied.
  }

  const isLiveOnly = !lifecycle.requiresRedeploy;
  return v1Ok({
    data: {
      app_id: id,
      framework: app.framework ?? null,
      env_vars: envVars,
      apply: {
        applied_live: true,
        requires_redeploy: lifecycle.requiresRedeploy,
        mode: lifecycle.mode,
        reason: lifecycle.reason,
        hint: isLiveOnly
          ? "All variables applied live via rolling restart."
          : "Runtime variables are live now. Redeploy to apply build-time variables.",
        ignored_keys: ignoredKeys,
      },
    },
  });
});
