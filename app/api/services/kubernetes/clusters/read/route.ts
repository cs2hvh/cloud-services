import { NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server"; // your server-side helper
import { authenticateUser } from "@/lib/auth/server-auth";

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
  const { cluster_id } = body;

  // If cluster_id is provided, get specific cluster, otherwise get all user's clusters
  if (cluster_id) {
    const { data, error } = await supabase
      .from("clusters")
      .select("*")
      .eq("cluster_id", cluster_id)
      .single();

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
      cluster: data
    });
  } else {
    const { data, error } = await supabase
      .from("clusters")
      .select("*")
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
