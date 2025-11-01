import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { Projects } from "@/lib/supabase/queries";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const json = await req.json();

    const supabase = await createServiceClient();
    
    // Get cluster details before deletion for logging
    const { data: clusterData, error: readError } = await supabase
      .from("clusters")
      .select("cluster_name, project_id")
      .eq("cluster_id", json.cluster_id)
      .single();
    
    const clusterName = clusterData?.cluster_name || 'Unknown';
    const projectId = clusterData?.project_id || null;
    
    const { error } = await supabase
      .from("clusters")
      .delete()
      .eq("cluster_id", json.cluster_id)
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });

    // Add activity log for Kubernetes cluster deletion
    if (projectId) {
      await Projects.add_log({
        project_id: projectId,
        event: "Trash2",
        text: `Kubernetes cluster '${clusterName}' deleted`
      });
      console.log(`[deleteKubernetesCluster] ✅ Activity log added for cluster deletion`);
    }

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
