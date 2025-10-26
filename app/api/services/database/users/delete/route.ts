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
    const { cluster_id, username } = body;

    if (!cluster_id || !username) {
      return NextResponse.json(
        { error: "cluster_id and username are required" },
        { status: 400 }
      );
    }

    // Delete user from DigitalOcean
    const response = await axios.delete(
      `https://api.digitalocean.com/v2/databases/${cluster_id}/users/${username}`,
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
        cluster_id,
        username
      );

      if (supabase_result.success) {
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
