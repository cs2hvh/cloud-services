import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Projects } from "@/lib/supabase/queries/projects";
import { authenticateUser } from "@/lib/auth/server-auth";
import { migrateRegionSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";
import { NotificationService, createServiceNotification } from "@/lib/notifications";
import { AuditLogService } from "@/lib/audit";
import { getAuditContext } from "@/lib/audit/context";

export async function PUT(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();

    // ✅ VALIDATE REQUEST PAYLOAD
    const validation = validateRequest(migrateRegionSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;

    const payload = {
      region: validatedData.region,
    };

    // Migrate database cluster to new region via DigitalOcean API
    const response = await axios.put(
      `https://api.digitalocean.com/v2/databases/${validatedData.database_id}/migrate`,
      payload,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    // console.log(
    //   "Database region migration response:",
    //   response.status,
    //   response.statusText
    // );

    if (response.status === 202) {
      // Update Supabase with new region and status='migrating'
      const supabaseUpdate = await Database_Clusters.update_region(
        validatedData.database_id,
        validatedData.region,
        "migrating"
      );

      if (!supabaseUpdate.success) {
        console.error("[region/route] Failed to update Supabase:", supabaseUpdate.error);
        // Still return success as DigitalOcean migration was initiated
      }

      // Add activity log for region migration
      const clusterData = await Database_Clusters.read(validatedData.database_id);
      if (clusterData.success && clusterData.data.project_id) {
        await Projects.add_log({
          project_id: clusterData.data.project_id,
          event: "Globe",
          text: `Database cluster migrating to region: ${validatedData.region}`
        });
       //console.log(`[migrateRegion] ✅ Activity log added for region migration`);
      }

      // Create audit log
      if (clusterData.success) {
        try {
          const context = getAuditContext(req);
          await AuditLogService.create({
            user_id: clusterData.data.owner_id,
            user_role: 'user',
            action: 'update',
            service_type: 'database',
            service_id: validatedData.database_id,
            service_name: clusterData.data.name,
            before_state: { region: clusterData.data.region },
            after_state: { region: validatedData.region, status: 'migrating' },
            metadata: { update_type: 'region_migration' },
            ...context,
          });
        } catch (auditErr) {
          console.error('[migrateRegion] Failed to create audit log:', auditErr);
        }
      }

      // Create notification for region migration
      if (clusterData.success) {
        try {
          await NotificationService.create(
            createServiceNotification({
              userId: clusterData.data.owner_id,
              type: 'info',
              action: 'migrated',
              serviceType: 'database',
              serviceName: clusterData.data.name,
              serviceId: validatedData.database_id,
              metadata: { updateType: 'region', newRegion: validatedData.region }
            })
          );
        } catch (notifErr) {
          console.error('[migrateRegion] Failed to create notification:', notifErr);
        }
      }

      return NextResponse.json(
        {
          message:
            "Database migration initiated successfully. The cluster status will change to 'migrating' and will transition back to 'online' when complete.",
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: "Failed to migrate database cluster" },
      { status: response.status }
    );
  } catch (err: unknown) {
    console.error("Database region migration error:", err);
    
    if (axios.isAxiosError(err)) {
      return NextResponse.json(
        {
          error:
            err.response?.data?.message ||
            err.message ||
            "Failed to migrate database cluster",
        },
        { status: err.response?.status || 500 }
      );
    }

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
