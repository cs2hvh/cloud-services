import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

      const supabase_read = await Database_Clusters.read(
        body.id
      );
      
      if (supabase_read.success) {
        return NextResponse.json(
          {
            data: supabase_read.data.network_rules,
            //status:status,
            message: "network data fetched successfully",
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
