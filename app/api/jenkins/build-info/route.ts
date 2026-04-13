import { NextRequest, NextResponse } from "next/server";
import { JenkinsService } from "@/lib/services/jenkins";
import { authenticateUser } from "@/lib/auth/server-auth";
import { logError } from "@/lib/api/error-sanitizer";

/**
 * GET /api/jenkins/build-info?app=myapp&build=1
 * Get detailed Jenkins build information
 * 
 * Returns 404 gracefully when no builds exist (common during initial deployment)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const appName = searchParams.get("app");
    const buildNumber = searchParams.get("build");

    if (!appName) {
      return NextResponse.json(
        { error: "Missing 'app' parameter" },
        { status: 400 }
      );
    }

    if (!buildNumber) {
      // Get latest build number if not specified
      let latestBuild: number | null = null;
      try {
        latestBuild = await JenkinsService.getLatestBuildNumber(appName);
      } catch {
        // Job might not exist yet or has no builds
        console.log(`[API] No builds available yet for ${appName}`);
        return NextResponse.json(
          { 
            error: "No builds found for this app",
            message: "The build may still be initializing. Please wait a moment.",
            pending: true
          },
          { status: 404 }
        );
      }
      
      if (!latestBuild) {
        return NextResponse.json(
          { 
            error: "No builds found for this app",
            message: "The build may still be initializing. Please wait a moment.",
            pending: true
          },
          { status: 404 }
        );
      }

      const buildInfo = await JenkinsService.getBuildInfo(appName, latestBuild);
      
      return NextResponse.json({
        app_name: appName,
        ...buildInfo,
      });
    }


    const auth = await authenticateUser();
if (!auth.authenticated) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// Verify the requesting user owns an app with this name

    const buildNum = parseInt(buildNumber, 10);
    if (isNaN(buildNum)) {
      return NextResponse.json(
        { error: "Invalid build number" },
        { status: 400 }
      );
    }

    const buildInfo = await JenkinsService.getBuildInfo(appName, buildNum);

    return NextResponse.json({
      app_name: appName,
      ...buildInfo,
    });
  } catch (error: unknown) {
    logError("[API] Error getting build info", error);
    
    // If it's a "not found" type error, return 404 with helpful message
    const errorMessage = error instanceof Error ? error.message : "";
    if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { 
          error: "Build not found",
          message: "Build not found. It may still be initializing.",
          pending: true
        },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to get build info" },
      { status: 500 }
    );
  }
}
