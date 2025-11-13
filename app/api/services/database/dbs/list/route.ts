import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { listDbsSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";
import { DatabaseInstance } from "@/lib/supabase/types";

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
    const validation = validateRequest(listDbsSchema, body);
    if (!validation.success) {
      return validation.response;
    }
    const validatedData = validation.data;

    // Get databases from DigitalOcean
    const response = await axios.get(
      `https://api.digitalocean.com/v2/databases/${validatedData.cluster_id}/dbs`,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 200) {
      //console.log("[listDatabases] Databases fetched successfully:", response.data.dbs);

      const databases = response.data.dbs;

      // Format databases for Supabase
      const formattedDbs = databases.map((db: DatabaseInstance) => ({
        id: db.name,
        name: db.name,
        created_at: new Date().toISOString(),
      }));

      // Sync databases with Supabase
      const supabase_result = await Database_Clusters.update_dbs(
        validatedData.cluster_id,
        formattedDbs
      );

      if (supabase_result.success) {
        return NextResponse.json(
          {
            data: databases,
            message: "Databases fetched and synced successfully",
          },
          { status: 200 }
        );
      } else {
        // Even if sync fails, return the databases from DigitalOcean
        return NextResponse.json(
          {
            data: databases,
            message: "Databases fetched successfully (sync failed)",
            warning: supabase_result.error,
          },
          { status: 200 }
        );
      }
    }
  } catch (err: unknown) {
    if (err as database_error) {
      const message = (err as database_error)?.response?.data?.message;
      console.error("[listDatabases] Error:", message);
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
