import { NextRequest, NextResponse } from "next/server";
import { JenkinsService } from "@/lib/services/jenkins";
import { PlatformAppLogRetentionService } from "@/lib/services/platform-app-log-retention";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";
import { authenticateUser } from "@/lib/auth/server-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { limitByUser } from "@/lib/cooldown/userbased";

async function getOwnedAppId(userId: string, appName: string): Promise<string | null> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("platform_apps")
    .select("id")
    .eq("name", appName)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

/**
 * GET /api/jenkins/build-logs?app=myapp&build=1&start=0
 * Get Jenkins build logs for an app
 */
export async function GET(req: NextRequest) {
  // Parse URL/search params inside try so malformed URLs don't throw outside
  // the route handler and cause an unhandled exception in Next.
  let searchParams: URLSearchParams;
  try {
    searchParams = new URL(req.url).searchParams;
  } catch {
    return NextResponse.json({ error: "Invalid request URL" }, { status: 400 });
  }

  const appName = searchParams.get("app");
  const buildNumber = searchParams.get("build");
  const start = searchParams.get("start") || "0";

  try {
    const auth = await authenticateUser();
    if (!auth.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:jenkins-build-logs",
      limit: 180,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

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

    const appId = await getOwnedAppId(auth.user!.id, appName);
    if (!appId) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }

    const deploymentOnly = searchParams.get("deployment") === "true";

    if (deploymentOnly) {
      const cached = await PlatformAppLogRetentionService.retrieve(appId, buildNum);
      const logs = cached ?? await JenkinsService.getDeploymentLog(appName, buildNum) ?? '';
      return NextResponse.json({
        app_name: appName,
        build_number: buildNum,
        start: startOffset,
        logs,
        next_start: startOffset + logs.length,
        more: false,
        cached: cached !== null,
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

    logError("[API] Error getting build logs", error);

    // Jenkins connection/timeout errors are transient — return an empty pending
    // response so the client retries silently instead of showing an error toast.
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isTransient = /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout|socket hang up/i.test(errorMsg);
    if (isTransient) {
      const buildNum = parseInt(buildNumber || '0', 10);
      const startOffset = parseInt(start, 10);
      return NextResponse.json({
        app_name: appName,
        build_number: buildNum,
        start: startOffset,
        logs: '',
        next_start: startOffset,
        more: true,
        pending: true,
      });
    }

    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
