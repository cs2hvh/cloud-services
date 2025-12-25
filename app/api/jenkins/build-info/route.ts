import { NextRequest, NextResponse } from "next/server";
import { JenkinsService } from "@/lib/services/jenkins";

/**
 * GET /api/jenkins/build-info?app=myapp&build=1
 * Get detailed Jenkins build information
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
      const latestBuild = await JenkinsService.getLatestBuildNumber(appName);
      
      if (!latestBuild) {
        return NextResponse.json(
          { error: "No builds found for this app" },
          { status: 404 }
        );
      }

      const buildInfo = await JenkinsService.getBuildInfo(appName, latestBuild);
      
      return NextResponse.json({
        app_name: appName,
        ...buildInfo,
      });
    }

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
    console.error("[API] Error getting build info:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to get build info";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
