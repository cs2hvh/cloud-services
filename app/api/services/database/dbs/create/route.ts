import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters, Projects } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { createDbSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";

interface database_error {
  response: {
    data: { message: string };
  };
}

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated || !auth.user) {
    return auth.response;
  }

  try {
    const body = await req.json();
    
    // Validate request body
    const validation = validateRequest(createDbSchema, body);
    if (!validation.success) {
      return validation.response;
    }
    const validatedData = validation.data;

    // Verify cluster exists and user owns it
    const clusterResult = await Database_Clusters.read(validatedData.cluster_id);
    if (!clusterResult.success || !clusterResult.data) {
      return NextResponse.json(
        { error: "Database cluster not found" },
        { status: 404 }
      );
    }

    // Check ownership
    if (clusterResult.data.owner_id !== auth.user.id) {
      return NextResponse.json(
        { error: "You are not authorized to create databases in this cluster" },
        { status: 403 }
      );
    }

    // Create database in DigitalOcean
    const response = await axios.post(
      `https://api.digitalocean.com/v2/databases/${validatedData.cluster_id}/dbs`,
      { name: validatedData.name },
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 201) {
    //  console.log("[createDatabase] Database created successfully:", response.data.db);

      const database = response.data.db;
      const dbData = {
        id: database.name,
        name: database.name,
        created_at: new Date().toISOString(),
      };

      

      // Add database to Supabase
      const supabase_result = await Database_Clusters.add_db(
        validatedData.cluster_id,
        dbData
      );

      if (supabase_result.success) {
        // Add activity log for database creation
        const clusterData = await Database_Clusters.read(validatedData.cluster_id);
        if (clusterData.success && clusterData.data.project_id) {
          await Projects.add_log({
            project_id: clusterData.data.project_id,
            event: "Database",
            text: `Database '${validatedData.name}' created in cluster`
          });
          console.log(`[createDatabase] ✅ Activity log added for database creation`);
        }
        
        return NextResponse.json(
          {
            database: database,
            message: "Database created successfully",
          },
          { status: 201 }
        );
      } else {
        return NextResponse.json(
          {
            error: "there is some issue in creating database in our database",
            details: supabase_result.error,
          },
          { status: 500 }
        );
      }
    }
  } catch (err: unknown) {
    if (err as database_error) {
      const axiosError = err as database_error;
      const message = axiosError?.response?.data?.message;
      const status = (err as { response?: { status?: number } })?.response?.status || 500;
      
      console.error("[createDatabase] Error:", message);
      
      // Handle duplicate database (409)
      if (status === 409) {
        return NextResponse.json(
          { error: message ?? "Database already exists" },
          { status: 409 }
        );
      }
      
      return NextResponse.json(
        { error: message ?? "Invalid request" },
        { status: status === 400 ? 400 : 500 }
      );
    } else {
      return NextResponse.json(
        { error: "Unknown error occurred" },
        { status: 500 }
      );
    }
  }
}
