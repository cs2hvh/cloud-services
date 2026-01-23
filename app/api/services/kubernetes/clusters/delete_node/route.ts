import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { Projects } from "@/lib/supabase/queries/projects";
import { AuditLogService } from "@/lib/audit";
import { getAuditContext } from "@/lib/audit/context";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }
  try {
    const json = await req.json();

    console.log(json, ".........................41");
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("clusters")
      .select("workers, cluster_name, project_id")
      .eq("cluster_id", json.cluster_id)
      .single();

    console.log(
      data,
      "..............data in delete node api...........",
      error?.message
    );

    if (error)
      //console.log(error.message,"..............error in delete node api...........");
      return NextResponse.json({ error: error.message }, { status: 400 });

    const filtered = (data?.workers ?? []).filter(
      (w: { droplet_id: string }) =>
        String(w.droplet_id) !== String(json.droplet_id)
    );
    console.log(
      filtered,
      "..............filtered in delete node api..........."
    );

    const { error: updErr } = await supabase
      .from("clusters")
      .update({ workers: filtered })
      .eq("cluster_id", json.cluster_id)
      .single();

    console.log(
      updErr?.message,
      "..............updErr in delete node api..........."
    );

    if (updErr)
      //console.log(updErr,"..............error in update delete node api...........");
      return NextResponse.json({ error: updErr.message }, { status: 400 });

    // Add activity log for node deletion
    if (data.project_id) {
      await Projects.add_log({
        project_id: data.project_id,
        event: "Server",
        text: `Worker node removed from Kubernetes cluster '${data.cluster_name}'`,
      });
      console.log(
        `[deleteKubernetesNode] ✅ Activity log added for node deletion`
      );
    }

    // Create audit log
    try {
      const context = getAuditContext(req);
      await AuditLogService.create({
        user_id: auth.user!.id,
        user_role: 'user',
        user_email: auth.user!.email,
        action: 'delete',
        service_type: 'kubernetes',
        service_id: json.cluster_id,
        service_name: data.cluster_name,
        before_state: { workers: data.workers },
        after_state: { workers: filtered },
        metadata: { 
          operation: 'node_deletion',
          droplet_id: json.droplet_id,
          nodes_removed: 1
        },
        ...context,
      });
    } catch (auditErr) {
      console.error('[deleteKubernetesNode] Failed to create audit log:', auditErr);
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
