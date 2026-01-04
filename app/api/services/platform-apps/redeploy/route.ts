import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";
import { Projects } from "@/lib/supabase/queries/projects";
import { JenkinsService } from "@/lib/services/jenkins";

const redeploySchema = z.object({
  app_id: z.string().uuid(),
});

/**
 * POST /api/services/platform-apps/redeploy
 * Triggers a new build/deployment for an existing app
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    // Rate limiting - more restrictive for redeploys
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-redeploy",
      limit: 5,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "Too Many Requests",
          message: `Retry after ${rl.retryAfterSec}s`,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const validation = validateRequest(redeploySchema, body);
    if (!validation.success) return validation.response;

    const { app_id } = validation.data;

    // Verify ownership first
    const existing = await Platform_Apps.get(app_id);
    if (!existing.success || !existing.data) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    if (existing.data.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const app = existing.data;

    // Check if app is in a state that can be redeployed
    if (app.status === 'building') {
      return NextResponse.json(
        { error: "App is already building. Please wait for the current build to complete." },
        { status: 409 }
      );
    }

    if (app.status === 'deleting') {
      return NextResponse.json(
        { error: "App is being deleted and cannot be redeployed." },
        { status: 409 }
      );
    }

    // Update status to building
    await Platform_Apps.update(app_id, { status: 'building' });

    try {
      // Trigger a new build using JenkinsService
      const buildNumber = await JenkinsService.triggerBuild(app.name);

      console.log(`[Redeploy] Triggered build #${buildNumber} for app: ${app.name}`);

      // Add project log if project_id exists
      if (app.project_id) {
        try {
          await Projects.add_log({
            project_id: app.project_id,
            event: "Platform App Redeployed",
            text: `Triggered redeploy for "${app.name}" (build #${buildNumber})`,
          });
        } catch (logError) {
          console.warn('[platform-apps/redeploy] Failed to add project log:', logError);
        }
      }

      return NextResponse.json({
        message: "Redeploy triggered successfully",
        build_number: buildNumber,
        app_id: app_id,
        app_name: app.name,
      });
    } catch (jenkinsError: unknown) {
      // Revert status if Jenkins fails
      await Platform_Apps.update(app_id, { status: app.status || 'failed' });
      
      const errorMessage = jenkinsError instanceof Error ? jenkinsError.message : "Unknown error";
      console.error(`[Redeploy] Jenkins error for ${app.name}:`, errorMessage);
      
      return NextResponse.json(
        { error: `Failed to trigger redeploy: ${errorMessage}` },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Redeploy] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
