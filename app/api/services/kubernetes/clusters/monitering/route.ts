import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { timeRange } from "@/config/functions";
import { authenticateUser } from "@/lib/auth/server-auth";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";

export async function POST(req: NextRequest) {
  try {

    const auth = await authenticateUser();
      if (!auth.authenticated) {
        return auth.response;
      }
    //debugger
    const json = await req.json();
    //console.log(json,"...............................25")

    const {start,end}=timeRange(json.hrs || 1);


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
        message:'data get success'
      },
      { status: 200 }
    );
    }

    if(droplets.status!=202){
return NextResponse.json({ error: "there is some internal error. please try later" }, { status: 400 });
    }

  } catch (err: unknown) {
    logError("services/kubernetes/clusters/monitering", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}



