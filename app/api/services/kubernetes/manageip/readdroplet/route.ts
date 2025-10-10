//   const vmData = await axios.get(
//                 `https://api.digitalocean.com/v2/droplets/${checkStatus.data.action.resource_id}`,
//                 {
//                   headers: {
//                     Authorization:
//                       "Bearer dop_v1_d8c411020fc7d2d41f5f30f35b1e8d8a0b06fffd4de117c28b93a5a461be5e8a",
//                     "Content-Type": "application/json",
//                   },
//                 }
//               );

import { NextRequest, NextResponse } from "next/server";
import { vmCreateSchema } from "@/types/zod/vm";
import bcrypt from "bcryptjs";
import { createServiceClient } from "@/lib/supabase/server";
import axios from "axios";
import { generateStrongPassword } from "@/config/functions";
import "dotenv/config"

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();

   
    
       const vmData = await axios.get(
                `https://api.digitalocean.com/v2/droplets/${json.id}`,
                {
                  headers: {
                    Authorization:
                     process.env.DIGITAL_OCEAN_TOKEN,
                    "Content-Type": "application/json",
                  },
                }
              );



          if (vmData.status === 200) {
            
                //go ahead
                return NextResponse.json({ message: "success",data:vmData.data }, { status: 200 });
            }
            else{
                //recall this api
           return NextResponse.json({ error: "there is some internal error. please try later" }, { status: 400 });
    
            }

        }
   catch (err: unknown) {
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