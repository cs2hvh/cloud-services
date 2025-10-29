import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters, Projects } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { deleteDbSchema } from "@/lib/validation/database";
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
    const validation = validateRequest(deleteDbSchema, body);
    if (!validation.success) {
      return validation.response;
    }
    const validatedData = validation.data;

    // Delete database from DigitalOcean
    const response = await axios.delete(
      `https://api.digitalocean.com/v2/databases/${validatedData.cluster_id}/dbs/${validatedData.db_name}`,
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
        validatedData.cluster_id,
        validatedData.db_name
      );

      if (supabase_result.success) {
        // Add activity log for database deletion
        const clusterData = await Database_Clusters.read(validatedData.cluster_id);
        if (clusterData.success && clusterData.data.project_id) {
          await Projects.add_log({
            project_id: clusterData.data.project_id,
            event: "Trash2",
            text: `Database '${validatedData.db_name}' deleted from cluster`
          });
          console.log(`[deleteDatabase] ✅ Activity log added for database deletion`);
        }
        
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
