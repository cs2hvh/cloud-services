import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const database_id = searchParams.get("database_id");

    // Validate required parameter
    if (!database_id) {
      return NextResponse.json(
        { error: "database_id is required" },
        { status: 400 }
      );
    }

    // First, check if database exists in Supabase and get its status
    const supabaseResult = await Database_Clusters.read(database_id);
    
    if (!supabaseResult.success || !supabaseResult.data) {
      return NextResponse.json(
        { error: "Database cluster not found" },
        { status: 404 }
      );
    }

    const dbCluster = supabaseResult.data;

    // If database has a stored maintenance window in Supabase, return it
    if (dbCluster.window) {
      return NextResponse.json(
        {
          maintenance_window: dbCluster.window,
        },
        { status: 200 }
      );
    }

    // Only fetch from DigitalOcean if database is online
    if (dbCluster.status === "online") {
      try {
        const response = await axios.get(
          `https://api.digitalocean.com/v2/databases/${database_id}`,
          {
            headers: {
              Authorization: process.env.DIGITAL_OCEAN_TOKEN,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.status === 200) {
          const cluster = response.data.database;
          const maintenanceWindow = cluster.maintenance_window;

          return NextResponse.json(
            {
              maintenance_window: maintenanceWindow || null,
            },
            { status: 200 }
          );
        }
      } catch (doError) {
        console.error("DigitalOcean API error:", doError);
        // Fall through to return null if DigitalOcean API fails
      }
    }

    // Return null if database is not online or no maintenance window is set
    return NextResponse.json(
      {
        maintenance_window: null,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("Database maintenance window fetch error:", err);

    if (axios.isAxiosError(err)) {
      return NextResponse.json(
        {
          error:
            err.response?.data?.message ||
            err.message ||
            "Failed to fetch maintenance window",
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
