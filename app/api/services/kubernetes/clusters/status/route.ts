import { NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server"; // your server-side helper
import { authenticateUser } from "@/lib/auth/server-auth";
// import { Json } from "@/lib/supabase/types";

export const dynamic = "force-dynamic"; // avoid caching

type Row = {
  cluster_name: string;
  create_droplet: boolean | null;
  create_status: boolean | null;
  connect_status: boolean | null;
  verify_status: boolean | null;
  status: "pending" | "creating" | "ready" | "failed" | "deleted" | null;
  kubeconfig: string | null;
  owner_id: string;
  project_id: string | null;
  node_config: {cpu:number,ram:number,storage:number} | null;
  control_plane:{public_ip:string,private_ip:string,droplet_id:string} | null;
  workers: {public_ip:string,private_ip:string,droplet_id:string}[] | null;
};

export async function POST(
  req: Request
) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  const supabase = await createSSRClient();

 // console.log("...............18.......params")
  const body = await req.json().catch(() => null);
 // console.log(body,"...............params 22222")
  const { data, error } = await supabase
    .from("clusters")
    .select("cluster_name, create_droplet, create_status, connect_status, verify_status, status, kubeconfig, node_config, control_plane, workers, owner_id, project_id")
    .eq("cluster_id", body.clusterId)
    .single<Row>();

  if (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch cluster status" },
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
    createDropletStatus: data.create_droplet ?? false,
    createStatus: data.create_status ?? false,
    connectStatus: data.connect_status ?? false,
    verifyStatus: data.verify_status ?? false,
    status: data.status ?? "pending",
    clusterInfo: data
  });
}
