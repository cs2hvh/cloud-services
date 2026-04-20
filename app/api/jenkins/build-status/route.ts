import { NextRequest, NextResponse } from "next/server";
import { BuildPollingService } from "@/lib/services/build-polling";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";

/**
 * GET /api/jenkins/build-status?app=myapp&build=1
 * Get Jenkins build status for an app
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
      return NextResponse.json(
        { error: "Missing 'build' parameter" },
        { status: 400 }
      );
    }

    const buildNum = parseInt(buildNumber, 10);
    if (isNaN(buildNum)) {
      return NextResponse.json(
        { error: "Invalid build number" },
        { status: 400 }
      );
    }

    const buildStatus = await BuildPollingService.getCurrentStatus(appName, buildNum);

    if (!buildStatus) {
      return NextResponse.json(
        { error: "Build not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      app_name: appName,
      build_number: buildNum,
      ...buildStatus,
    });
  } catch (error: unknown) {
    logError("[API] Error getting build status", error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
