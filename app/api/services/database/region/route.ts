import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate required fields
    if (!body.database_id || !body.region) {
      return NextResponse.json(
        { error: "database_id and region are required" },
        { status: 400 }
      );
    }

    const payload = {
      region: body.region,
    };

    // Migrate database cluster to new region via DigitalOcean API
    const response = await axios.put(
      `https://api.digitalocean.com/v2/databases/${body.database_id}/migrate`,
      payload,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(
      "Database region migration response:",
      response.status,
      response.statusText
    );

    if (response.status === 202) {
      // Update Supabase with new region and status='migrating'
      const supabaseUpdate = await Database_Clusters.update_region(
        body.database_id,
        body.region,
        "migrating"
      );

      if (!supabaseUpdate.success) {
        console.error("[region/route] Failed to update Supabase:", supabaseUpdate.error);
        // Still return success as DigitalOcean migration was initiated
      }

      return NextResponse.json(
        {
          message:
            "Database migration initiated successfully. The cluster status will change to 'migrating' and will transition back to 'online' when complete.",
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: "Failed to migrate database cluster" },
      { status: response.status }
    );
  } catch (err: unknown) {
    console.error("Database region migration error:", err);
    
    if (axios.isAxiosError(err)) {
      return NextResponse.json(
        {
          error:
            err.response?.data?.message ||
            err.message ||
            "Failed to migrate database cluster",
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
