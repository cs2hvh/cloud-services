import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const database_id = searchParams.get("database_id");
    const target_region = searchParams.get("target_region");

    // Validate required parameters
    if (!database_id || !target_region) {
      return NextResponse.json(
        { error: "database_id and target_region are required" },
        { status: 400 }
      );
    }

    // Fetch current cluster status from DigitalOcean API
    const response = await axios.get(
      `https://api.digitalocean.com/v2/databases/${database_id}`,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status !== 200) {
      return NextResponse.json(
        { error: "Failed to fetch database cluster" },
        { status: response.status }
      );
    }

    const cluster = response.data.database;
    const isMigrationComplete =
      cluster.region === target_region && cluster.status === "online";

    // If migration is complete, update Supabase status to 'online'
    if (isMigrationComplete) {
      const supabaseUpdate = await Database_Clusters.update_region(
        database_id,
        target_region,
        "online"
      );

      if (!supabaseUpdate.success) {
        console.error(
          "[readForMigrate/route] Failed to update Supabase:",
          supabaseUpdate.error
        );
      }
    }

    return NextResponse.json(
      {
        migration_complete: isMigrationComplete,
        current_region: cluster.region,
        current_status: cluster.status,
        target_region: target_region,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("Database migration status check error:", err);

    if (axios.isAxiosError(err)) {
      return NextResponse.json(
        {
          error:
            err.response?.data?.message ||
            err.message ||
            "Failed to check migration status",
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
