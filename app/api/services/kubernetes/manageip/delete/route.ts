import { NextRequest, NextResponse } from "next/server";
// import { vmCreateSchema } from "@/types/zod/vm";
// import bcrypt from "bcryptjs";
// import { createServiceClient } from "@/lib/supabase/server";
import axios from "axios";
import { authenticateUser } from "@/lib/auth/server-auth";
// import { generateStrongPassword } from "@/config/functions";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
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
        message:'Node deleted successfully'
      },
      { status: 200 }
    );
    }

    if(droplets.status!=204){
return NextResponse.json({ message: "there is some internal error. please try later" }, { status: 503 });
    }

  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error("[ManageIP Delete] Error:", err.message);
      return NextResponse.json(
        { error: "Failed to delete node" },
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



