import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { Projects,  } from "@/lib/supabase/queries/projects";
import { Billing } from "@/lib/supabase/queries/billing";
import axios from "axios";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceNotification, NotificationService } from "@/lib/notifications";
import { AuditLogService, getAuditContext } from "@/lib/audit";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  const adminCheck=await requireAdmin();

  try {
    const json = await req.json();

    const supabase = await createServiceClient();
    
    // Get cluster details before deletion (including droplet IDs)
    const { data: clusterData, error: readError } = await supabase
      .from("clusters")
      .select("cluster_name, project_id, control_plane, workers,owner_id")
      .eq("cluster_id", json.cluster_id)
      .single();
      
    if (readError)
      return NextResponse.json({ error: readError.message }, { status: 400 });

    if(adminCheck.ok===false && clusterData?.owner_id!==auth.user.id){
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }

    const clusterName = clusterData?.cluster_name || 'Unknown';
    const projectId = clusterData?.project_id || null;

    // Close billing for kubernetes cluster (proration + cleanup)
    try {
      console.log(`[deleteKubernetesCluster] Closing billing`, {
        userId: auth.user.id,
        serviceId: json.cluster_id,
      });
      const billingResult = await Billing.close_active_service("kubernetes", {
        userId: clusterData.owner_id,
        serviceId: json.cluster_id,
        failOnInsufficient: false,
      });
      console.log(`[deleteKubernetesCluster] Billing closed`, billingResult);
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

    
    // Delete droplets from DigitalOcean before deleting from database
    const dropletDeletionErrors: string[] = [];
    
    // Delete control plane droplet
    if (clusterData?.control_plane?.droplet_id) {
      try {
        await axios.delete(
          `https://api.digitalocean.com/v2/droplets/${clusterData.control_plane.droplet_id}`,
          {
            headers: {
              Authorization: process.env.DIGITAL_OCEAN_TOKEN,
              "Content-Type": "application/json",
            },
          }
        );
        console.log(`[deleteKubernetesCluster] ✅ Deleted control plane droplet: ${clusterData.control_plane.droplet_id}`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
       // console.error(`[deleteKubernetesCluster] ❌ Failed to delete control plane droplet: ${errorMsg}`);
        dropletDeletionErrors.push(`Control plane: ${errorMsg}`);
      }
    }
    
    // Delete worker droplets
    if (clusterData?.workers && Array.isArray(clusterData.workers)) {
      for (const worker of clusterData.workers) {
        if (worker?.droplet_id) {
          try {
            await axios.delete(
              `https://api.digitalocean.com/v2/droplets/${worker.droplet_id}`,
              {
                headers: {
                  Authorization: process.env.DIGITAL_OCEAN_TOKEN,
                  "Content-Type": "application/json",
                },
              }
            );
            console.log(`[deleteKubernetesCluster] ✅ Deleted worker droplet: ${worker.droplet_id}`);
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
           console.error(`[deleteKubernetesCluster] ❌ Failed to delete worker droplet: ${errorMsg}`);
          // return NextResponse.json({ message: "Failed to delete worker droplet" }, { status: 503 });
            dropletDeletionErrors.push(`Worker ${worker.droplet_id}: ${errorMsg}`);
          }
        }
      }
    }
    
    // Mark cluster as deleted in database (soft delete)
    const { data: deleteData, error } = await supabase
      .from("clusters")
      .update({ status: 'deleted' })
      .eq("cluster_id", json.cluster_id)
      .select();

    console.log(`[deleteKubernetesCluster] Supabase update result`, {
      error: error?.message,
      rowsUpdated: Array.isArray(deleteData) ? deleteData.length : 0,
    });

    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });

    // Create audit log before deletion
    const auditContext = getAuditContext(req);
    await AuditLogService.create({
      user_id: auth.user!.id,
      user_role: adminCheck.ok ? 'admin' : 'user',
      user_email: auth.user?.email,
      action: 'delete',
      service_type: 'kubernetes',
      service_id: json.cluster_id,
      service_name: clusterName,
      before_state: clusterData,
      ip_address: auditContext.ipAddress,
      user_agent: auditContext.userAgent,
      request_id: auditContext.requestId,
      metadata: {
        project_id: projectId,
        droplet_warnings: dropletDeletionErrors.length > 0 ? dropletDeletionErrors : undefined,
      },
    });

    // Add activity log for Kubernetes cluster deletion
    if (projectId) {
      const logText = dropletDeletionErrors.length > 0 
        ? `Kubernetes cluster '${clusterName}' deleted (with droplet deletion warnings: ${dropletDeletionErrors.join(', ')})`
        : `Kubernetes cluster '${clusterName}' deleted`;
      
      await Projects.add_log({
        project_id: projectId,
        event: "Trash2",
        text: logText
      });
      console.log(`[deleteKubernetesCluster] ✅ Activity log added for cluster deletion`);
    }

    // Create notification
    await NotificationService.create(
      createServiceNotification({
        userId: auth.user!.id,
        type: 'success',
        action: 'deleted',
        serviceType: 'kubernetes',
        serviceName: clusterName,
        serviceId: json.cluster_id,
      })
    );

    return NextResponse.json(
      {
        message: "cluster deleted successfully",
        droplet_warnings: dropletDeletionErrors.length > 0 ? dropletDeletionErrors : undefined
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    // Create error notification
    try {
      await NotificationService.create(
        createServiceNotification({
          userId: auth.user!.id,
          type: 'error',
          action: 'deleted',
          serviceType: 'kubernetes',
          serviceName: 'Kubernetes Cluster',
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
