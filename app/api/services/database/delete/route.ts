import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();

    const database = await axios.delete(
      `https://api.digitalocean.com/v2/databases/${body.id}`,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(database.status,"............database delete response...........");

    const sendData = {
      cluster_id: body.id,
    };
    const supabase_delete = await Database_Clusters.delete(sendData.cluster_id);

    console.log(supabase_delete,"...........supabase delete response........");
    
    if (supabase_delete.success) {
      return NextResponse.json(
        {
          message: "database deleted successfully",
        },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        { error: supabase_delete.error || "Failed to delete from database" },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      return NextResponse.json(
        { error: err.message ?? "Invalid request" },
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
