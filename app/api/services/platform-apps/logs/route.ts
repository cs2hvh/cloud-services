import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";
import { JenkinsService } from "@/lib/services/jenkins";
import jenkins from "@/lib/jenkins";

/**
 * GET /api/services/platform-apps/logs?app_id=xxx&build=1&start=0
 * Get build logs for an app
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    // Rate limiting
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-logs",
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    // Get params from query
    const { searchParams } = new URL(req.url);
    const appId = searchParams.get("app_id");
    const buildNumber = searchParams.get("build");
    const start = parseInt(searchParams.get("start") || "0");

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

    const jobName = `${app.name}-job`;
    let logs = "";
    let hasMore = false;
    let nextStart = 0;
    let build = buildNumber ? parseInt(buildNumber) : null;

    try {
      // If no build number specified, get the latest build
      if (!build) {
        const jobInfo = await jenkins.job.get(jobName);
        if (jobInfo && jobInfo.lastBuild) {
          build = jobInfo.lastBuild.number;
        }
      }

      if (build) {
        // Use JenkinsService which properly handles log retrieval
        logs = await JenkinsService.getBuildLog(app.name, build, start);
        nextStart = start + logs.length;
        hasMore = logs.length > 0; // If we got content, there might be more
      }
    } catch (jenkinsError) {
      console.error(`[API] Error fetching Jenkins logs for ${jobName}:`, jenkinsError);
      logs = "Unable to fetch build logs. The build may still be initializing.";
    }

    return NextResponse.json({
      app_id: appId,
      app_name: app.name,
      build_number: build,
      logs,
      has_more: hasMore,
      next_start: nextStart,
    });
  } catch (err: unknown) {
    console.error("[API] Error getting logs:", err);
    const errorMessage = err instanceof Error ? err.message : "Failed to get logs";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
