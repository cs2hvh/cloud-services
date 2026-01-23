import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { Projects } from "@/lib/supabase/queries/projects";
import { authenticateUser } from "@/lib/auth/server-auth";
import { Encryption } from "@/config/functions";
import { createDatabaseUserSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";
import { DatabaseUser } from "@/lib/supabase/types";
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
    const validation = validateRequest(createDatabaseUserSchema, body);
    if (!validation.success) {
      return validation.response;
    }
    const validatedData = validation.data;

    // Create user in DigitalOcean
    const response = await axios.post(
      `https://api.digitalocean.com/v2/databases/${validatedData.cluster_id}/users`,
      { name: validatedData.name },
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 201) {
      // console.log("[createDatabaseUser] User created successfully:", response.data.user);

      const user = response.data.user;
      
      // Encrypt user password before storing
      const encryptionKey = process.env.ENCRYPTION_KEY!;
      const encryptedPassword = user.password 
        ? Encryption.encrypt(user.password, encryptionKey)
        : undefined;
      
      const userData = {
        id: user.name,
        name: user.name,
        role: user.role || "normal",
        password: encryptedPassword,
        created_at: new Date().toISOString(),
      };

      // Add user to Supabase
      const supabase_result = await Database_Clusters.add_user(
        validatedData.cluster_id,
        userData as DatabaseUser
      );

      if (supabase_result.success) {
        // Add activity log for user creation
        const clusterData = await Database_Clusters.read(validatedData.cluster_id);
        if (clusterData.success && clusterData.data.project_id) {
          await Projects.add_log({
            project_id: clusterData.data.project_id,
            event: "UserPlus",
            text: `Database user '${validatedData.name}' created`
          });
          // console.log(`[createDatabaseUser] ✅ Activity log added for user creation`);
        }

        // Create audit log
        if (clusterData.success) {
          try {
            const context = getAuditContext(req);
            await AuditLogService.create({
              user_id: clusterData.data.owner_id,
              user_role: 'user',
              action: 'create',
              service_type: 'database',
              service_id: validatedData.cluster_id,
              service_name: clusterData.data.name,
              after_state: { user_name: validatedData.name, role: user.role },
              metadata: { operation: 'user_created' },
              ...context,
            });
          } catch (auditErr) {
            console.error('[createDatabaseUser] Failed to create audit log:', auditErr);
          }
        }

        // Create notification for user creation
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
                metadata: { updateType: 'user_created', userName: validatedData.name }
              })
            );
          } catch (notifErr) {
            console.error('[createDatabaseUser] Failed to create notification:', notifErr);
          }
        }
        
        return NextResponse.json(
          {
            data: user,
            message: "Database user created successfully",
          },
          { status: 200 }
        );
      } else {
        return NextResponse.json(
          {
            error: "User created in DigitalOcean but failed to sync with database",
            details: supabase_result.error,
          },
          { status: 500 }
        );
      }
    }
  } catch (err: unknown) {
    if (err as database_error) {
      const message = (err as database_error)?.response?.data?.message;
      console.error("[createDatabaseUser] Error:", message);
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
