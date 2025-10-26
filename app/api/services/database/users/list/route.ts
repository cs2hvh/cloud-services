import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";

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
    const { cluster_id } = body;

    if (!cluster_id) {
      return NextResponse.json(
        { error: "cluster_id is required" },
        { status: 400 }
      );
    }

    // Get users from DigitalOcean
    const response = await axios.get(
      `https://api.digitalocean.com/v2/databases/${cluster_id}/users`,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 200) {
      console.log("[listDatabaseUsers] Users fetched successfully:", response.data.users);

      const users = response.data.users;

      // Format users for Supabase
      const formattedUsers = users.map((user: any) => ({
        id: user.name,
        name: user.name,
        role: user.role || "normal",
        password: user.password,
        created_at: new Date().toISOString(),
      }));

      // Sync users with Supabase
      const supabase_result = await Database_Clusters.update_users(
        cluster_id,
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
