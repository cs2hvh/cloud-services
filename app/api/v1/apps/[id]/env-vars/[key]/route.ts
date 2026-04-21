import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1ExtractId } from "@/lib/api/v1-helpers";
import { ENV_KEY_REGEX, MAX_ENV_KEY_LENGTH, analyzeEnvLifecycle, type EnvVar } from "@/lib/env/lifecycle";
import { reconcileRuntimeEnv } from "@/lib/services/runtime-env-reconciler";
import { PlatformAppEnvService } from "@/lib/services/platform-app-env-service";

async function getOwnedApp(appId: string, userId: string) {
  const result = await PlatformAppEnvService.getOwnedApp(appId, userId);
  if (!result.success) {
    if (result.errorCode === "NOT_FOUND") {
      return { app: null, error: v1Error("NOT_FOUND", 404, "App not found") };
    }
    if (result.errorCode === "FORBIDDEN") {
      return { app: null, error: v1Error("FORBIDDEN", 403, "Access denied") };
    }
    return { app: null, error: v1Error("INTERNAL_ERROR", 500, result.error || "Failed to fetch app") };
  }

  return { app: result.data, error: null };
}

async function extractKey(
  context: { params: Promise<{ [key: string]: string | string[] }> } | undefined
) {
  if (!context?.params) {
    return { key: null, error: v1Error("INTERNAL_ERROR", 500, "Missing route context") };
  }

  const rawParams = await context.params;
  const key = Array.isArray(rawParams.key) ? rawParams.key[0] : rawParams.key;
  const isStrictKey = !!key && ENV_KEY_REGEX.test(key);
  const isLegacyCompatibleKey =
    !!key &&
    key.length <= MAX_ENV_KEY_LENGTH &&
    /^[A-Za-z0-9_.-]+$/.test(key);
  if (!isStrictKey && !isLegacyCompatibleKey) {
    return {
      key: null,
      error: v1Error("INVALID_KEY", 400, "Invalid environment variable key format", {
        field: "key",
      }),
    };
  }

  return { key, error: null };
}

export const GET = withV1Auth("apps:env:get", async (_req, auth, context) => {
  const idResult = await v1ExtractId(context);
  if (idResult.error) return idResult.error;

  const keyResult = await extractKey(context);
  if (keyResult.error) return keyResult.error;

  const appId = idResult.id;
  const key = keyResult.key!;

  const ownership = await getOwnedApp(appId, auth.userId);
  if (ownership.error) return ownership.error;

  const envVars = await PlatformAppEnvService.getEnvVars(appId);
  const found = envVars.find((env: { key: string }) => env.key === key);
  if (!found) {
    return v1Error("NOT_FOUND", 404, "Environment variable key not found", { field: "key" });
  }

  return v1Ok({
    data: {
      app_id: appId,
      key: found.key,
      value: found.value,
    },
  });
});

export const DELETE = withV1Auth("apps:env:delete", async (_req, auth, context) => {
  const idResult = await v1ExtractId(context);
  if (idResult.error) {
    return idResult.error;
  }

  const keyResult = await extractKey(context);
  if (keyResult.error) {
    return keyResult.error;
  }

  const appId = idResult.id;
  const key = keyResult.key!;

  const ownership = await getOwnedApp(appId, auth.userId);
  if (ownership.error) {
    return ownership.error;
  }

  const app = ownership.app!;
  const envVars = await PlatformAppEnvService.getEnvVars(appId);
  const found = envVars.some((env: { key: string }) => env.key === key);
  if (!found) {
    return v1Error("NOT_FOUND", 404, "Environment variable key not found", {
      field: "key",
    });
  }

  const filteredVars = envVars
    .filter((env: { key: string }) => env.key !== key)
    .map((env: { key: string; value: string }) => ({
      key: env.key,
      value: env.value,
    })) as EnvVar[];

  const setResult = await PlatformAppEnvService.setEnvVars(appId, filteredVars);
  if (!setResult.success) {
    return v1Error("DELETE_FAILED", 500, setResult.error || "Failed to delete environment variable");
  }

  const lifecycle = analyzeEnvLifecycle(app.framework ?? null, filteredVars);
  const ignoredKeys = lifecycle.ignoredKeys;

  if (app.status !== "running") {
    return v1Ok({
      data: {
        app_id: appId,
        deleted_key: key,
        env_vars: filteredVars,
        apply: {
          applied_live: false,
          requires_redeploy: true,
          mode: "persisted_only",
          reason: `App is not currently running (status: ${app.status}).`,
          hint: "Redeploy to apply environment variable changes.",
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
    envVars: filteredVars,
    policy: "best_effort",
    action: syncAction,
    cleanupWhenEmpty: true,
    reconcileDeploymentEnvFrom: syncAction === "secret_only",
  });

  if (runtimeSync.status === "warning" || runtimeSync.status === "failed") {
    return v1Ok({
      data: {
        app_id: appId,
        deleted_key: key,
        env_vars: filteredVars,
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
        app_id: appId,
        deleted_key: key,
        env_vars: filteredVars,
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
        app_id: appId,
        deleted_key: key,
        env_vars: filteredVars,
        apply: {
          applied_live: false,
          requires_redeploy: false,
          mode: "persisted_only",
          reason: lifecycle.reason,
          hint: "Remaining keys are ignored by this framework pipeline. Use required public prefixes.",
          ignored_keys: ignoredKeys,
        },
      },
    });
  }

  if (lifecycle.mode === "build_time_only") {
    return v1Ok({
      data: {
        app_id: appId,
        deleted_key: key,
        env_vars: filteredVars,
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

  try {
    const { AppStatusService } = await import("@/lib/services/app-status");
    await AppStatusService.syncAfterK8sOperation(appId, app.name, 5000);
  } catch {
    // Non-blocking
  }

  return v1Ok({
    data: {
      app_id: appId,
      deleted_key: key,
      env_vars: filteredVars,
      apply: {
        applied_live: true,
        requires_redeploy: lifecycle.requiresRedeploy,
        mode: lifecycle.mode,
        reason: lifecycle.reason,
        hint: lifecycle.requiresRedeploy
          ? "Runtime variables are live now. Redeploy to apply build-time variables."
          : "All remaining variables applied live via rolling restart.",
        ignored_keys: ignoredKeys,
      },
    },
  });
});
