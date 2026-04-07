import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps, Platform_App_Deployments } from "@/lib/supabase/queries";
import { Projects } from "@/lib/supabase/queries/projects";
import { JenkinsService } from "@/lib/services/jenkins";
import { AppStatusService } from "@/lib/services/app-status";
import { BuildPollingService } from "@/lib/services/build-polling";
import { AuditLogService } from "@/lib/audit";
import { getAuditContext } from "@/lib/audit/context";
import { reconcileRuntimeEnv } from "@/lib/services/runtime-env-reconciler";

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
    const operationLock = await Platform_App_Deployments.get_operation_lock(app_id, app.status);
    if (!operationLock.success) {
      return NextResponse.json({ error: operationLock.message || 'Failed to check deployment state' }, { status: 500 });
    }
    if (operationLock.blocked) {
      return NextResponse.json({ error: operationLock.message }, { status: 409 });
    }

    // Update status to building using AppStatusService for consistency
    await AppStatusService.setStatus(app_id, "building");

    let buildTriggered = false;
    let buildNumber: number | null = null;
    let pollingStarted = false;

    try {
      // Fetch environment variables from database
      const envVarsData = await Platform_Apps.get_env_vars(app_id);
      const envVars = envVarsData.map((ev: { key: string; value: string }) => ({ 
        key: ev.key, 
        value: ev.value 
      }));
      
      console.log(`[Redeploy] Found ${envVars.length} environment variables for ${app.name}`);

      // Runtime secret sync is mandatory now that Jenkins no longer creates runtime secrets.
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

      // Get repository URL (database uses repository_url, not git_url)
      let gitUrl = (app as { repository_url?: string; git_url?: string }).repository_url || (app as { repository_url?: string; git_url?: string }).git_url;

      if (!gitUrl) {
        throw new Error('Repository URL not found in app configuration');
      }

      // Reconstruct authenticated URL by getting provider token from session/database
      const gitProvider = (app as { git_provider?: string }).git_provider;
      console.log(`[Redeploy] Git provider: ${gitProvider}`);

      if (gitProvider === 'github' || gitProvider === 'gitlab' || gitProvider === 'bitbucket') {
        try {
          const { createClient } = await import('@/lib/supabase/server');
          const supabase = await createClient();
          const { data: { session } } = await supabase.auth.getSession();

          let accessToken: string | null = null;

          if (gitProvider === 'github') {
            // Check session first
            if (session?.provider_token) {
              accessToken = session.provider_token;
            } else if (session?.user?.identities) {
              const githubIdentity = session.user.identities.find(id => id.provider === 'github');
              if (githubIdentity?.identity_data?.provider_token) {
                accessToken = githubIdentity.identity_data.provider_token;
              }
            }

            // Fallback to GitHubProvider
            if (!accessToken) {
              const { GitHubProvider } = await import('@/lib/providers/github');
              const githubProvider = new GitHubProvider();
              const tokenObj = await githubProvider.getToken(auth.user!.id);
              if (tokenObj?.accessToken) {
                accessToken = tokenObj.accessToken;
              }
            }

            if (accessToken) {
              gitUrl = gitUrl.replace('https://github.com/', `https://${accessToken}@github.com/`);
              console.log('[Redeploy] ✅ Injected GitHub token for private repository access');
            }
          } else if (gitProvider === 'gitlab') {
            // Use GitLab token refresh service
            const { getValidGitLabToken } = await import('@/lib/gitlab/token-refresh');
            accessToken = await getValidGitLabToken(auth.user!.id);

            if (accessToken) {
              gitUrl = gitUrl.replace(/https:\/\/(www\.)?gitlab\.com\//, `https://oauth2:${accessToken}@gitlab.com/`);
              console.log('[Redeploy] ✅ Injected GitLab token for private repository access');
            }
          } else if (gitProvider === 'bitbucket') {
            // Use Bitbucket token refresh service
            const { getValidBitbucketToken } = await import('@/lib/bitbucket/token-refresh');
            accessToken = await getValidBitbucketToken(auth.user!.id);

            if (accessToken) {
              gitUrl = gitUrl.replace(/https:\/\/(www\.)?bitbucket\.org\//, `https://x-token-auth:${accessToken}@bitbucket.org/`);
              console.log('[Redeploy] ✅ Injected Bitbucket token for private repository access');
            }
          }

          if (!accessToken) {
            console.warn(`[Redeploy] ⚠️ No ${gitProvider} token found - private repos may fail. Using unauthenticated URL.`);
          }
        } catch (tokenError) {
          console.warn(`[Redeploy] Failed to get ${gitProvider} token:`, tokenError);
          console.warn(`[Redeploy] Proceeding with unauthenticated URL - private repos may fail`);
        }
      }

      // Update the pipeline XML with latest env vars and authenticated URL
      console.log(`[Redeploy] Updating pipeline XML with latest configuration`);
      
      await JenkinsService.updateJobConfig(
        app.name,
        app.id,
        gitUrl, // Now using authenticated URL
        app.branch || "main",
        app.framework || undefined,
        app.size || "small",
        "manual",
        envVars
      );
      console.log(`[Redeploy] Pipeline XML updated successfully`);
      
      // Trigger a new build using JenkinsService
      buildNumber = await JenkinsService.triggerBuild(app.name);
      buildTriggered = true;

      console.log(`[Redeploy] Triggered build #${buildNumber} for app: ${app.name}`);

      // Create deployment row immediately so Supabase Realtime pushes it to the UI.
      // The Jenkins webhook will UPDATE this to the final status when the build finishes.
      const buildRecord = await Platform_App_Deployments.start_build({
        app_id: app.id,
        build_number: buildNumber,
        trigger: 'manual',
      });
      if (!buildRecord.success) {
        throw new Error(buildRecord.error || 'Failed to create in-progress deployment record');
      }

      // Start background polling for build status
      BuildPollingService.startPolling({
        appId: app.id,
        appName: app.name,
        buildNumber: buildNumber,
        trigger: 'manual',
      });
      pollingStarted = true;

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
            env_vars_count: envVars.length
          },
          ...context,
        });
      } catch (auditErr) {
        console.error('[redeploy] Failed to create audit log:', auditErr);
      }

      return NextResponse.json({
        message: "Redeploy triggered successfully",
        build_number: buildNumber,
        app_id: app_id,
        app_name: app.name,
      });
    } catch (jenkinsError: unknown) {
      const errorMessage = jenkinsError instanceof Error ? jenkinsError.message : "Unknown error";
      // If the Jenkins build has not started, revert the app status so the user can retry.
      if (!buildTriggered) {
        await Platform_Apps.update(app_id, {
          status: app.status || 'failed',
          last_failure_reason: null,
        });
      }

      if (buildTriggered && buildNumber) {
        if (!pollingStarted) {
          BuildPollingService.startPolling({
            appId: app.id,
            appName: app.name,
            buildNumber,
            trigger: 'manual',
          });
        }

        console.warn(`[Redeploy] Build #${buildNumber} started but post-trigger tracking failed: ${errorMessage}`);
        return NextResponse.json({
          message: "Redeploy started. Deployment tracking is being recovered in the background.",
          warning: errorMessage,
          build_number: buildNumber,
          app_id: app_id,
          app_name: app.name,
        });
      }

      console.error(`[Redeploy] Jenkins error for ${app.name}:`, errorMessage);
      
      return NextResponse.json(
        { error: `Failed to trigger redeploy: ${errorMessage}` },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Redeploy] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
