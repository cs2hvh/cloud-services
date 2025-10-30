import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";
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
      // console.log("[listDatabaseUsers] Users fetched successfully:", response.data.users);

      const users = response.data.users;
      const encryptionKey = process.env.ENCRYPTION_KEY!;

      // Format users for Supabase with encrypted passwords
      const formattedUsers = users.map((user: any) => ({
        id: user.name,
        name: user.name,
        role: user.role || "normal",
        password: user.password ? Encryption.encrypt(user.password, encryptionKey) : undefined,
        created_at: new Date().toISOString(),
      }));

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
