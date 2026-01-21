import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Projects } from "@/lib/supabase/queries/projects";
import { authenticateUser } from "@/lib/auth/server-auth";
import { updateStorageSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";
import { NotificationService, createServiceNotification } from "@/lib/notifications";

export async function PUT(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();

    // ✅ VALIDATE REQUEST PAYLOAD
    const validation = validateRequest(updateStorageSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;

    const payload = {
      size: 'db-s-2vcpu-4gb',
      num_nodes: 1,
      storage_size_mib:75680
    };

    // Resize database cluster via DigitalOcean API
    const response = await axios.put(
      `https://api.digitalocean.com/v2/databases/${validatedData.database_id}/resize`,
      payload,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(
      "Database storage upgrade response:",
      response.status,
      response.statusText
    );

    if (response.status === 202 || response.status === 204) {
      // Update Supabase with new storage size
      const supabaseUpdate = await Database_Clusters.update_storage(
        validatedData.database_id,
        validatedData.size
      );

      if (!supabaseUpdate.success) {
        console.error(
          "[storage/route] Failed to update Supabase:",
          supabaseUpdate.error
        );
        // Still return success as DigitalOcean update was successful
      }

      // Add activity log for storage upgrade
      const clusterData = await Database_Clusters.read(validatedData.database_id);
      if (clusterData.success && clusterData.data.project_id) {
        await Projects.add_log({
          project_id: clusterData.data.project_id,
          event: "Settings",
          text: `Database storage tier upgraded to: ${validatedData.size}`
        });
        console.log(`[updateStorage] ✅ Activity log added for storage upgrade`);
      }

      // Create notification for storage upgrade
      if (clusterData.success) {
        try {
          await NotificationService.create(
            createServiceNotification({
              userId: clusterData.data.owner_id,
              type: 'info',
              action: 'updated',
              serviceType: 'database',
              serviceName: clusterData.data.name,
              serviceId: validatedData.database_id,
              metadata: { updateType: 'storage', newSize: validatedData.size }
            })
          );
        } catch (notifErr) {
          console.error('[updateStorage] Failed to create notification:', notifErr);
        }
      }

      return NextResponse.json(
        {
          message: "resize cluster initiated.It will  reflect changes in some time",
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: "Failed to upgrade database storage tier" },
      { status: response.status }
    );
  } catch (err: unknown) {
    console.error("Database storage upgrade error:", err);
    
    if (axios.isAxiosError(err)) {
      return NextResponse.json(
        {
          error:
            err.response?.data?.message ||
            err.message ||
            "Failed to upgrade database storage tier",
        },
        { status: err.response?.status || 500 }
      );
    }

    if (err instanceof Error) {
      return NextResponse.json(
        { error: err.message || "Failed to upgrade database storage tier" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
