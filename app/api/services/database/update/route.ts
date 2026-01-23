import { NextRequest, NextResponse } from "next/server";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Projects as ProjectQueries } from "@/lib/supabase/queries/projects";
import { authenticateUser } from "@/lib/auth/server-auth";
import { NotificationService, createServiceNotification } from "@/lib/notifications";
import { AuditLogService, getAuditContext } from "@/lib/audit";
import { requireAdmin } from "@/lib/supabase/auth";

export async function PUT(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();

    // Validate required fields
    if (!body.cluster_id || !body.project_id) {
      return NextResponse.json(
        { error: "cluster_id and project_id are required" },
        { status: 400 }
      );
    }

    // Get before state
    const beforeState = await Database_Clusters.read(body.cluster_id);

    // Update project assignment in Supabase
    const result = await Database_Clusters.update_project(
      body.cluster_id,
      body.project_id
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to update project" },
        { status: 500 }
      );
    }

    // Add activity log for project assignment change
    const clusterData = await Database_Clusters.read(body.cluster_id);
    const projectData = await ProjectQueries.get_by_id(body.project_id);
    if (clusterData.success && projectData) {
      await ProjectQueries.add_log({
        project_id: body.project_id,
        event: "FolderKanban",
        text: `Database cluster '${clusterData.data.name}' moved to this project`
      });
      console.log(`[updateProject] ✅ Activity log added for project assignment`);
    }

    // Create audit log
    const auditContext = getAuditContext(req);
    const adminCheck = await requireAdmin();
    const userRole = adminCheck.ok ? 'admin' : 'user';

    if (beforeState.success && clusterData.success) {
      await AuditLogService.create({
        user_id: auth.user.id,
        user_role: userRole,
        user_email: auth.user.email,
        action: 'update',
        service_type: 'database',
        service_id: body.cluster_id,
        service_name: clusterData.data.name,
        before_state: beforeState.data,
        after_state: clusterData.data,
        ip_address: auditContext.ipAddress,
        user_agent: auditContext.userAgent,
        request_id: auditContext.requestId,
        metadata: {
          update_type: 'project',
          old_project_id: beforeState.data.project_id,
          new_project_id: body.project_id,
          project_name: projectData?.name,
        },
      });
    }

    // Create notification for project assignment
    if (clusterData.success) {
      try {
        await NotificationService.create(
          createServiceNotification({
            userId: clusterData.data.owner_id,
            type: 'info',
            action: 'updated',
            serviceType: 'database',
            serviceName: clusterData.data.name,
            serviceId: body.cluster_id,
            metadata: { updateType: 'project', projectName: projectData?.name }
          })
        );
      } catch (notifErr) {
        console.error('[updateProject] Failed to create notification:', notifErr);
      }
    }

    return NextResponse.json(
      {
        message: "Project updated successfully",
        data: result.data,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("Project update error:", err);

    if (err instanceof Error) {
      return NextResponse.json(
        { error: err.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Unknown error occurred" },
      { status: 500 }
    );
  }
}
