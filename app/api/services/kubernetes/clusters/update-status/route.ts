import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { NotificationService, createServiceNotification } from "@/lib/notifications";
import { Projects } from "@/lib/supabase/queries/projects";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();
    const { cluster_id, status, create_droplet } = body as {
      cluster_id?: string;
      status?: string;
      create_droplet?: boolean;
    };

    if (!cluster_id) {
      return NextResponse.json(
        { error: "cluster_id is required" },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();

    // Get current cluster data
    const { data: cluster, error: fetchError } = await supabase
      .from("clusters")
      .select("cluster_id, status, owner_id, create_droplet, project_id, cluster_name")
      .eq("cluster_id", cluster_id)
      .single();

    if (fetchError || !cluster) {
      return NextResponse.json(
        { error: "Cluster not found" },
        { status: 404 }
      );
    }

    // Update cluster status fields if provided
    if (status || typeof create_droplet === "boolean") {
      const updatePayload: Record<string, unknown> = {};
      if (status) updatePayload.status = status;
      if (typeof create_droplet === "boolean") {
        updatePayload.create_droplet = create_droplet;
      }

      const { error: updateError } = await supabase
        .from("clusters")
        .update(updatePayload)
        .eq("cluster_id", cluster_id);

      if (updateError) {
        console.error("[updateClusterStatus] Update failed:", updateError.message);
        return NextResponse.json(
          { error: "Failed to update cluster status" },
          { status: 500 }
        );
      }

      // If status changed to "ready", create notification
      if (status === "ready" && cluster.status !== "ready") {
        // Add activity log
        if (cluster.project_id) {
          await Projects.add_log({
            project_id: cluster.project_id,
            event: "CheckCircle",
            text: `Kubernetes cluster '${cluster.cluster_name}' is ready`
          });
          console.log(`[updateClusterStatus] ✅ Activity log added for cluster ready`);
        }

        // Create notification
        try {
          await NotificationService.create(
            createServiceNotification({
              userId: cluster.owner_id,
              type: 'success',
              action: 'deployed',
              serviceType: 'kubernetes',
              serviceName: cluster.cluster_name,
              serviceId: cluster_id,
            })
          );
          console.log(`[updateClusterStatus] ✅ Notification sent for cluster ready`);
        } catch (notifErr) {
          console.error('[updateClusterStatus] Failed to create notification:', notifErr);
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "Cluster status updated successfully",
        status: status || cluster.status
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("[updateClusterStatus] Error:", err);
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
