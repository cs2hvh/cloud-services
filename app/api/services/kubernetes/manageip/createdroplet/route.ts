// await axios.post(
//         "https://api.digitalocean.com/v2/droplets",
//         payload,
//         {
//           headers: {
//             Authorization:
//               "Bearer dop_v1_d8c411020fc7d2d41f5f30f35b1e8d8a0b06fffd4de117c28b93a5a461be5e8a",
//             "Content-Type": "application/json",
//           },
//         }
//       );


import { NextRequest, NextResponse } from "next/server";
import { vmCreateSchema } from "@/types/zod/vm";
import bcrypt from "bcryptjs";
import { createServiceClient } from "@/lib/supabase/server";
import axios from "axios";
import { generateStrongPassword } from "@/config/functions";

export async function POST(req: NextRequest) {
  try {
    //debugger
    const json = await req.json();
    console.log(json,"...............................25")

    const vmPassword=generateStrongPassword();
  console.log(vmPassword,"...............................28")
    const payload={...json,
     user_data:`#cloud-config\npassword: ${vmPassword}!\nchpasswd:\n  list: |\n    root:${vmPassword}\n  expire: false\nssh_pwauth: true`
    }
    console.log(payload,"...............................28")
    const droplets=await axios.post(
        "https://api.digitalocean.com/v2/droplets",
       payload,
        {
          headers: {
            Authorization:
               process.env.DIGITAL_OCEAN_TOKEN,
            "Content-Type": "application/json",
          },
        }
      );
    


    if (droplets.status===202){
         return NextResponse.json(
      {
        data:droplets.data,
        vmPassword:vmPassword,
        message:'droplet created success'
      },
      { status: 202 }
    );
    }

    if(droplets.status!=202){
return NextResponse.json({ error: "there is some internal error. please try later" }, { status: 400 });
    }
      
    // return NextResponse.json(
    //   {
    //     id: data.id,
    //     ipAddress: data.ip_address,
    //     username: data.username,
    //     location: data.location,
    //     status: data.status,
    //     ram: data.ram,
    //     cpu: data.cpu,
    //     storage: data.storage,
    //     createdAt: data.created_at,
    //   },
    //   { status: 201 }
    // );
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



