import { NextRequest, NextResponse } from "next/server";
import { JenkinsService } from "@/lib/services/jenkins";

/**
 * GET /api/jenkins/build-logs?app=myapp&build=1&start=0
 * Get Jenkins build logs for an app
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const appName = searchParams.get("app");
  const buildNumber = searchParams.get("build");
  const start = searchParams.get("start") || "0";

  try {
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

    const deploymentOnly = searchParams.get("deployment") === "true";

    if (deploymentOnly) {
      const raw = await JenkinsService.getDeploymentLog(appName, buildNum);
      const logs = raw ?? '';
      return NextResponse.json({
        app_name: appName,
        build_number: buildNum,
        start: startOffset,
        logs,
        next_start: startOffset + logs.length,
        more: false,
      });
    }

    // Progressive log fetch — returns proper byte offset (X-Text-Size) and more flag
    const result = await JenkinsService.getBuildLog(appName, buildNum, startOffset);
    // Jenkins may not have flushed anything yet for a brand-new build
    const logs = result.text ?? '';

    return NextResponse.json({
      app_name: appName,
      build_number: buildNum,
      start: startOffset,
      logs,
      next_start: result.nextStart,
      more: result.more,
    });
  } catch (error: unknown) {
    // Jenkins returns "not found" while the build is still queuing (before logs exist).
    // Return an empty 200 so the client retries silently instead of showing an error toast.
    const isNotFound = (error as { notFound?: boolean })?.notFound === true ||
      (error instanceof Error && error.message.includes('not found'));

    if (isNotFound) {
      const buildNum = parseInt(buildNumber || '0', 10);
      const startOffset = parseInt(start, 10);
      return NextResponse.json({
        app_name: appName,
        build_number: buildNum,
        start: startOffset,
        logs: '',
        next_start: startOffset,
        more: true, // signal that the build hasn't produced output yet
        pending: true,
      });
    }

    console.error("[API] Error getting build logs:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to get build logs";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
