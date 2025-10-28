import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";
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
  if (!auth.authenticated) {
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
        return NextResponse.json(
          {
            data: database,
            message: "Database creation started",
          },
          { status: 200 }
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
      const message = (err as database_error)?.response?.data?.message;
      console.error("[createDatabase] Error:", message);
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
