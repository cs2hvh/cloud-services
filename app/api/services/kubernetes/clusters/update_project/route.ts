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
    const { cluster_id, project_id } = json;

    if (!cluster_id || !project_id) {
      return NextResponse.json(
        { error: "cluster_id and project_id are required" },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();

    // Get current cluster data for logging
    const { data: clusterData, error: readError } = await supabase
      .from("clusters")
      .select("cluster_name, project_id")
      .eq("cluster_id", cluster_id)
      .single();

    if (readError) {
      return NextResponse.json({ error: readError.message }, { status: 400 });
    }

    const oldProjectId = clusterData?.project_id;
    const clusterName = clusterData?.cluster_name || "Unknown";

    // Update the cluster's project_id
    const { error: updateError } = await supabase
      .from("clusters")
      .update({ project_id: project_id })
      .eq("cluster_id", cluster_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    // Add activity log to old project if it exists
    if (oldProjectId) {
      await Projects.add_log({
        project_id: oldProjectId,
        event: "ArrowRight",
        text: `Kubernetes cluster '${clusterName}' moved to another project`,
      });
    }

    // Add activity log to new project
    await Projects.add_log({
      project_id: project_id,
      event: "Plus",
      text: `Kubernetes cluster '${clusterName}' assigned to this project`,
    });

    console.log(`[updateClusterProject] ✅ Cluster project updated successfully`);

    return NextResponse.json(
      {
        success: true,
        message: "Cluster project updated successfully",
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
