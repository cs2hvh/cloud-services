import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";
import { sanitizeError } from "@/lib/api/error-sanitizer";
import { Projects } from "@/lib/supabase/queries/projects";
import { JenkinsService } from "@/lib/services/jenkins";
import type { CustomProfileSpec } from "@/lib/jenkins/pipelines";
import { BuildPollingService } from "@/lib/services/build-polling";
import { AuditLogService } from "@/lib/audit";
import { getAuditContext } from "@/lib/audit/context";
import { reconcileRuntimeEnv } from "@/lib/services/runtime-env-reconciler";
import { getIdempotencyKey } from "@/lib/idempotency";
import {
  AppOperationError,
  AppReleaseBuildService,
  JenkinsBuildAdapter,
  resolveBuildBackedOperationState,
} from "@/lib/app-operations";
import { getGitProviderToken, buildAuthenticatedGitUrl } from "@/lib/git/provider-token";
import { Billing } from "@/lib/supabase/queries/billing";

const redeploySchema = z.object({
  app_id: z.string().uuid(),
});

/**
 * POST /api/services/platform-apps/redeploy
 * Triggers a new build/deployment for an existing app
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    // Rate limiting - more restrictive for redeploys
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-redeploy",
      limit: 5,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "Too Many Requests",
          message: `Retry after ${rl.retryAfterSec}s`,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const validation = validateRequest(redeploySchema, body);
    if (!validation.success) return validation.response;

    const { app_id } = validation.data;

    // Verify ownership first
    const existing = await Platform_Apps.get(app_id);
    if (!existing.success || !existing.data) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    if (existing.data.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const app = existing.data;
    const pendingCustomRequestId =
      typeof app.pending_custom_profile_request_id === "string"
        ? app.pending_custom_profile_request_id
        : undefined;
    const pendingCustomSpec = pendingCustomRequestId
      ? (app.pending_custom_spec as CustomProfileSpec | null) ?? undefined
      : undefined;
    const pendingCustomRate =
      pendingCustomRequestId && typeof app.pending_custom_hourly_rate === "number"
        ? app.pending_custom_hourly_rate
        : undefined;

    if (pendingCustomRequestId) {
      if (!pendingCustomSpec || pendingCustomRate === undefined) {
        return NextResponse.json(
          { error: "Approved custom profile is incomplete. Please contact support." },
          { status: 409 }
        );
      }
      const requiredBalance = await Billing.get_platform_app_rate_transition_requirement({
        serviceId: app.id,
        userId: auth.user!.id,
        newHourlyRate: pendingCustomRate,
      });
      if (!(await Billing.has_balance(auth.user!.id, requiredBalance))) {
        return NextResponse.json(
          {
            error: "Insufficient balance",
            message: `At least $${requiredBalance.toFixed(2)} is required to settle current usage and activate this custom profile.`,
          },
          { status: 402 }
        );
      }
    }

    const deploymentSize = pendingCustomRequestId ? "custom" : (app.size || "small");
    const deploymentCustomSpec =
      pendingCustomSpec ?? ((app.custom_spec as CustomProfileSpec | null) ?? undefined);

    try {
      // Fetch environment variables from database
      const envVarsData = await Platform_Apps.get_env_vars(app_id);
      const envVars = envVarsData.map((ev: { key: string; value: string }) => ({ 
        key: ev.key, 
        value: ev.value 
      }));
      
      console.log(`[Redeploy] Found ${envVars.length} environment variables for ${app.name}`);

      // Get repository URL (database uses repository_url, not git_url)
      let gitUrl = (app as { repository_url?: string; git_url?: string }).repository_url || (app as { repository_url?: string; git_url?: string }).git_url;

      if (!gitUrl) {
        throw new Error('Repository URL not found in app configuration');
      }

      // Reconstruct authenticated URL by getting provider token from session/database
      const gitProvider = (app as { git_provider?: string }).git_provider;
      console.log(`[Redeploy] Git provider: ${gitProvider}`);

      if (gitProvider === 'github' || gitProvider === 'gitlab' || gitProvider === 'bitbucket') {
        let accessToken: string | null = null;
        try {
          accessToken = await getGitProviderToken(auth.user!.id, gitProvider);
        } catch (tokenError) {
          console.warn(`[Redeploy] Failed to retrieve ${gitProvider} token:`, tokenError);
        }

        if (!accessToken) {
          console.warn(`[Redeploy] ⚠️ No valid ${gitProvider} token found — blocking redeploy.`);
          return NextResponse.json(
            {
              error: `Your ${gitProvider} account is not connected or the access token has expired. Please reconnect it in Account Settings before redeploying.`,
              code: "GIT_TOKEN_MISSING",
              provider: gitProvider,
            },
            { status: 403 }
          );
        }

        gitUrl = buildAuthenticatedGitUrl(gitUrl, accessToken, gitProvider);
        console.log(`[Redeploy] ✅ Injected ${gitProvider} token for private repository access`);
      }

      const releaseBuildService = new AppReleaseBuildService();
      const jenkins = new JenkinsBuildAdapter();
      const operation = await releaseBuildService.startReleaseBuild({
        appId: app.id,
        appName: app.name,
        appStatus: app.status,
        trigger: "manual",
        operationType: "redeploy",
        target: pendingCustomRequestId
          ? { size: "custom", custom_profile_request_id: pendingCustomRequestId }
          : undefined,
        idempotencyKey: getIdempotencyKey(req.headers),
        onBeforeTrigger: async () => {
          const runtimeSync = await reconcileRuntimeEnv({
            appName: app.name,
            framework: app.framework ?? null,
            envVars,
            policy: "strict",
            action: "secret_only",
            // Keep existing runtime secret until the deployment pipeline applies the new manifest.
            // This avoids transient failures if current pods still reference the secret.
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
          console.log(`[Redeploy] Updating pipeline XML with latest configuration`);
          await JenkinsService.updateJobConfig(
            app.name,
            app.id,
            gitUrl,
            app.branch || "main",
            app.framework || undefined,
            deploymentSize,
            "manual",
            envVars,
            app.port ?? undefined,
            app.healthcheck_path ?? undefined,
            deploymentCustomSpec,
          );
          console.log(`[Redeploy] Pipeline XML updated successfully`);

          const execution = await jenkins.triggerBuild({
            appName: app.name,
            gitAuthUrl: gitUrl,
          });

          console.log(`[Redeploy] Triggered build #${execution.buildNumber} for app: ${app.name}`);
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
        return NextResponse.json(
          {
            message: resolvedOperation.message,
            code: resolvedOperation.code,
            operation_id: operation.operation.id,
            reused: operation.reused,
            app_id: app_id,
            app_name: app.name,
          },
          { status: 202 }
        );
      }
      if (resolvedOperation.kind === "failed") {
        return NextResponse.json(
          {
            error: resolvedOperation.message,
            code: resolvedOperation.code,
            operation_id: operation.operation.id,
            reused: operation.reused,
            retryable: resolvedOperation.retryable,
          },
          { status: 409 }
        );
      }
      if (resolvedOperation.kind === "invalid") {
        return NextResponse.json(
          {
            error: resolvedOperation.message,
            code: resolvedOperation.code,
            operation_id: operation.operation.id,
            reused: operation.reused,
          },
          { status: 500 }
        );
      }
      const buildNumber = resolvedOperation.buildNumber;

      try {
        BuildPollingService.startPolling({
          appId: app.id,
          appName: app.name,
          buildNumber,
          userId: auth.user!.id,
          userEmail: auth.user!.email,
          trigger: 'manual',
        });
      } catch (pollingError) {
        console.warn(`[Redeploy] Polling startup failed for build #${buildNumber}:`, pollingError);
      }

      // Add project log if project_id exists
      if (app.project_id) {
        try {
          await Projects.add_log({
            project_id: app.project_id,
            event: "Platform App Redeployed",
            text: `Triggered redeploy for "${app.name}" (build #${buildNumber})`,
          });
        } catch (logError) {
          console.warn('[platform-apps/redeploy] Failed to add project log:', logError);
        }
      }

      // Create audit log
      try {
        const context = getAuditContext(req);
        await AuditLogService.create({
          user_id: auth.user!.id,
          user_role: 'user',
          user_email: auth.user!.email,
          action: 'update',
          service_type: 'platform_apps',
          service_id: app_id,
          service_name: app.name,
          metadata: { 
            operation: 'redeploy',
            build_number: buildNumber,
            trigger: 'manual',
            env_vars_count: envVars.length,
            operation_id: operation.operation.id,
          },
          ...context,
        });
      } catch (auditErr) {
        console.error('[redeploy] Failed to create audit log:', auditErr);
      }

      return NextResponse.json({
        message: "Redeploy triggered successfully",
        build_number: buildNumber,
        operation_id: operation.operation.id,
        reused: operation.reused,
        app_id: app_id,
        app_name: app.name,
      });
    } catch (jenkinsError: unknown) {
      if (jenkinsError instanceof AppOperationError) {
        return NextResponse.json(
          { error: jenkinsError.message, code: jenkinsError.code },
          { status: jenkinsError.statusCode }
        );
      }
      console.error(`[Redeploy] Jenkins error for ${app.name}:`, jenkinsError);
      return NextResponse.json(
        { error: "Failed to trigger redeploy" },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    console.error("[Redeploy] Error:", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
