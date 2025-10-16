import { NextRequest, NextResponse } from "next/server";
// import { vmCreateSchema } from "@/types/zod/vm";
// import bcrypt from "bcryptjs";
// import { createServiceClient } from "@/lib/supabase/server";
import axios from "axios";
import { timeRange } from "@/config/functions";
// import { generateStrongPassword, timeRange } from "@/config/functions";

export async function POST(req: NextRequest) {
  try {
    //debugger
    const json = await req.json();
    console.log(json,"...............................25")

    const {start,end}=timeRange(json.hrs || 1);
     //https://api.digitalocean.com/v2/monitoring/metrics/droplet/memory_cached?host_id=523430540&start=1760018865&end=1760105265
   // https://api.digitalocean.com/v2/monitering/metrics/droplet/cpu?host_id=523430540&start=1760094220&end=1760115820
     
    // const droplets=await axios.get(
    //     `https://api.digitalocean.com/v2/monitoring/metrics/droplet/${json.type}?host_id=${json.droplet_id}&start=${start}&end=${end}`,
    //     {
    //       headers: {
    //         Authorization:
    //            process.env.DIGITAL_OCEAN_TOKEN,
    //         "Content-Type": "application/json",
    //       },
    //     }
    //   );


     const droplets=await axios.get(
        `https://api.digitalocean.com/v2/monitoring/metrics/droplet/${json.type}?host_id=${json.droplet_id}&start=${start}&end=${end}`,
        {
          headers: {
            Authorization:
               process.env.DIGITAL_OCEAN_TOKEN,
            "Content-Type": "application/json",
          },
        }
      );



    


    if (droplets.status===200){
         return NextResponse.json(
      {
        data:droplets.data,
        matrix:droplets.data?.data?.result || [],
        message:'droplet get success'
      },
      { status: 200 }
    );
    }

    if(droplets.status!=202){
return NextResponse.json({ error: "there is some internal error. please try later" }, { status: 400 });
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



