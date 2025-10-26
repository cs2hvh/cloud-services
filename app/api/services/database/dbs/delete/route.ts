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
    const { cluster_id, db_name } = body;

    if (!cluster_id || !db_name) {
      return NextResponse.json(
        { error: "cluster_id and db_name are required" },
        { status: 400 }
      );
    }

    // Delete database from DigitalOcean
    const response = await axios.delete(
      `https://api.digitalocean.com/v2/databases/${cluster_id}/dbs/${db_name}`,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 204) {
      console.log("[deleteDatabase] Database deleted successfully from DigitalOcean");

      // Remove database from Supabase
      const supabase_result = await Database_Clusters.remove_db(
        cluster_id,
        db_name
      );

      if (supabase_result.success) {
        return NextResponse.json(
          {
            message: "Database deleted successfully",
          },
          { status: 200 }
        );
      } else {
        return NextResponse.json(
          {
            error: "Database deleted from DigitalOcean but failed to sync with database",
            details: supabase_result.error,
          },
          { status: 500 }
        );
      }
    }
  } catch (err: unknown) {
    if (err as database_error) {
      const message = (err as database_error)?.response?.data?.message;
      console.error("[deleteDatabase] Error:", message);
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
