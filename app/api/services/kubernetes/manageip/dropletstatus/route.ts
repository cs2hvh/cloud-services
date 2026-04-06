import { NextRequest, NextResponse } from "next/server";
// import { vmCreateSchema } from "@/types/zod/vm";
// import bcrypt from "bcryptjs";
// import { createServiceClient } from "@/lib/supabase/server";
import axios from "axios";
// import { generateStrongPassword } from "@/config/functions";

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();


    console.log(json,".....................26")
   
    
     const checkStatus = await axios.get(
            `https://api.digitalocean.com/v2/actions/${json.id}`,
            {
              headers: {
                Authorization:
                   process.env.DIGITAL_OCEAN_TOKEN,
                "Content-Type": "application/json",
              },
            }
          );


          //console.log(checkStatus.data,"................checkStatus.........41")


          if (checkStatus.status === 200) {
           
                //go ahead
                return NextResponse.json({ message: "success",data:checkStatus.data }, { status: 200 });
          }
            else{
                //recall this api
           return NextResponse.json({ message: "there is some internal error. please try later" }, { status: 400 });
    
            }

        }
   catch (err: unknown) {
    if (err instanceof Error) {
      return NextResponse.json(
        { message: err.message ?? "Invalid request" },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        { message: "Unknown error occurred" },
        { status: 400 }
      );
    }
  }
}
