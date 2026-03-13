import { analyzeEnvLifecycle, type EnvLifecycleAnalysis, type EnvVar } from "@/lib/env/lifecycle";
import { KubernetesInfoService } from "@/lib/services/kubernetes-info";

export type RuntimeEnvSyncPolicy = "strict" | "best_effort";
export type RuntimeEnvSyncAction = "secret_only" | "secret_and_restart";
export type RuntimeEnvSyncStatus = "applied" | "skipped" | "warning" | "failed";

export interface RuntimeEnvReconcileOptions {
  appName: string;
  framework: string | null | undefined;
  envVars: EnvVar[];
  policy: RuntimeEnvSyncPolicy;
  action: RuntimeEnvSyncAction;
  cleanupWhenEmpty?: boolean;
  reconcileDeploymentEnvFrom?: boolean;
  namespace?: string;
  retryCount?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

export interface RuntimeEnvReconcileResult {
  status: RuntimeEnvSyncStatus;
  lifecycle: EnvLifecycleAnalysis;
  runtimeEnvVars: EnvVar[];
  syncAttempted: boolean;
  reason: string;
  error?: string;
}

const SIMPLE_TEST_FRAMEWORKS = new Set(["simple-test", "test"]);
const DEFAULT_RETRY_COUNT = 1;
const DEFAULT_RETRY_DELAY_MS = 500;
const DEFAULT_TIMEOUT_MS = 4000;

function normalizeFramework(framework: string | null | undefined): string {
  return framework?.toLowerCase().trim() || "";
}

function isSimpleTestFramework(framework: string | null | undefined): boolean {
  return SIMPLE_TEST_FRAMEWORKS.has(normalizeFramework(framework));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

async function retryOperation<T>(
  operation: () => Promise<T>,
  retryCount: number,
  retryDelayMs: number
): Promise<T> {
  let lastError: unknown;
  const attempts = Math.max(0, retryCount) + 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await delay(retryDelayMs);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Runtime env sync failed");
}

function normalizeSyncError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

export async function reconcileRuntimeEnv(
  options: RuntimeEnvReconcileOptions
): Promise<RuntimeEnvReconcileResult> {
  const {
    appName,
    framework,
    envVars,
    policy,
    action,
    cleanupWhenEmpty = false,
    reconcileDeploymentEnvFrom = false,
    namespace = "default",
    retryCount = DEFAULT_RETRY_COUNT,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const lifecycle = analyzeEnvLifecycle(framework ?? null, envVars);
  const runtimeKeySet = new Set(lifecycle.runtimeKeys);
  const runtimeEnvVars = envVars.filter((env) => runtimeKeySet.has(env.key));

  if (isSimpleTestFramework(framework)) {
    return {
      status: "skipped",
      lifecycle,
      runtimeEnvVars,
      syncAttempted: false,
      reason: "Framework is simple-test; skipping runtime Kubernetes reconciliation.",
    };
  }

  const shouldSync = runtimeEnvVars.length > 0 || cleanupWhenEmpty;
  if (!shouldSync) {
    return {
      status: "skipped",
      lifecycle,
      runtimeEnvVars,
      syncAttempted: false,
      reason: "No runtime environment variables detected; runtime secret sync skipped.",
    };
  }

  try {
    const syncResult = await retryOperation(
      async () => {
        if (action === "secret_and_restart") {
          return withTimeout(
            KubernetesInfoService.updateEnvVarsAndRestart(appName, runtimeEnvVars, namespace),
            timeoutMs
          );
        }

        return withTimeout(
          KubernetesInfoService.syncEnvSecret(appName, runtimeEnvVars, namespace),
          timeoutMs
        );
      },
      retryCount,
      retryDelayMs
    );

    if (!syncResult.success) {
      throw new Error(syncResult.error || "Kubernetes runtime environment sync failed");
    }

    if (action === "secret_only" && reconcileDeploymentEnvFrom) {
      const envFromResult = await retryOperation(
        async () =>
          withTimeout(
            KubernetesInfoService.reconcileEnvFromReference(
              appName,
              runtimeEnvVars.length > 0,
              namespace
            ),
            timeoutMs
          ),
        retryCount,
        retryDelayMs
      );

      if (!envFromResult.success) {
        throw new Error(envFromResult.error || "Kubernetes envFrom reconciliation failed");
      }
    }

    return {
      status: "applied",
      lifecycle,
      runtimeEnvVars,
      syncAttempted: true,
      reason:
        action === "secret_and_restart"
          ? `Runtime environment reconciled with rolling restart (${runtimeEnvVars.length} vars).`
          : `Runtime secret reconciled (${runtimeEnvVars.length} vars).`,
    };
  } catch (error) {
    const message = normalizeSyncError(error);
    const reason = `Runtime environment reconciliation failed: ${message}`;

    if (policy === "strict") {
      return {
        status: "failed",
        lifecycle,
        runtimeEnvVars,
        syncAttempted: true,
        reason,
        error: message,
      };
    }

    return {
      status: "warning",
      lifecycle,
      runtimeEnvVars,
      syncAttempted: true,
      reason,
      error: message,
    };
  }
}
