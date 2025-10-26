import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";
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
    const { cluster_id, name } = body;

    if (!cluster_id || !name) {
      return NextResponse.json(
        { error: "cluster_id and name are required" },
        { status: 400 }
      );
    }

    // Create user in DigitalOcean
    const response = await axios.post(
      `https://api.digitalocean.com/v2/databases/${cluster_id}/users`,
      { name },
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 201) {
      console.log("[createDatabaseUser] User created successfully:", response.data.user);

      const user = response.data.user;
      const userData = {
        id: user.name,
        name: user.name,
        role: user.role || "normal",
        password: user.password,
        created_at: new Date().toISOString(),
      };

      // Add user to Supabase
      const supabase_result = await Database_Clusters.add_user(
        cluster_id,
        userData
      );

      if (supabase_result.success) {
        return NextResponse.json(
          {
            data: user,
            message: "Database user created successfully",
          },
          { status: 200 }
        );
      } else {
        return NextResponse.json(
          {
            error: "User created in DigitalOcean but failed to sync with database",
            details: supabase_result.error,
          },
          { status: 500 }
        );
      }
    }
  } catch (err: unknown) {
    if (err as database_error) {
      const message = (err as database_error)?.response?.data?.message;
      console.error("[createDatabaseUser] Error:", message);
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
