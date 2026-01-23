import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Projects } from "@/lib/supabase/queries/projects";
import { authenticateUser } from "@/lib/auth/server-auth";
import { deleteDatabaseUserSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";
import { NotificationService, createServiceNotification } from "@/lib/notifications";
import { AuditLogService } from "@/lib/audit";
import { getAuditContext } from "@/lib/audit/context";

interface database_error {
  response: {
    data: { message: string };
  };
}

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();
    
    // Validate request body
    const validation = validateRequest(deleteDatabaseUserSchema, body);
    if (!validation.success) {
      return validation.response;
    }
    const validatedData = validation.data;

    // Delete user from DigitalOcean
    const response = await axios.delete(
      `https://api.digitalocean.com/v2/databases/${validatedData.cluster_id}/users/${validatedData.username}`,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 204) {
      console.log("[deleteDatabaseUser] User deleted successfully from DigitalOcean");

      // Remove user from Supabase
      const supabase_result = await Database_Clusters.remove_user(
        validatedData.cluster_id,
        validatedData.username
      );

      if (supabase_result.success) {
        // Add activity log for user deletion
        const clusterData = await Database_Clusters.read(validatedData.cluster_id);
        if (clusterData.success && clusterData.data.project_id) {
          await Projects.add_log({
            project_id: clusterData.data.project_id,
            event: "UserMinus",
            text: `Database user '${validatedData.username}' deleted`
          });
          console.log(`[deleteDatabaseUser] ✅ Activity log added for user deletion`);
        }

        // Create audit log
        if (clusterData.success) {
          try {
            const context = getAuditContext(req);
            await AuditLogService.create({
              user_id: clusterData.data.owner_id,
              user_role: 'user',
              action: 'delete',
              service_type: 'database',
              service_id: validatedData.cluster_id,
              service_name: clusterData.data.name,
              before_state: { user_name: validatedData.username },
              metadata: { operation: 'user_deleted' },
              ...context,
            });
          } catch (auditErr) {
            console.error('[deleteDatabaseUser] Failed to create audit log:', auditErr);
          }
        }

        // Create notification for user deletion
        if (clusterData.success) {
          try {
            await NotificationService.create(
              createServiceNotification({
                userId: clusterData.data.owner_id,
                type: 'info',
                action: 'updated',
                serviceType: 'database',
                serviceName: clusterData.data.name,
                serviceId: validatedData.cluster_id,
                metadata: { updateType: 'user_deleted', userName: validatedData.username }
              })
            );
          } catch (notifErr) {
            console.error('[deleteDatabaseUser] Failed to create notification:', notifErr);
          }
        }
        
        return NextResponse.json(
          {
            message: "Database user deleted successfully",
          },
          { status: 200 }
        );
      } else {
        return NextResponse.json(
          {
            error: "User deleted from DigitalOcean but failed to sync with database",
            details: supabase_result.error,
          },
          { status: 500 }
        );
      }
    }
  } catch (err: unknown) {
    if (err as database_error) {
      const message = (err as database_error)?.response?.data?.message;
      console.error("[deleteDatabaseUser] Error:", message);
      return NextResponse.json(
        { error: message ?? "Invalid request" },
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
