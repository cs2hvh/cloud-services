import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { deletePlatformAppSchema } from "@/lib/validation/platform-apps";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { DeploymentService } from "@/lib/services";
import { requireAdmin } from "@/lib/supabase/auth";
import { Platform_Apps } from "@/lib/supabase/queries/platform_apps";
import { Projects } from "@/lib/supabase/queries/projects";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-delete",
      limit: 10,
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
    const validation = validateRequest(deletePlatformAppSchema, body);
    if (!validation.success) return validation.response;

    const { app_id, is_admin } = validation.data;

    // If admin flag is set, verify the user is actually an admin
    let isAdminUser = false;
    if (is_admin) {
      const adminCheck = await requireAdmin();
      if (!adminCheck.ok) {
        return NextResponse.json(
          { error: "Admin privileges required" },
          { status: 403 }
        );
      }
      isAdminUser = true;
    }

    // Get app details before deletion for logging
    const appDetails = await Platform_Apps.get(app_id);
    const appName = appDetails.success ? appDetails.data?.name : 'Unknown';
    const projectId = appDetails.success ? appDetails.data?.project_id : null;
    const repoName = appDetails.success ? appDetails.data?.repository_name : 'Unknown';

    // Delete using deployment service
    try {
      await DeploymentService.delete(app_id, auth.user!.id, isAdminUser);

      // Add project log if project_id exists
      if (projectId) {
        try {
          await Projects.add_log({
            project_id: projectId,
            event: "Platform App Deleted",
            text: `Deleted app "${appName}" (${repoName})`,
          });
        } catch (logError) {
          console.warn('[platform-apps/delete] Failed to add project log:', logError);
        }
      }

      return NextResponse.json({ message: "App deleted successfully" });
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      const statusCode = errorMsg === "App not found" ? 404 :
                        errorMsg === "Unauthorized" ? 403 : 400;
      return NextResponse.json({ error: errorMsg }, { status: statusCode });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
