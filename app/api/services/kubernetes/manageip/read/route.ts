// import { vmFetchSchema } from "@/lib/schema/vmSchema";
import { Vms } from "@/lib/supabase/queries";
import { NextRequest, NextResponse } from "next/server";



export async function POST(req: NextRequest) {
 // const auth = await getUserIdOr401();
 // if (auth.response) return auth.response;

  try {
    const {name,location,version,planDetails,nodes} = await req.json();
    
   
    const payload=await Vms.get_by_specs({name,location,version,planDetails,nodes});
    console.log(payload,".............29........");

    if(payload.success===false){
      return NextResponse.json({ error: payload.error || "Something went wrong while fetching free IPs." }, { status: 400 });
    }



     return NextResponse.json(
      {
        message: "Project created successfully",
        payload: payload.payload,
      },
      { status: 201 },
    );





    //return payload;
  } catch (err: unknown) {
     if (err instanceof Error) {
    return NextResponse.json({ error: err.message ?? 'Invalid request' }, { status: 400 });
  } else {
    return NextResponse.json({ error: 'Unknown error occurred' }, { status: 400 });
  }
  }
}