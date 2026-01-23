import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Projects } from "@/lib/supabase/queries/projects";
import { Billing } from "@/lib/supabase/queries/billing";
import { authenticateUser } from "@/lib/auth/server-auth";
import { DatabaseIntegrationService } from "@/lib/services/database-integration";
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
    const body = await req.json();
    const { force } = body; // Optional: force delete even with active integrations

    // Get cluster details before deletion for logging
    const clusterData = await Database_Clusters.read(body.id);
    const clusterName = clusterData.success ? clusterData.data.name : 'Unknown';
    const projectId = clusterData.success ? clusterData.data.project_id : null;

    // ========================================
    // Check for active integrations
    // ========================================
    const integrationCheck = await DatabaseIntegrationService.canDeleteDatabase(body.id);
    
    if (!integrationCheck.canDelete && !force) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot delete database with active integrations",
          code: "DATABASE_HAS_ACTIVE_LINKS",
          linked_apps_count: integrationCheck.linkedApps,
          linked_app_names: integrationCheck.linkedAppNames,
          hint: "Unlink all apps first, or use force=true to auto-unlink",
        },
        { status: 409 }
      );
    }

    // Force delete: auto-unlink all apps first
    if (force && integrationCheck.linkedApps > 0) {
      console.log(`[deleteDatabase] Force delete: unlinking ${integrationCheck.linkedApps} apps`);
      const unlinkResult = await DatabaseIntegrationService.unlinkAllFromDatabase(
        body.id, 
        auth.user.id
      );
      console.log(`[deleteDatabase] Unlinked ${unlinkResult.unlinked_count} apps`);
    }

    // Close billing (prorated deduction + remove active row)
    try {
      console.log(`[deleteDatabase] Closing billing`, {
        userId: auth.user.id,
        serviceId: body.id2,
      });
      const billingResult = await Billing.close_active_service("database", {
        userId: auth.user.id,
        serviceId: clusterData.data.id,
        failOnInsufficient: false,
      });
      console.log(`[deleteDatabase] Billing closed`, billingResult);
    } catch (billErr) {
      const msg =
        billErr instanceof Error
          ? billErr.message
          : typeof billErr === "string"
            ? billErr
            : JSON.stringify(billErr);

      console.warn(`[deleteDatabase] Billing close failed: ${msg}`);
      // proceed with deletion even if billing fails, per failOnInsufficient=false
    }


    await axios.delete(
      `https://api.digitalocean.com/v2/databases/${body.id}`,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

   // console.log(database.status,"............database delete response...........");

    const sendData = {
      cluster_id: body.id,
    };

    // Create audit log before deletion
    const auditContext = getAuditContext(req);
    const adminCheck = await requireAdmin();
    const userRole = adminCheck.ok ? 'admin' : 'user';

    if (clusterData) {
      await AuditLogService.create({
        user_id: auth.user.id,
        user_role: userRole,
        user_email: auth.user.email,
        action: 'delete',
        service_type: 'database',
        service_id: body.id,
        service_name: clusterName,
        before_state: clusterData,
        ip_address: auditContext.ipAddress,
        user_agent: auditContext.userAgent,
        request_id: auditContext.requestId,
        metadata: {
          project_id: projectId,
        },
      });
    }

    const supabase_delete = await Database_Clusters.mark_as_deleted(sendData.cluster_id);

   // console.log(supabase_delete,"...........supabase delete response........");
    
    if (supabase_delete.success) {
      // Add activity log for database cluster deletion
      if (projectId) {
        await Projects.add_log({
          project_id: projectId,
          event: "Trash2",
          text: `Database cluster '${clusterName}' deleted`
        });
        console.log(`[deleteDatabase] ✅ Activity log added for cluster deletion`);
      }

      // Create success notification
      if (clusterData.success) {
        try {
          await NotificationService.create(
            createServiceNotification({
              userId: clusterData.data.owner_id,
              type: 'success',
              action: 'deleted',
              serviceType: 'database',
              serviceName: clusterName,
              serviceId: body.id,
            })
          );
        } catch (notifErr) {
          console.error('[deleteDatabase] Failed to create notification:', notifErr);
        }
      }
      
      return NextResponse.json(
        {
          message: "database deleted successfully",
        },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        { error: supabase_delete.error || "Failed to delete from database" },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    // Create error notification
    try {
      await NotificationService.create(
        createServiceNotification({
          userId: auth.user!.id,
          type: 'error',
          action: 'deleted',
          serviceType: 'database',
          serviceName: 'Database Cluster',
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      );
    } catch (notifErr) {
      console.error('Failed to create error notification:', notifErr);
    }

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
