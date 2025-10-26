import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
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

    // Get specific database from DigitalOcean
    const response = await axios.get(
      `https://api.digitalocean.com/v2/databases/${cluster_id}/dbs/${db_name}`,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 200) {
      console.log("[retrieveDatabase] Database retrieved successfully:", response.data.db);

      return NextResponse.json(
        {
          data: response.data.db,
          message: "Database retrieved successfully",
        },
        { status: 200 }
      );
    }
  } catch (err: unknown) {
    if (err as database_error) {
      const message = (err as database_error)?.response?.data?.message;
      console.error("[retrieveDatabase] Error:", message);
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
