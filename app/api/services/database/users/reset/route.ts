import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";

interface database_error {
  response: {
    data: { message: string };
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cluster_id, username } = body;

    if (!cluster_id || !username) {
      return NextResponse.json(
        { error: "cluster_id and username are required" },
        { status: 400 }
      );
    }

    // Reset user password in DigitalOcean
    const response = await axios.post(
      `https://api.digitalocean.com/v2/databases/${cluster_id}/users/${username}/reset_auth`,
      {},
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 200) {
      console.log("[resetDatabaseUserPassword] Password reset successfully:", response.data.user);

      const user = response.data.user;

      // Optional: Update user password in Supabase
      // Get current users and update the specific user's password
      const usersResult = await Database_Clusters.get_users(cluster_id);
      
      if (usersResult.success && Array.isArray(usersResult.data)) {
        const updatedUsers = usersResult.data.map((u: any) => {
          if (u.name === username) {
            return {
              ...u,
              password: user.password,
            };
          }
          return u;
        });

        await Database_Clusters.update_users(cluster_id, updatedUsers);
      }

      return NextResponse.json(
        {
          data: {
            name: user.name,
            password: user.password,
            role: user.role,
          },
          message: "Database user password reset successfully",
        },
        { status: 200 }
      );
    }
  } catch (err: unknown) {
    if (err as database_error) {
      const message = (err as database_error)?.response?.data?.message;
      console.error("[resetDatabaseUserPassword] Error:", message);
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
