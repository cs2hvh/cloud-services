import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { resizePlatformAppSchema } from "@/lib/validation/platform-apps";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps, Platform_App_Deployments } from "@/lib/supabase/queries";
import { Projects } from "@/lib/supabase/queries/projects";
import { JenkinsService } from "@/lib/services/jenkins";
import { BuildPollingService } from "@/lib/services/build-polling";
import { GitHubProvider } from "@/lib/providers/github";
import { reconcileRuntimeEnv } from "@/lib/services/runtime-env-reconciler";

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
 * Get fresh access token for the specified git provider
 */
async function getAccessToken(
  userId: string, 
  provider: 'github' | 'gitlab' | 'bitbucket'
): Promise<string | null> {
  try {
    if (provider === 'github') {
      const githubProvider = new GitHubProvider();
      const tokenObj = await githubProvider.getToken(userId);
      return tokenObj?.accessToken || null;
    }

    if (provider === 'gitlab') {
      const { getValidGitLabToken } = await import('@/lib/gitlab/token-refresh');
      return await getValidGitLabToken(userId);
    }

    if (provider === 'bitbucket') {
      try {
        const { getValidBitbucketToken } = await import('@/lib/bitbucket/token-refresh');
        return await getValidBitbucketToken(userId);
      } catch {
        console.log(`[Resize] Bitbucket token refresh not available`);
        return null;
      }
    }

    return null;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Resize] Error getting ${provider} token:`, errorMessage);
    return null;
  }
}

/**
 * Build authenticated URL with token for private repo access
 */
function buildAuthenticatedUrl(
  url: string, 
  token: string, 
  provider: 'github' | 'gitlab' | 'bitbucket'
): string {
  switch (provider) {
    case 'github':
      return url.replace(
        /https:\/\/(www\.)?github\.com\//,
        `https://${token}@github.com/`
      );
    case 'gitlab':
      return url.replace(
        /https:\/\/(www\.)?gitlab\.com\//,
        `https://oauth2:${token}@gitlab.com/`
      );
    case 'bitbucket':
      return url.replace(
        /https:\/\/(www\.)?bitbucket\.org\//,
        `https://x-token-auth:${token}@bitbucket.org/`
      );
    default:
      return url;
  }
}

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
    const operationLock = await Platform_App_Deployments.get_operation_lock(app_id, app.status);
    if (!operationLock.success) {
      return NextResponse.json({ error: operationLock.message || "Failed to check deployment state" }, { status: 500 });
    }
    if (operationLock.blocked) {
      return NextResponse.json({ error: operationLock.message }, { status: 409 });
    }

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

    // Update size in database
    const updateResult = await Platform_Apps.update(app_id, { 
      size: new_size,
      status: "building" 
    });
    
    if (!updateResult.success) {
      return NextResponse.json(
        { error: "Failed to update app size" },
        { status: 500 }
      );
    }

    let buildTriggered = false;
    let buildNumber: number | null = null;
    let pollingStarted = false;

    try {
      // Get git provider from app data
      const gitProvider = app.git_provider as 'github' | 'gitlab' | 'bitbucket' | undefined;
      
      // Get fresh access token for private repository access
      let authenticatedUrl = app.repository_url;
      if (gitProvider) {
        console.log(`[Resize] Getting fresh token for ${gitProvider}...`);
        const accessToken = await getAccessToken(auth.user!.id, gitProvider);
        
        if (accessToken) {
          authenticatedUrl = buildAuthenticatedUrl(app.repository_url, accessToken, gitProvider);
          console.log(`[Resize] Token injected for ${gitProvider}`);
        } else {
          console.warn(`[Resize] No token available for ${gitProvider}, using stored URL`);
        }
      }

      // Fetch environment variables for the app
      const envVarsData = await Platform_Apps.get_env_vars(app_id);
      const envVars = envVarsData.map((ev: { key: string; value: string }) => ({ 
        key: ev.key, 
        value: ev.value 
      }));
      
      console.log(`[Resize] Found ${envVars.length} environment variables`);

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

      // Update Jenkins job configuration with new size
      await JenkinsService.updateJobConfig(
        app.name,
        app.id,
        authenticatedUrl,
        app.branch || "main",
        app.framework || undefined,
        new_size,
        "resize",
        envVars
      );

      // Trigger a resize-only build (skips checkout, dockerfile, and build stages)
      buildNumber = await JenkinsService.triggerBuild(app.name, undefined, true);
      buildTriggered = true;

      console.log(`[Resize] Resized ${app.name} from ${currentSize} to ${new_size}, triggered build #${buildNumber}`);

      // Create deployment row immediately so Supabase Realtime pushes it to the UI.
      // The Jenkins webhook will UPDATE this to the final status when the build finishes.
      const buildRecord = await Platform_App_Deployments.start_build({
        app_id: app.id,
        build_number: buildNumber,
        trigger: 'resize',
      });
      if (!buildRecord.success) {
        throw new Error(buildRecord.error || 'Failed to create in-progress deployment record');
      }

      // Start background polling for build status
      BuildPollingService.startPolling({
        appId: app.id,
        appName: app.name,
        buildNumber: buildNumber,
        trigger: 'resize',
        resizeContext: {
          previousSize: currentSize as 'small' | 'medium' | 'large',
          targetSize: new_size as 'small' | 'medium' | 'large',
        },
      });
      pollingStarted = true;

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
        app_id: app_id,
        app_name: app.name,
        old_size: currentSize,
        new_size: new_size,
        new_specs: SIZE_SPECS[new_size],
      });
    } catch (jenkinsError: unknown) {
      const errorMessage = jenkinsError instanceof Error ? jenkinsError.message : "Unknown error";
      // Only revert the local size change if the Jenkins build never started.
      if (!buildTriggered) {
        await Platform_Apps.update(app_id, { 
          size: currentSize,
          status: app.status || "failed" 
        });
      }

      if (buildTriggered && buildNumber) {
        if (!pollingStarted) {
          BuildPollingService.startPolling({
            appId: app.id,
            appName: app.name,
            buildNumber,
            trigger: 'resize',
            resizeContext: {
              previousSize: currentSize as 'small' | 'medium' | 'large',
              targetSize: new_size as 'small' | 'medium' | 'large',
            },
          });
        }

        console.warn(`[Resize] Build #${buildNumber} started but post-trigger tracking failed: ${errorMessage}`);
        return NextResponse.json({
          success: true,
          message: `Resize started from ${currentSize} to ${new_size}. Deployment tracking is being recovered in the background.`,
          warning: errorMessage,
          build_number: buildNumber,
          app_id: app_id,
          app_name: app.name,
          old_size: currentSize,
          new_size: new_size,
          new_specs: SIZE_SPECS[new_size],
        });
      }

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
