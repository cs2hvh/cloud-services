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

    let payload = {
      rules: [
        {
          type: "ip_addr",
          value: body.ip_address,
        },
      ],
    };

    const update_firewall = await axios.put(
      `https://api.digitalocean.com/v2/databases/${body.id}/firewall`,
      payload,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(update_firewall.data, "...........update firewall response...........");

    if (update_firewall.status === 204) {



         const read_firewall = await axios.get(
      `https://api.digitalocean.com/v2/databases/${body.id}/firewall`,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );


    if(read_firewall.status===200){
   

        console.log(read_firewall.data, "...........read firewall response...........");
      const supabase_read = await Database_Clusters.update_network_rules(
        body.id,
        read_firewall.data?.rules
      );
      
      if (supabase_read.success) {
        return NextResponse.json(
          {
            //data: supabase_read.data,
            //status:status,
            message: "database fetched successfully",
          },
          { status: 200 }
        );
      }
    }
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
