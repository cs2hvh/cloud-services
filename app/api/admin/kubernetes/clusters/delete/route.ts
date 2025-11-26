import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import axios from "axios";

// Helper function to check if user is admin
export async function checkAdminAuth() {
  const supabase = await createClient();
  
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { authorized: false, user: null };
  }

  // Get user profile to check roles
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("roles")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.roles?.includes("admin");

  return { authorized: isAdmin, user };
}

export async function POST(req: NextRequest) {
  // Check authentication
  const { authorized } = await checkAdminAuth();
  
  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { cluster_id } = body;

    if (!cluster_id) {
      return NextResponse.json(
        { error: "Invalid request", message: "Cluster ID is required" },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();

    // Get cluster details including droplet IDs
    const { data: cluster, error: fetchError } = await supabase
      .from("clusters")
      .select("*, control_plane, workers")
      .eq("cluster_id", cluster_id)
      .single();

    if (fetchError || !cluster) {
      return NextResponse.json(
        { error: "Cluster not found" },
        { status: 404 }
      );
    }

    // Delete droplets from DigitalOcean
    const dropletDeletionErrors: string[] = [];
    
    // Delete control plane droplet
    if (cluster.control_plane?.droplet_id) {
      try {
        await axios.delete(
          `https://api.digitalocean.com/v2/droplets/${cluster.control_plane.droplet_id}`,
          {
            headers: {
              Authorization: process.env.DIGITAL_OCEAN_TOKEN,
              "Content-Type": "application/json",
            },
          }
        );
        console.log(`[Admin K8s Delete] ✅ Deleted control plane droplet: ${cluster.control_plane.droplet_id}`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[Admin K8s Delete] ❌ Failed to delete control plane droplet: ${errorMsg}`);
        dropletDeletionErrors.push(`Control plane: ${errorMsg}`);
      }
    }
    
    // Delete worker droplets
    if (cluster.workers && Array.isArray(cluster.workers)) {
      for (const worker of cluster.workers) {
        if (worker?.droplet_id) {
          try {
            await axios.delete(
              `https://api.digitalocean.com/v2/droplets/${worker.droplet_id}`,
              {
                headers: {
                  Authorization: process.env.DIGITAL_OCEAN_TOKEN,
                  "Content-Type": "application/json",
                },
              }
            );
            console.log(`[Admin K8s Delete] ✅ Deleted worker droplet: ${worker.droplet_id}`);
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            console.error(`[Admin K8s Delete] ❌ Failed to delete worker droplet: ${errorMsg}`);
            dropletDeletionErrors.push(`Worker ${worker.droplet_id}: ${errorMsg}`);
          }
        }
      }
    }
    
    // Delete the cluster from database
    const { error: deleteError } = await supabase
      .from("clusters")
      .delete()
      .eq("cluster_id", cluster_id);

    if (deleteError) {
      return NextResponse.json(
        {
          error: "Failed to delete cluster",
          message: deleteError.message,
        },
        { status: 500 }
      );
    }

    // ✅ SUCCESS RESPONSE
    return NextResponse.json(
      {
        success: true,
        message: "Kubernetes cluster deleted successfully",
        droplet_warnings: dropletDeletionErrors.length > 0 ? dropletDeletionErrors : undefined
      },
      { status: 200 }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    console.error("Admin kubernetes cluster delete error:", errorMessage);
    
    return NextResponse.json(
      {
        error: "Request processing failed",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
