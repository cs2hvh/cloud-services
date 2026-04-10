import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest } from "@/lib/middleware/validate-request";
import { authenticateUser } from "@/lib/auth/server-auth";
import { Platform_Apps, Platform_App_Deployments } from "@/lib/supabase/queries";
import { BuildPollingService } from "@/lib/services/build-polling";
import { JenkinsService } from "@/lib/services/jenkins";

const schema = z.object({
  app_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const body = await req.json().catch(() => ({}));
  const validation = validateRequest(schema, body);
  if (!validation.success) return validation.response;

  const { app_id } = validation.data;

  const appResult = await Platform_Apps.get(app_id);
  if (!appResult.success || !appResult.data) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }
  if (appResult.data.user_id !== auth.user!.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const app = appResult.data;
  const inProgress = await Platform_App_Deployments.get_in_progress_by_app(app_id);
  if (!inProgress.success) {
    return NextResponse.json(
      { error: inProgress.error || "Failed to check in-progress deployment" },
      { status: 500 }
    );
  }

  if (!inProgress.data || !inProgress.data.build_number) {
    return NextResponse.json({
      recovered: false,
      message: "No in-progress build found",
    });
  }

  try {
    const buildInfo = await JenkinsService.getBuildInfo(app.name, inProgress.data.build_number);

    if (buildInfo.building) {
      return NextResponse.json({
        recovered: false,
        still_building: true,
        status: null,
        message: "Build is still running on Jenkins",
        build_number: inProgress.data.build_number,
      });
    }

    const finishedAt = buildInfo.timestamp + buildInfo.duration;
    if (
      Number.isFinite(finishedAt) &&
      Date.now() - finishedAt < BuildPollingService.BUILD_FINALIZATION_GRACE_MS
    ) {
      return NextResponse.json({
        recovered: false,
        still_building: false,
        status: null,
        message: "Build finished recently; waiting for normal deployment finalization",
        build_number: inProgress.data.build_number,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("not found")) {
      return NextResponse.json(
        { error: "Failed to query Jenkins build state" },
        { status: 500 }
      );
    }
  }

  const recovery = await BuildPollingService.recoverBuild({
    appId: app_id,
    appName: app.name,
    buildNumber: inProgress.data.build_number,
    trigger: inProgress.data.trigger,
    desiredSize: (app.size as "small" | "medium" | "large" | null | undefined) ?? null,
    userId: auth.user!.id, // Pass user ID for audit trail on resize recovery
  });

  if (!recovery.success) {
    return NextResponse.json(
      { error: recovery.error || "Failed to recover build state" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    recovered: recovery.recovered,
    still_building: recovery.stillBuilding ?? false,
    status: recovery.status ?? null,
    message: recovery.message ?? null,
    build_number: inProgress.data.build_number,
  });
}
