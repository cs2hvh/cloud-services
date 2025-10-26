import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters } from "@/lib/supabase/queries";

export async function POST(req: NextRequest) {
  try {

    const body = await req.json();

    let status=false;
    if(body.checkStatus){
    
       const database = await axios.get(
      `https://api.digitalocean.com/v2/databases/${body.id}`,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (database.status === 200) {
      //console.log(database.data.database.status,".............database status fetch for check.............");
      status=database.data.database.status==="online"?true:false;
    }
    }


      const supabase_read = await Database_Clusters.read(
            body.id
          );
          if (supabase_read.success) {
            return NextResponse.json(
              {
                data: supabase_read.data,
                status:status,
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















