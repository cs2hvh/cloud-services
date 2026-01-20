import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { updateEnvVarsSchema } from "@/lib/validation/platform-apps";
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

    // Save to database
    const result = await Platform_Apps.set_env_vars(app_id, env_vars);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Determine if we need rebuild or can just update K8s Secret + restart pods
    const app = existing.data;
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
