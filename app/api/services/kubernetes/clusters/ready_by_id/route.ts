import { NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server";
import { authenticateUser } from "@/lib/auth/server-auth";

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
  // This route had NO authentication and used the service-role client, so any
  // caller could probe the clusters table for whether an id existed and how far
  // its provisioning had got. docs/SENSITIVE_DATA_EXPOSURE_CHECKLIST.md records
  // it as authenticated, which was not true of the code.
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  const supabase = await createSSRClient();

  const body = await req.json().catch(() => null);
  if (!body?.clusterId) {
    return NextResponse.json(
      { success: false, error: "clusterId is required" },
      { status: 400 }
    );
  }

  // createSSRClient bypasses RLS, so the ownership filter has to be explicit.
  const { data, error } = await supabase
    .from("clusters")
    .select("create_droplet, create_status, connect_status, verify_status, status")
    .eq("cluster_id", body.clusterId)
    .eq("owner_id", auth.user.id)
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
