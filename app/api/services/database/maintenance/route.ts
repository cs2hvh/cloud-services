import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";

export async function PUT(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();

    // Validate required fields
    if (!body.database_id || !body.day || !body.hour) {
      return NextResponse.json(
        { error: "database_id, day, and hour are required" },
        { status: 400 }
      );
    }

    const payload = {
      day: body.day,
      hour: body.hour,
    };

    // Update maintenance window via DigitalOcean API
    const response = await axios.put(
      `https://api.digitalocean.com/v2/databases/${body.database_id}/maintenance`,
      payload,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(
      "Maintenance window update response:",
      response.status,
      response.statusText
    );

    if (response.status === 204) {
      // Update Supabase with new maintenance window
      const supabaseUpdate = await Database_Clusters.update_maintenance_window(
        body.database_id,
        { day: body.day, hour: body.hour }
      );

      if (!supabaseUpdate.success) {
        console.error(
          "[maintenance/route] Failed to update Supabase:",
          supabaseUpdate.error
        );
        // Still return success as DigitalOcean update was successful
      }

      return NextResponse.json(
        {
          message: "Maintenance window configured successfully",
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update maintenance window" },
      { status: response.status }
    );
  } catch (err: unknown) {
    console.error("Maintenance window update error:", err);
    
    if (axios.isAxiosError(err)) {
      return NextResponse.json(
        {
          error:
            err.response?.data?.message ||
            err.message ||
            "Failed to update maintenance window",
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
