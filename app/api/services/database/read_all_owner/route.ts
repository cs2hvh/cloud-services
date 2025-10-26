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


      const supabase_read = await Database_Clusters.read_all_owner(
            body.id
          );

         // console.log(supabase_read, "...........supabase read all owner response...........");
          if (supabase_read.success) {
            return NextResponse.json(
              {
                data: supabase_read.data,

                message: "database fetched successfully",
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



