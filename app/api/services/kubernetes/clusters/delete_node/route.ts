import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateUser } from "@/lib/auth/server-auth";

export async function POST(req: NextRequest) {


  const auth = await authenticateUser();
    if (!auth.authenticated) {
      return auth.response;
    }
  try {
    const json = await req.json();


    console.log(json,".........................41");
    const supabase = await createServiceClient();
    const { data,error } = await supabase
      .from("clusters")
      .select('workers')
  .eq('cluster_id', json.cluster_id)
  .single();


  console.log(data,"..............data in delete node api...........",error?.message);

    if (error)
        //console.log(error.message,"..............error in delete node api...........");
      return NextResponse.json({ error: error.message }, { status: 400 });



    const filtered = (data?.workers ?? []).filter(
  (w: { droplet_id: string }) => String(w.droplet_id) !== String(json.droplet_id)
);
   console.log(filtered,"..............filtered in delete node api...........");

const { error: updErr } = await supabase
  .from('clusters')
  .update({ workers: filtered })
  .eq('cluster_id', json.cluster_id)
  .single();


  console.log(updErr?.message,"..............updErr in delete node api...........");

    if (updErr)
        //console.log(updErr,"..............error in update delete node api...........");
      return NextResponse.json({ error: updErr.message}, { status: 400 });

    return NextResponse.json(
      {
        message: "cluster deleted successfully",
      },
      { status: 200 }
    );
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
