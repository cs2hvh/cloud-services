import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Database_Clusters, Projects } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();

    // Get cluster details before deletion for logging
    const clusterData = await Database_Clusters.read(body.id);
    const clusterName = clusterData.success ? clusterData.data.name : 'Unknown';
    const projectId = clusterData.success ? clusterData.data.project_id : null;

    const database = await axios.delete(
      `https://api.digitalocean.com/v2/databases/${body.id}`,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(database.status,"............database delete response...........");

    const sendData = {
      cluster_id: body.id,
    };
    const supabase_delete = await Database_Clusters.delete(sendData.cluster_id);

    console.log(supabase_delete,"...........supabase delete response........");
    
    if (supabase_delete.success) {
      // Add activity log for database cluster deletion
      if (projectId) {
        await Projects.add_log({
          project_id: projectId,
          event: "Trash2",
          text: `Database cluster '${clusterName}' deleted`
        });
        console.log(`[deleteDatabase] ✅ Activity log added for cluster deletion`);
      }
      
      return NextResponse.json(
        {
          message: "database deleted successfully",
        },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        { error: supabase_delete.error || "Failed to delete from database" },
        { status: 500 }
      );
    }
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
