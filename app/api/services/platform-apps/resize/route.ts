import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { resizePlatformAppSchema } from "@/lib/validation/platform-apps";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";
import { Projects } from "@/lib/supabase/queries/projects";
import { JenkinsService } from "@/lib/services/jenkins";
import { BuildPollingService } from "@/lib/services/build-polling";
import { PlatformAppService } from "@/lib/services/platform-app-service";
import { reconcileRuntimeEnv } from "@/lib/services/runtime-env-reconciler";
import { getIdempotencyKey } from "@/lib/idempotency";
import {
  AppOperationError,
  AppRuntimeMutationService,
  JenkinsBuildAdapter,
  resolveBuildBackedOperationState,
} from "@/lib/app-operations";

// Size order for validation (upsize only)
const SIZE_ORDER: Record<string, number> = {
  small: 1,
  medium: 2,
  large: 3,
};

// Size specifications for display/logging
const SIZE_SPECS: Record<string, { cpu: string; memory: string; replicas: number }> = {
  small: { cpu: "0.5 CPU", memory: "512MB", replicas: 1 },
  medium: { cpu: "1 CPU", memory: "1GB", replicas: 2 },
  large: { cpu: "2 CPU", memory: "2GB", replicas: 3 },
};

/**
 * POST /api/services/platform-apps/resize
 * Resize an app instance (upsize only) and trigger redeployment
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    // Rate limiting - restrictive for resize operations
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-resize",
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
    const validation = validateRequest(resizePlatformAppSchema, body);
    if (!validation.success) return validation.response;

    const { app_id, new_size } = validation.data;

    // Verify ownership first
    const existing = await Platform_Apps.get(app_id);
    if (!existing.success || !existing.data) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    if (existing.data.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const app = existing.data;

    const currentSize = app.size || "small";
    // Validate upsize only
    if (SIZE_ORDER[new_size] <= SIZE_ORDER[currentSize]) {
      return NextResponse.json(
        { 
          error: "Invalid resize operation",
          message: `Cannot resize from ${currentSize} to ${new_size}. Only upsizing is allowed.`,
          current_size: currentSize,
          requested_size: new_size,
        },
        { status: 400 }
      );
    }

    // Balance check — verify user can afford the new tier's hourly rate
    const balanceCheck = await PlatformAppService.checkBalanceForResize(auth.user!.id, new_size as "small" | "medium" | "large");
    if (!balanceCheck.ok) {
      return NextResponse.json(
        {
          error: "Insufficient credits",
          message: `Your balance ($${balanceCheck.balance ?? 0}) is below the new tier's hourly rate ($${balanceCheck.required}/hr). Please top up before resizing.`,
          balance: balanceCheck.balance,
          required: balanceCheck.required,
        },
        { status: 402 }
      );
    }

    try {
      // Fetch environment variables for the app
      const envVarsData = await Platform_Apps.get_env_vars(app_id);
      const envVars = envVarsData.map((ev: { key: string; value: string }) => ({ 
        key: ev.key, 
        value: ev.value 
      }));
      
      console.log(`[Resize] Found ${envVars.length} environment variables`);

      const runtimeMutationService = new AppRuntimeMutationService();
      const jenkins = new JenkinsBuildAdapter();
      const operation = await runtimeMutationService.resize({
        appId: app.id,
        appName: app.name,
        appStatus: app.status,
        appFailureReason:
          typeof app.last_failure_reason === "string" ? app.last_failure_reason : null,
        currentSize: currentSize as 'small' | 'medium' | 'large',
        targetSize: new_size as 'small' | 'medium' | 'large',
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
        executor: async (operationId: string) => {
          // Create/update the dedicated resize job with the new size
          await JenkinsService.ensureResizeJob(
            app.name,
            app.id,
            new_size,
            envVars,
            app.port ?? undefined,
            app.framework ?? undefined,
            operationId,
          );

          // Trigger the resize job (separate from the main app build job)
          const execution = await jenkins.triggerResizeBuild({
            appName: app.name,
          });

          console.log(
            `[Resize] Resized ${app.name} from ${currentSize} to ${new_size}, triggered resize build #${execution.buildNumber}`
          );

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
        actionLabel: "Resize",
      });

      if (resolvedOperation.kind === "pending") {
        return NextResponse.json(
          {
            success: true,
            message: resolvedOperation.message,
            code: resolvedOperation.code,
            operation_id: operation.operation.id,
            reused: operation.reused,
            app_id: app_id,
            app_name: app.name,
            old_size: currentSize,
            new_size: new_size,
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
            old_size: currentSize,
            new_size: new_size,
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
          operationId: operation.operation.id,
          trigger: 'resize',
          resizeContext: {
            previousSize: currentSize as 'small' | 'medium' | 'large',
            targetSize: new_size as 'small' | 'medium' | 'large',
          },
        });
      } catch (pollingError) {
        console.warn(`[Resize] Polling startup failed for build #${buildNumber}:`, pollingError);
      }

      // Add project log if project_id exists
      if (app.project_id) {
        try {
          const oldSpecs = SIZE_SPECS[currentSize];
          const newSpecs = SIZE_SPECS[new_size];
          await Projects.add_log({
              project_id: app.project_id,
              event: "Platform App Resize Requested",
              text: `Requested resize for "${app.name}" from ${currentSize} (${oldSpecs.cpu}, ${oldSpecs.memory}) to ${new_size} (${newSpecs.cpu}, ${newSpecs.memory})`,
            });
        } catch (logError) {
          console.warn("[platform-apps/resize] Failed to add project log:", logError);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Resize started from ${currentSize} to ${new_size}`,
        build_number: buildNumber,
        operation_id: operation.operation.id,
        reused: operation.reused,
        app_id: app_id,
        app_name: app.name,
        old_size: currentSize,
        new_size: new_size,
        new_specs: SIZE_SPECS[new_size],
      });
    } catch (jenkinsError: unknown) {
      if (jenkinsError instanceof AppOperationError) {
        return NextResponse.json(
          { error: jenkinsError.message, code: jenkinsError.code },
          { status: jenkinsError.statusCode }
        );
      }
      const errorMessage = jenkinsError instanceof Error ? jenkinsError.message : "Unknown error";
      console.error(`[Resize] Jenkins error for ${app.name}:`, errorMessage);

      return NextResponse.json(
        { error: `Failed to resize app: ${errorMessage}` },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Resize] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
