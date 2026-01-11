import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { authenticateUser } from "@/lib/auth/server-auth";
import { Encryption } from "@/config/functions";
import { listUsersSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";

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
    const validation = validateRequest(listUsersSchema, body);
    if (!validation.success) {
      return validation.response;
    }
    const validatedData = validation.data;

    // Get users from DigitalOcean
    const response = await axios.get(
      `https://api.digitalocean.com/v2/databases/${validatedData.cluster_id}/users`,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 200) {
      //console.log("[listDatabaseUsers] Users fetched successfully:", response.data.users);

      const users = response.data.users;
      const encryptionKey = process.env.ENCRYPTION_KEY!;

      // Get existing users from Supabase to preserve passwords (MongoDB doesn't return passwords in list)
      const existingUsersResult = await Database_Clusters.get_users(validatedData.cluster_id);
      const existingUsers = existingUsersResult.success && Array.isArray(existingUsersResult.data) 
        ? existingUsersResult.data 
        : [];
      
      // Create a map of existing passwords by username
      const existingPasswordMap = new Map<string, unknown>();
      existingUsers.forEach((u: { name: string; password?: unknown }) => {
        if (u.password) {
          existingPasswordMap.set(u.name, u.password);
        }
      });

      // Format users for Supabase - preserve existing encrypted passwords if DO doesn't return one
      const formattedUsers = users.map((user: { name: string; role?: string; password?: string }) => {
        const existingPassword = existingPasswordMap.get(user.name);
        return {
          id: user.name,
          name: user.name,
          role: user.role || "normal",
          // Use new password from DO if available, otherwise preserve existing encrypted password
          password: user.password 
            ? Encryption.encrypt(user.password, encryptionKey) 
            : existingPassword,
          created_at: new Date().toISOString(),
        };
      });

      // Sync users with Supabase
      const supabase_result = await Database_Clusters.update_users(
        validatedData.cluster_id,
        formattedUsers
      );

      if (supabase_result.success) {
        return NextResponse.json(
          {
            data: users,
            message: "Database users fetched and synced successfully",
          },
          { status: 200 }
        );
      } else {
        // Even if sync fails, return the users from DigitalOcean
        return NextResponse.json(
          {
            data: users,
            message: "Database users fetched successfully (sync failed)",
            warning: supabase_result.error,
          },
          { status: 200 }
        );
      }
    }
  } catch (err: unknown) {
    if (err as database_error) {
      const message = (err as database_error)?.response?.data?.message;
      console.error("[listDatabaseUsers] Error:", message);
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
