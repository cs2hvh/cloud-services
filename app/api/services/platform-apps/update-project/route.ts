import { NextRequest, NextResponse } from "next/server";
import { Platform_Apps } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { NotificationService, createServiceNotification } from "@/lib/notifications";
import { AuditLogService } from "@/lib/audit";
import { getAuditContext } from "@/lib/audit/context";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const rl = await limitByUser(auth.user!.id, { prefix: "rl:app-settings", limit: 20, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { app_id, project_id } = body;

    if (!app_id) {
      return NextResponse.json(
        { error: "Missing required field: app_id" },
        { status: 400 }
      );
    }

    console.log("📁 Updating app project assignment:", app_id, "to project:", project_id);

    // Get app from database
    const result = await Platform_Apps.get(app_id);

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: "App not found" },
        { status: 404 }
      );
    }

    const app = result.data;

    // Verify ownership
    if (app.user_id !== auth.user!.id) {
      return NextResponse.json(
        { error: "Unauthorized", message: "You don't have access to this app" },
        { status: 403 }
      );
    }

    const previousProjectId = app.project_id;

    // Update project assignment in database
    const dbResult = await Platform_Apps.update(app_id, { 
      project_id: project_id || null 
    });

    if (!dbResult.success) {
      console.error("Failed to update project assignment in database");
      return NextResponse.json(
        {
          error: "Failed to update project assignment",
        },
        { status: 500 }
      );
    }

    console.log("✅ App project assignment updated successfully");

    // Create audit log
    try {
      const context = getAuditContext(req);
      await AuditLogService.create({
        user_id: auth.user!.id,
        user_role: 'user',
        user_email: auth.user!.email,
        action: 'update',
        service_type: 'platform_apps',
        service_id: app_id,
        service_name: app.name,
        before_state: { project_id: previousProjectId },
        after_state: { project_id: project_id || null },
        metadata: { update_type: 'project_assignment' },
        ...context,
      });
    } catch (auditErr) {
      console.error('[updateAppProject] Failed to create audit log:', auditErr);
    }

    // Create success notification
    try {
      await NotificationService.create(
        createServiceNotification({
          userId: auth.user!.id,
          type: 'success',
          action: 'updated',
          serviceType: 'platform_app',
          serviceName: app.name,
          serviceId: app_id,
          metadata: {
            updateType: 'app_project',
            project_id: project_id || null,
          },
        })
      );
    } catch (notifErr) {
      console.error('[updateAppProject] Failed to create notification:', notifErr);
    }

    return NextResponse.json({
      success: true,
      message: "Project assignment updated successfully",
      project_id: project_id || null,
    });
  } catch (error) {
    console.error("Error updating app project:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
