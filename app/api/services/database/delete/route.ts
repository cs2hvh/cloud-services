import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";

export async function POST(req: NextRequest) {
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

   
      const sendData = {
        cluster_id: body.id,
      };
      const supabase_delete = await Database_Clusters.delete(
        sendData.cluster_id
      );
      if (supabase_delete.success) {
        return NextResponse.json(
          {
            data: database.data,

            message: "database deleted successfully",
          },
          { status: 200 }
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
