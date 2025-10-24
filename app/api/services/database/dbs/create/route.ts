import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";

interface database_error {
  response: {
    data: { message: string };
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cluster_id, name } = body;

    if (!cluster_id || !name) {
      return NextResponse.json(
        { error: "cluster_id and name are required" },
        { status: 400 }
      );
    }

    // Create database in DigitalOcean
    const response = await axios.post(
      `https://api.digitalocean.com/v2/databases/${cluster_id}/dbs`,
      { name },
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 201) {
      console.log("[createDatabase] Database created successfully:", response.data.db);

      const database = response.data.db;
      const dbData = {
        id: database.name,
        name: database.name,
        created_at: new Date().toISOString(),
      };

      // Add database to Supabase
      const supabase_result = await Database_Clusters.add_db(
        cluster_id,
        dbData
      );

      if (supabase_result.success) {
        return NextResponse.json(
          {
            data: database,
            message: "Database created successfully",
          },
          { status: 200 }
        );
      } else {
        return NextResponse.json(
          {
            error: "Database created in DigitalOcean but failed to sync with database",
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
