//used for test-cases api-mocks-fixture.ts

import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";
import { JenkinsService } from "@/lib/services/jenkins";
import jenkins from "@/lib/jenkins";

/**
 * GET /api/services/platform-apps/logs?app_id=xxx&build=1
 * Get filtered deployment logs for an app (Blue Ocean API or fallback filter)
 * 
 * NOTE: This endpoint always returns complete filtered logs (no pagination)
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

    // Skip log fetching for apps that are pending (no Jenkins job yet)
    if (app.status === 'pending') {
      return NextResponse.json({
        app_id: appId,
        app_name: app.name,
        build_number: null,
        logs: "Deployment is being initialized. Build logs will appear shortly...",
        has_more: false,
        next_start: 0,
        pending: true,
      });
    }

    const jobName = `${app.name}-job`;
    let logs = "";
    let hasMore = false;
    const nextStart = 0;
    let build = buildNumber ? parseInt(buildNumber) : null;

    // Validate build number is a positive integer if provided
    if (buildNumber !== null && buildNumber !== undefined) {
      const parsedBuild = parseInt(buildNumber);
      if (isNaN(parsedBuild) || parsedBuild < 1 || parsedBuild > 10000) {
        return NextResponse.json(
          { error: "Invalid build number. Must be a positive integer between 1 and 10000." },
          { status: 400 }
        );
      }
      build = parsedBuild;
    }

    try {
      // Get job info to validate build number belongs to this app
      const jobInfo = await jenkins.job.get(jobName).catch(() => null);
      
      // If job doesn't exist yet, return appropriate message
      if (!jobInfo) {
        return NextResponse.json({
          app_id: appId,
          app_name: app.name,
          build_number: null,
          logs: "Build is being prepared. Build logs will appear shortly...",
          has_more: false,
          next_start: 0,
          pending: true,
        });
      }

      // If no build number specified, get the latest build
      if (!build) {
        if (jobInfo.lastBuild) {
          build = jobInfo.lastBuild.number;
        }
      } else {
        // Validate that the requested build number exists and is within valid range for this job
        const maxBuildNumber = jobInfo.lastBuild?.number || 0;
        const firstBuildNumber = jobInfo.firstBuild?.number || 1;
        
        if (build > maxBuildNumber) {
          return NextResponse.json(
            { error: `Build #${build} does not exist. Latest build is #${maxBuildNumber}.` },
            { status: 404 }
          );
        }
        
        if (build < firstBuildNumber) {
          return NextResponse.json(
            { error: `Build #${build} is no longer available. Earliest available build is #${firstBuildNumber}.` },
            { status: 404 }
          );
        }
      }

      if (build) {
        // Use JenkinsService to get deployment logs only (via Blue Ocean API or fallback filter)
        logs = await JenkinsService.getDeploymentLog(app.name, build);
        hasMore = false; // Blue Ocean API returns complete stage logs
      } else {
        // No builds yet
        logs = "Build is starting. Logs will appear shortly...";
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
    logError("services/platform-apps/logs", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
