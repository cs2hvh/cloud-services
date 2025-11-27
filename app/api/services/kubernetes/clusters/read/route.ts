import { NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server"; // your server-side helper
import { authenticateUser } from "@/lib/auth/server-auth";
import { requireAdmin } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic"; // avoid caching

export async function POST(
  req: Request
) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  const supabase = await createSSRClient();
  
  // Parse request body
  const body = await req.json().catch(() => ({}));
  const { cluster_id } = body as { cluster_id?: string };

  // Determine admin privileges
  const adminCheck = await requireAdmin();
  const isAdmin = !!adminCheck.ok;

  // If cluster_id is provided, get specific cluster, otherwise get all user's clusters
  if (cluster_id) {
    // If a specific cluster is requested, enforce ownership unless admin
    // Do not include kubeconfig in this response; use dedicated download endpoint
    const query = supabase
      .from("clusters")
      .select("id, cluster_name, cluster_id, status, workers, created_at, k8s_version, owner_id")
      .eq("cluster_id", cluster_id);

    const { data, error } = isAdmin
      ? await query.single()
      : await query.eq("owner_id", auth.user.id).single();

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
      cluster: data,
    });
  } else {
    // List clusters: always restrict to authenticated user's clusters (even if admin)
    const { data, error } = await supabase
      .from("clusters")
      .select("id, cluster_name, cluster_id, status, workers, created_at, k8s_version, owner_id")
      .eq("owner_id", auth.user.id);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: "Clusters not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data
    });
  }
}
