import { NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";

export const dynamic = "force-dynamic"; // avoid caching

type Row = {
  create_droplet: boolean | null;
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
  const body = await req.json().catch(() => null);
  const { data, error } = await supabase
    .from("clusters")
    .select("create_droplet, create_status, connect_status, verify_status, status")
    .eq("cluster_id", body.clusterId)
    .single<Row>();

  if (error) {
    return NextResponse.json(
      { success: false, error: "Cluster not found" },
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
  });
}
