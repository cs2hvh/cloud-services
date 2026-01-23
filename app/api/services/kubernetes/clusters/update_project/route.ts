import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { Projects } from "@/lib/supabase/queries/projects";
import { NotificationService, createServiceNotification } from "@/lib/notifications";
import { AuditLogService, getAuditContext } from "@/lib/audit";
import { requireAdmin } from "@/lib/supabase/auth";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const json = await req.json();
    const { cluster_id, project_id } = json;

    if (!cluster_id || !project_id) {
      return NextResponse.json(
        { error: "cluster_id and project_id are required" },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();

    // Get current cluster data for logging
    const { data: clusterData, error: readError } = await supabase
      .from("clusters")
      .select("cluster_name, project_id, owner_id")
      .eq("cluster_id", cluster_id)
      .single();

    if (readError) {
      return NextResponse.json({ error: readError.message }, { status: 400 });
    }

    const oldProjectId = clusterData?.project_id;
    const clusterName = clusterData?.cluster_name || "Unknown";
    const ownerId = clusterData?.owner_id;

    // Update the cluster's project_id
    const { error: updateError } = await supabase
      .from("clusters")
      .update({ project_id: project_id })
      .eq("cluster_id", cluster_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    // Create audit log
    const auditContext = getAuditContext(req);
    const adminCheck = await requireAdmin();
    
    await AuditLogService.create({
      user_id: auth.user.id,
      user_role: adminCheck.ok ? 'admin' : 'user',
      user_email: auth.user.email,
      action: 'update',
      service_type: 'kubernetes',
      service_id: cluster_id,
      service_name: clusterName,
      before_state: { project_id: oldProjectId },
      after_state: { project_id: project_id },
      ip_address: auditContext.ipAddress,
      user_agent: auditContext.userAgent,
      request_id: auditContext.requestId,
      metadata: {
        update_type: 'project',
        old_project_id: oldProjectId,
        new_project_id: project_id,
      },
    });

    // Add activity log to old project if it exists
    if (oldProjectId) {
      await Projects.add_log({
        project_id: oldProjectId,
        event: "ArrowRight",
        text: `Kubernetes cluster '${clusterName}' moved to another project`,
      });
    }

    // Add activity log to new project
    await Projects.add_log({
      project_id: project_id,
      event: "Plus",
      text: `Kubernetes cluster '${clusterName}' assigned to this project`,
    });

    console.log(`[updateClusterProject] ✅ Cluster project updated successfully`);

    // Create notification for project update
    if (ownerId) {
      try {
        // Get project name for better notification message
        const projectData = await Projects.get_by_id(project_id);
        
        await NotificationService.create(
          createServiceNotification({
            userId: ownerId,
            type: 'info',
            action: 'updated',
            serviceType: 'kubernetes',
            serviceName: clusterName,
            serviceId: cluster_id,
            metadata: { updateType: 'project', projectName: projectData?.name }
          })
        );
      } catch (notifErr) {
        console.error('[updateClusterProject] Failed to create notification:', notifErr);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "Cluster project updated successfully",
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof Error) {
      return NextResponse.json(
        { error: err.message ?? "Invalid request" },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        { error: "Unknown error occurred" },
        { status: 400 }
      );
    }
  }
}
