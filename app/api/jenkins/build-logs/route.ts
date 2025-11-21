import { NextRequest, NextResponse } from "next/server";
import { JenkinsService } from "@/lib/services/jenkins";

/**
 * GET /api/jenkins/build-logs?app=myapp&build=1&start=0
 * Get Jenkins build logs for an app
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const appName = searchParams.get("app");
    const buildNumber = searchParams.get("build");
    const start = searchParams.get("start") || "0";

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
    const startOffset = parseInt(start, 10);

    if (isNaN(buildNum) || isNaN(startOffset)) {
      return NextResponse.json(
        { error: "Invalid build number or start offset" },
        { status: 400 }
      );
    }

    const logs = await JenkinsService.getBuildLog(appName, buildNum, startOffset);

    return NextResponse.json({
      app_name: appName,
      build_number: buildNum,
      start: startOffset,
      logs,
      next_start: startOffset + logs.length,
    });
  } catch (error: any) {
    console.error("[API] Error getting build logs:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to get build logs" },
      { status: 500 }
    );
  }
}
