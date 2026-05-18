// POST /api/v1/apps/[id]/redeploy — trigger a redeploy for an app (PAT auth)
import { withV1Auth, v1Ok, v1Error } from "@/lib/api/v1-middleware";
import { v1ExtractId } from "@/lib/api/v1-helpers";
import { Platform_Apps } from "@/lib/supabase/queries";
import { JenkinsService } from "@/lib/services/jenkins";
import { BuildPollingService } from "@/lib/services/build-polling";
import { reconcileRuntimeEnv } from "@/lib/services/runtime-env-reconciler";
import { getIdempotencyKey } from "@/lib/idempotency";
import { AuditLogService } from "@/lib/audit";
import {
  AppOperationError,
  AppReleaseBuildService,
  JenkinsBuildAdapter,
  resolveBuildBackedOperationState,
} from "@/lib/app-operations";
import { getGitProviderToken, buildAuthenticatedGitUrl } from "@/lib/git/provider-token";

export const POST = withV1Auth("apps:redeploy", async (req, auth, context) => {
  const idResult = await v1ExtractId(context);
  if (idResult.error) return idResult.error;
  const appId = idResult.id;

  const existing = await Platform_Apps.get(appId);
  if (!existing.success || !existing.data) {
    return v1Error("NOT_FOUND", 404, "App not found");
  }
  if (existing.data.user_id !== auth.userId) {
    return v1Error("FORBIDDEN", 403, "Access denied");
  }

  const app = existing.data;

  // Fetch env vars from DB for Jenkins job config update
  const envVarsData = await Platform_Apps.get_env_vars(appId);
  const envVars = envVarsData.map((ev: { key: string; value: string }) => ({
    key: ev.key,
    value: ev.value,
  }));

  // Resolve authenticated git URL
  let gitUrl: string =
    (app as { repository_url?: string }).repository_url ||
    (app as { git_url?: string }).git_url ||
    "";

  if (!gitUrl) {
    return v1Error("CONFIGURATION_ERROR", 422, "Repository URL not configured for this app");
  }

  const gitProvider = (app as { git_provider?: string }).git_provider;
  if (gitProvider === "github" || gitProvider === "gitlab" || gitProvider === "bitbucket") {
    let accessToken: string | null = null;
    try {
      accessToken = await getGitProviderToken(auth.userId, gitProvider);
    } catch {
      // token lookup failed
    }
    if (!accessToken) {
      return v1Error(
        "GIT_TOKEN_MISSING",
        403,
        `Your ${gitProvider} account is not connected or the access token has expired. Reconnect it in Account Settings before redeploying.`,
        { provider: gitProvider }
      );
    }
    gitUrl = buildAuthenticatedGitUrl(gitUrl, accessToken, gitProvider);
  }

  try {
    const releaseBuildService = new AppReleaseBuildService();
    const jenkins = new JenkinsBuildAdapter();

    const operation = await releaseBuildService.startReleaseBuild({
      appId: app.id,
      appName: app.name,
      appStatus: app.status,
      trigger: "manual",
      operationType: "redeploy",
      idempotencyKey: getIdempotencyKey(req.headers),
      onBeforeTrigger: async () => {
        const runtimeSync = await reconcileRuntimeEnv({
          appName: app.name,
          framework: app.framework ?? null,
          envVars,
          policy: "strict",
          action: "secret_only",
          cleanupWhenEmpty: false,
          retryCount: 3,
          retryDelayMs: 1000,
          timeoutMs: 8000,
        });
        if (runtimeSync.status === "failed") {
          throw new Error(runtimeSync.error || runtimeSync.reason);
        }
      },
      executor: async () => {
        await JenkinsService.updateJobConfig(
          app.name,
          app.id,
          gitUrl,
          app.branch || "main",
          app.framework || undefined,
          app.size || "small",
          "manual",
          envVars,
          app.port ?? undefined
        );

        const execution = await jenkins.triggerBuild({
          appName: app.name,
          gitAuthUrl: gitUrl,
        });

        return {
          buildNumber: execution.buildNumber,
          executor: {
            type: "jenkins" as const,
            job_name: execution.jobName,
            run_number: execution.buildNumber,
            url: execution.url,
          },
        };
      },
    });

    const resolvedOperation = resolveBuildBackedOperationState({
      result: operation,
      actionLabel: "Redeploy",
    });

    if (resolvedOperation.kind === "pending") {
      return v1Ok(
        {
          data: {
            app_id: appId,
            app_name: app.name,
            status: "pending",
            operation_id: operation.operation.id,
            reused: operation.reused,
            message: resolvedOperation.message,
          },
        },
        202
      );
    }

    if (resolvedOperation.kind === "failed") {
      return v1Error(resolvedOperation.code ?? "CONFLICT", 409, resolvedOperation.message, {
        operation_id: operation.operation.id,
        retryable: resolvedOperation.retryable,
      });
    }

    if (resolvedOperation.kind === "invalid") {
      return v1Error("INTERNAL_ERROR", 500, resolvedOperation.message, {
        operation_id: operation.operation.id,
      });
    }

    const buildNumber = resolvedOperation.buildNumber;

    try {
      BuildPollingService.startPolling({
        appId: app.id,
        appName: app.name,
        buildNumber,
        userId: auth.userId,
        userEmail: auth.kind === 'session' ? auth.email : undefined,
        trigger: "manual",
      });
    } catch (pollingError) {
      console.warn(`[v1/redeploy] Polling startup failed for build #${buildNumber}:`, pollingError);
    }

    // Audit log (mirrors internal redeploy route pattern)
    void AuditLogService.create({
      user_id: auth.userId,
      user_role: 'user',
      action: 'update',
      service_type: 'platform_apps',
      service_id: appId,
      service_name: app.name,
      ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown',
      request_id: crypto.randomUUID(),
      metadata: {
        operation: 'redeploy',
        build_number: buildNumber,
        trigger: 'manual',
        env_vars_count: envVars.length,
        operation_id: operation.operation.id,
      },
    }).catch((err) => console.warn('[v1/redeploy] Audit log failed:', err));

    return v1Ok({
      data: {
        app_id: appId,
        app_name: app.name,
        status: "triggered",
        build_number: buildNumber,
        operation_id: operation.operation.id,
        reused: operation.reused,
      },
    });
  } catch (err: unknown) {
    if (err instanceof AppOperationError) {
      return v1Error(err.code ?? "OPERATION_ERROR", err.statusCode, err.message);
    }
    console.error(`[v1/redeploy] Error redeploying ${app.name}:`, err);
    return v1Error("INTERNAL_ERROR", 500, "Failed to trigger redeploy");
  }
});
