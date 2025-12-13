import { NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server"; // your server-side helper
// import { Json } from "@/lib/supabase/types";

export const dynamic = "force-dynamic"; // avoid caching

type Row = {
  create_status: boolean | null;
  connect_status: boolean | null;
  verify_status: boolean | null;
  status: "pending" | "creating" | "ready" | "failed" | "deleted" | null;
  kubeconfig: string | null;
  node_config: {cpu:number,ram:number,storage:number} | null;
  control_plane:{public_ip:string,private_ip:string,droplet_id:string} | null;
  workers: {public_ip:string,private_ip:string,droplet_id:string}[] | null;
};

export async function POST(
  req: Request
) {
  const supabase = await createSSRClient();

 // console.log("...............18.......params")
  const body = await req.json().catch(() => null);
 // console.log(body,"...............params 22222")
  const { data, error } = await supabase
    .from("clusters")
    .select("create_status, connect_status, verify_status, status,kubeconfig,node_config,control_plane,workers")
    .eq("cluster_id", body.clusterId)
    .single<Row>();

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
    clusterId: body.clusterId,
    createStatus: data.create_status ?? false,
    connectStatus: data.connect_status ?? false,
    verifyStatus: data.verify_status ?? false,
    status: data.status ?? "pending",
    clusterInfo: data
  });
}
