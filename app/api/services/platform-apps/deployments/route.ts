import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps, Platform_App_Deployments } from "@/lib/supabase/queries";
import jenkins from "@/lib/jenkins";

// Limit for deployment history - matches UI pagination and reduces API calls
const DEPLOYMENT_HISTORY_LIMIT = 10;

interface BuildInfo {
  build_number: number;
  status: string;
  started_at: string;
  duration?: number;
  result?: string;
  commit_sha?: string;
  commit_message?: string;
  trigger?: string;
  failure_reason?: string | null;
}

/**
 * GET /api/services/platform-apps/deployments?app_id=xxx
 * Get deployment history (build history) for an app
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    // Rate limiting
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-deployments",
      limit: 20,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    // Get app_id from query params
    const { searchParams } = new URL(req.url);
    const appId = searchParams.get("app_id");

    if (!appId) {
      return NextResponse.json(
        { error: "Missing 'app_id' parameter" },
        { status: 400 }
      );
    }

    // Verify ownership
    const result = await Platform_Apps.get(appId);
    if (!result.success || !result.data) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    const app = result.data;
    if (app.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get build history from Jenkins
    const jobName = `${app.name}-job`;
    const deployments: BuildInfo[] = [];

    // First, get deployment records from database (has failure_reason)
    const dbDeployments = await Platform_App_Deployments.list_by_app(appId, DEPLOYMENT_HISTORY_LIMIT);
    const dbDeploymentMap = new Map<number, typeof dbDeployments[0]>();
    for (const dep of dbDeployments) {
      if (dep.build_number) {
        dbDeploymentMap.set(dep.build_number, dep);
      }
    }

    try {
      // Get job info which includes build history
      const jobInfo = await jenkins.job.get(jobName);
      
      if (jobInfo && jobInfo.builds && Array.isArray(jobInfo.builds)) {
        // Get details for each build
        const buildPromises = jobInfo.builds.slice(0, DEPLOYMENT_HISTORY_LIMIT).map(async (build: { number: number }) => {
          try {
            const buildInfo = await jenkins.build.get(jobName, build.number);
            
            // Extract commit info from Jenkins build
            // Jenkins stores Git info in multiple places depending on plugin versions
            let commitSha: string | undefined;
            let commitMessage: string | undefined;
            
            // Method 1: Check actions array for various Git plugin data
            if (buildInfo.actions && Array.isArray(buildInfo.actions)) {
              for (const action of buildInfo.actions) {
                // Look for BuildData which contains lastBuiltRevision
                if (action._class?.includes('BuildData') && action.lastBuiltRevision) {
                  commitSha = action.lastBuiltRevision.SHA1?.substring(0, 7);
                }
                // Look for git.util.BuildData
                if (action.buildsByBranchName) {
                  const branchData = Object.values(action.buildsByBranchName)[0] as { revision?: { SHA1?: string } };
                  if (branchData?.revision?.SHA1) {
                    commitSha = branchData.revision.SHA1.substring(0, 7);
                  }
                }
                // Look for ChangeLogSet for commit message
                if (action._class?.includes('ChangeLogSet') && action.items && action.items.length > 0) {
                  commitMessage = action.items[0].msg || action.items[0].comment;
                }
                // Check parameters for COMMIT_SHA that was passed to the build
                if (action._class?.includes('ParametersAction') && action.parameters) {
                  for (const param of action.parameters) {
                    if (param.name === 'COMMIT_SHA' && param.value) {
                      commitSha = param.value.substring(0, 7);
                    }
                  }
                }
              }
            }
            
            // Method 2: Check changeSet at build level
            if (!commitMessage && buildInfo.changeSet?.items?.length > 0) {
              commitMessage = buildInfo.changeSet.items[0].msg || buildInfo.changeSet.items[0].comment;
              if (!commitSha && buildInfo.changeSet.items[0].commitId) {
                commitSha = buildInfo.changeSet.items[0].commitId.substring(0, 7);
              }
            }
            
            // Method 3: Check changeSets array (newer Jenkins versions)
            if (!commitSha && buildInfo.changeSets && Array.isArray(buildInfo.changeSets)) {
              for (const changeSet of buildInfo.changeSets) {
                if (changeSet.items && changeSet.items.length > 0) {
                  const item = changeSet.items[0];
                  if (!commitSha && item.commitId) {
                    commitSha = item.commitId.substring(0, 7);
                  }
                  if (!commitMessage) {
                    commitMessage = item.msg || item.comment;
                  }
                }
              }
            }
            
            // Get additional info from database (failure_reason, trigger)
            const dbRecord = dbDeploymentMap.get(buildInfo.number);
            
            return {
              build_number: buildInfo.number,
              status: buildInfo.building ? 'BUILDING' : (buildInfo.result || 'UNKNOWN'),
              started_at: new Date(buildInfo.timestamp).toISOString(),
              duration: buildInfo.duration,
              result: buildInfo.result,
              commit_sha: commitSha || dbRecord?.commit_sha?.substring(0, 7),
              commit_message: commitMessage,
              trigger: dbRecord?.trigger,
              failure_reason: dbRecord?.failure_reason,
            };
          } catch {
            // Even on Jenkins error, try to get info from DB
            const dbRecord = dbDeploymentMap.get(build.number);
            return {
              build_number: build.number,
              status: dbRecord?.status === 'success' ? 'SUCCESS' : dbRecord?.status === 'failed' ? 'FAILURE' : 'UNKNOWN',
              started_at: dbRecord?.created_at || new Date().toISOString(),
              trigger: dbRecord?.trigger,
              failure_reason: dbRecord?.failure_reason,
            };
          }
        });

        const builds = await Promise.all(buildPromises);
        deployments.push(...builds);
      }
    } catch (jenkinsError) {
      console.error(`[API] Error fetching Jenkins builds for ${jobName}:`, jenkinsError);
      // Return empty array if Jenkins fails - don't block the response
    }

    return NextResponse.json({
      app_id: appId,
      app_name: app.name,
      deployments,
      total: deployments.length,
    });
  } catch (err: unknown) {
    console.error("[API] Error getting deployments:", err);
    const errorMessage = err instanceof Error ? err.message : "Failed to get deployments";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
