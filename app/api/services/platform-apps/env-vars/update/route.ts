import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { updateEnvVarsSchema } from "@/lib/validation/platform-apps";
import { validateEnvVars } from "@/lib/validation/env-vars";
import { authenticateUser } from "@/lib/auth/server-auth";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";
import { analyzeEnvLifecycle } from "@/lib/env/lifecycle";
import { reconcileRuntimeEnv } from "@/lib/services/runtime-env-reconciler";
import { AppOperationError, ResourceMutationLockService } from "@/lib/app-operations";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-env-update",
      limit: 10,
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
    const validation = validateRequest(updateEnvVarsSchema, body);
    if (!validation.success) return validation.response;

    const { app_id, env_vars } = validation.data;

    // Verify ownership first
    const existing = await Platform_Apps.get(app_id);
    if (!existing.success || !existing.data) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    if (existing.data.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const app = existing.data;
    const lockService = new ResourceMutationLockService();

    // Validate environment variables according to framework rules (Vercel approach)
    // Log warnings/errors for awareness, but ALLOW updates (like Vercel)
    if (env_vars && env_vars.length > 0 && app.framework) {
      const envValidation = validateEnvVars(app.framework, env_vars);
      
      // Log errors as warnings - don't block update
      if (envValidation.errors.length > 0) {
        console.warn('[env-vars/update] Environment variable security warnings:', envValidation.errors);
      }
      
      // Log info warnings
      if (envValidation.warnings.length > 0) {
        console.log('[env-vars/update] Environment variable info:', envValidation.warnings);
      }
    }

    try {
      return await lockService.withAppMutationLock({
        appId: app_id,
        appName: app.name,
        appStatus: app.status,
        holder: "env_update",
        metadata: {
          operation_type: "env_update",
          env_var_count: env_vars.length,
        },
        run: async () => {
          const result = await Platform_Apps.set_env_vars(app_id, env_vars);
          
          if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
          }

          // Determine live apply vs rebuild requirement based on Jenkins pipeline behavior.
          const lifecycle = analyzeEnvLifecycle(app.framework, env_vars);
          const ignoredHint = lifecycle.ignoredKeys.length > 0
            ? `Ignored by ${lifecycle.pipeline} pipeline (missing required prefix): ${lifecycle.ignoredKeys.join(", ")}`
            : null;

          if (app.status !== 'running') {
            console.log(`[env-vars/update] ${app.name}: App not running (status: ${app.status}), saved to DB only`);
            return NextResponse.json({
              message: "Environment variables saved to database",
              requiresRedeploy: true,
              reason: `App is not currently running (status: ${app.status})`,
              hint: ignoredHint || "Click 'Redeploy' to build and apply changes",
              applyMode: "persisted_only",
            });
          }

          const syncAction = lifecycle.mode === "build_time_only" || lifecycle.ignoredOnly
            ? "secret_only"
            : "secret_and_restart";
          const runtimeSync = await reconcileRuntimeEnv({
            appName: app.name,
            framework: app.framework ?? null,
            envVars: env_vars,
            policy: "best_effort",
            action: syncAction,
            cleanupWhenEmpty: true,
            reconcileDeploymentEnvFrom: syncAction === "secret_only",
          });

          if (runtimeSync.status === "warning" || runtimeSync.status === "failed") {
            console.error(`[env-vars/update] ${app.name}: ${runtimeSync.reason}`);
            return NextResponse.json({
              message: "Environment variables saved to database, but runtime reconciliation failed",
              requiresRedeploy: true,
              appliedLive: false,
              reason: runtimeSync.reason,
              hint: ignoredHint || "Changes were persisted. Retry update or redeploy after Kubernetes connectivity is restored.",
              applyMode: "persisted_only",
            }, { status: 207 });
          }

          if (runtimeSync.status === "skipped" && syncAction === "secret_and_restart") {
            return NextResponse.json({
              message: "Environment variables saved to database",
              requiresRedeploy: true,
              appliedLive: false,
              reason: runtimeSync.reason,
              hint: ignoredHint || "Redeploy to apply changes.",
              applyMode: "persisted_only",
            });
          }

          if (lifecycle.ignoredOnly) {
            console.log(
              `[env-vars/update] ${app.name}: All ${env_vars.length} key(s) ignored by ${lifecycle.pipeline} pipeline; runtime cleanup reconciled`
            );
            return NextResponse.json({
              message: "Environment variables saved, but ignored by current framework pipeline",
              requiresRedeploy: false,
              appliedLive: false,
              reason: lifecycle.reason,
              hint: ignoredHint || "Use the framework's required public prefix for variables to take effect.",
              applyMode: "persisted_only",
            });
          }

          if (lifecycle.mode === "build_time_only") {
            console.log(`[env-vars/update] ${app.name}: Build-time-only env update; runtime cleanup reconciled`);
            return NextResponse.json({
              message: "Build-time environment variables saved to database",
              requiresRedeploy: true,
              appliedLive: false,
              reason: lifecycle.reason,
              hint: ignoredHint || "Click 'Redeploy' to apply build-time variables",
              applyMode: lifecycle.mode,
            });
          }

          console.log(
            `[env-vars/update] ${app.name}: Applied runtime env vars to K8s (${runtimeSync.runtimeEnvVars.length} vars)` +
            `${lifecycle.requiresRedeploy ? " + redeploy required" : ""}`
          );

          console.log(`[env-vars/update] ✅ ${app.name}: Env vars updated and pods restarted`);
          
          try {
            const { AppStatusService } = await import('@/lib/services/app-status');
            const syncResult = await AppStatusService.syncAfterK8sOperation(app_id, app.name, 5000);
            if (syncResult?.changed) {
              console.log(`[env-vars/update] Status synced: ${syncResult.previousStatus} → ${syncResult.currentStatus}`);
            }
          } catch (syncError) {
            console.error(`[env-vars/update] Status sync failed (non-critical):`, syncError);
          }

          if (lifecycle.requiresRedeploy) {
            console.log(`[env-vars/update] ${app.name}: Requires redeploy - ${lifecycle.reason}`);
            
            return NextResponse.json({
              message: "Runtime environment variables applied immediately",
              requiresRedeploy: true,
              appliedLive: true,
              reason: lifecycle.reason,
              hint: ignoredHint || "Runtime vars are live now. Click 'Redeploy' to apply build-time variables.",
              applyMode: lifecycle.mode,
            });
          }

          return NextResponse.json({
            message: "Environment variables updated and applied successfully",
            requiresRedeploy: false,
            appliedLive: true,
            hint: ignoredHint || "All changes applied instantly via rolling restart (no rebuild needed)",
            applyMode: lifecycle.mode,
          });
        },
      });
    } catch (error) {
      if (error instanceof AppOperationError) {
        return NextResponse.json(
          {
            error:
              error.code === 'APP_DELETING'
                ? "App is being deleted and cannot be updated."
                : "Cannot update environment variables while another app operation is in progress.",
          },
          { status: error.statusCode }
        );
      }
      throw error;
    }
  } catch (err: unknown) {
    logError("services/platform-apps/env-vars/update", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
