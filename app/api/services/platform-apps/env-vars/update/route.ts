import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { updateEnvVarsSchema } from "@/lib/validation/platform-apps";
import { validateEnvVars } from "@/lib/validation/env-vars";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";
import { KubernetesInfoService } from "@/lib/services/kubernetes-info";

/**
 * Determine if framework requires rebuild for build-time env vars
 * or can use runtime-only updates (K8s Secret + rolling restart)
 * 
 * Build-time vars are BAKED into the bundle during npm run build
 * Runtime vars are injected as K8s Secrets when container starts
 */
function requiresRebuildForEnvVars(
  framework: string | null,
  envVars: Array<{ key: string; value: string }>
): { needsRebuild: boolean; reason?: string } {
  if (!framework) {
    return { needsRebuild: false };
  }

  const fw = framework.toLowerCase();

  // Static SPAs ALWAYS need rebuild (no server to read runtime env vars)
  // Check with .includes() or startsWith() to handle "Vue.js", "React", "vue", etc.
  if (fw.includes('vue') || fw.includes('react') || fw.includes('angular') || fw === 'vite-react') {
    return { 
      needsRebuild: true, 
      reason: 'Static SPA requires rebuild to update environment variables' 
    };
  }

  // SSR Frameworks: Only rebuild if build-time vars present
  const hasBuildTimeVars = envVars.some(ev => {
    const key = ev.key;
    switch (fw) {
      case 'nextjs':
      case 'next':
        return key.startsWith('NEXT_PUBLIC_');
      case 'nuxtjs':
      case 'nuxt':
        return key.startsWith('NUXT_PUBLIC_') || key.startsWith('VITE_');
      case 'sveltekit':
        return key.startsWith('PUBLIC_');
      default:
        return false;
    }
  });

  if (hasBuildTimeVars) {
    return {
      needsRebuild: true,
      reason: 'Build-time environment variables detected (NEXT_PUBLIC_*, NUXT_PUBLIC_*, PUBLIC_*, or VITE_*)'
    };
  }

  // Backend frameworks or SSR with only runtime vars: No rebuild needed
  return { needsRebuild: false };
}

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
    if (!existing.success) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    if (existing.data.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Validate environment variables according to framework rules (Vercel approach)
    // Log warnings/errors for awareness, but ALLOW updates (like Vercel)
    const app = existing.data;
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

    // Save to database
    const result = await Platform_Apps.set_env_vars(app_id, env_vars);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Determine if we need rebuild or can just update K8s Secret + restart pods
    const rebuildCheck = requiresRebuildForEnvVars(app.framework, env_vars);

    if (rebuildCheck.needsRebuild) {
      // Build-time vars require full rebuild via redeploy
      console.log(`[env-vars/update] ${app.name}: Requires rebuild - ${rebuildCheck.reason}`);
      
      return NextResponse.json({
        message: "Environment variables updated in database",
        requiresRedeploy: true,
        reason: rebuildCheck.reason,
        hint: "Click 'Redeploy' to apply changes (rebuild required)"
      });
    } else {
      // Check if app is actually running before attempting K8s update
      if (app.status !== 'running') {
        console.log(`[env-vars/update] ${app.name}: App not running (status: ${app.status}), saved to DB only`);
        return NextResponse.json({
          message: "Environment variables saved to database",
          requiresRedeploy: true,
          reason: `App is not currently running (status: ${app.status})`,
          hint: "Click 'Redeploy' to build and apply changes"
        });
      }

      // Runtime-only vars: Update K8s Secret and restart pods (fast, no rebuild)
      console.log(`[env-vars/update] ${app.name}: Applying runtime env vars without rebuild (${env_vars.length} vars)`);
      
      const k8sResult = await KubernetesInfoService.updateEnvVarsAndRestart(
        app.name,
        env_vars
      );

      if (!k8sResult.success) {
        console.error(`[env-vars/update] K8s update failed:`, k8sResult.error);
        return NextResponse.json({
          message: "Environment variables saved to database, but live update failed",
          requiresRedeploy: true,
          reason: k8sResult.error,
          hint: "Click 'Redeploy' to apply changes"
        }, { status: 207 }); // 207 Multi-Status
      }

      console.log(`[env-vars/update] ✅ ${app.name}: Env vars updated and pods restarted`);
      
      // Sync app status from K8s after restart
      try {
        const { AppStatusService } = await import('@/lib/services/app-status');
        const syncResult = await AppStatusService.syncAfterK8sOperation(app_id, app.name, 5000);
        if (syncResult.changed) {
          console.log(`[env-vars/update] Status synced: ${syncResult.previousStatus} → ${syncResult.currentStatus}`);
        }
      } catch (syncError) {
        console.error(`[env-vars/update] Status sync failed (non-critical):`, syncError);
      }
      
      return NextResponse.json({
        message: "Environment variables updated and applied successfully",
        requiresRedeploy: false,
        appliedLive: true,
        hint: "Changes applied instantly via rolling restart (no rebuild needed)"
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error('[env-vars/update] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
