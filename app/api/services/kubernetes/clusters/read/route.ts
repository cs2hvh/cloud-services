import { NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server"; // your server-side helper

export const dynamic = "force-dynamic"; // avoid caching

type Row = {
  create_status: boolean | null;
  connect_status: boolean | null;
  verify_status: boolean | null;
  status: "pending" | "creating" | "ready" | "failed" | "deleted" | null;
};

export async function POST(
  req: Request
) {
  const supabase = await createSSRClient();

  //console.log(,"...............params")
 // const body = await req.json().catch(() => null);
  //console.log(body,"...............params 22222")
 // const body = await req.json();
  const { data, error } = await supabase
    .from("clusters")
    .select("*");
    console.log(data,"...............data 22222");
   

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { success: false, error: "Cluster not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: data
  });
}
