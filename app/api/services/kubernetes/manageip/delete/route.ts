import { NextRequest, NextResponse } from "next/server";
// import { vmCreateSchema } from "@/types/zod/vm";
// import bcrypt from "bcryptjs";
// import { createServiceClient } from "@/lib/supabase/server";
import axios from "axios";
// import { generateStrongPassword } from "@/config/functions";

export async function POST(req: NextRequest) {
  try {
    //debugger
    const json = await req.json();
   
    const droplets=await axios.delete(
        `https://api.digitalocean.com/v2/droplets/${json.droplet_id}`,
        {
          headers: {
            Authorization:
               process.env.DIGITAL_OCEAN_TOKEN,
            "Content-Type": "application/json",
          },
        }
      );

      //console.log(droplets,"..............................24");


     
    


    if (droplets.status===204){
         return NextResponse.json(
      {
        message:'droplet deleted success'
      },
      { status: 200 }
    );
    }

    if(droplets.status!=204){
return NextResponse.json({ message: "there is some internal error. please try later" }, { status: 503 });
    }

  } catch (err: unknown) {
    if (err instanceof Error) {
        console.log(err.message,"...........................47");
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



