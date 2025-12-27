import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";
import jenkins from "@/lib/jenkins";

interface BuildInfo {
  build_number: number;
  status: string;
  started_at: string;
  duration?: number;
  result?: string;
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

    try {
      // Get job info which includes build history
      const jobInfo = await jenkins.job.get(jobName);
      
      if (jobInfo && jobInfo.builds && Array.isArray(jobInfo.builds)) {
        // Get details for each build (limit to last 10)
        const buildPromises = jobInfo.builds.slice(0, 10).map(async (build: { number: number }) => {
          try {
            const buildInfo = await jenkins.build.get(jobName, build.number);
            return {
              build_number: buildInfo.number,
              status: buildInfo.building ? 'BUILDING' : (buildInfo.result || 'UNKNOWN'),
              started_at: new Date(buildInfo.timestamp).toISOString(),
              duration: buildInfo.duration,
              result: buildInfo.result,
            };
          } catch {
            return {
              build_number: build.number,
              status: 'UNKNOWN',
              started_at: new Date().toISOString(),
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
