import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import axios from "axios";
import { logError, sanitizeError } from "@/lib/api/error-sanitizer";

// Helper function to check if user is admin
async function checkAdminAuth() {
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

    // Fallback: if no droplet IDs were stored in DB (worker failed or cluster still provisioning),
    // query DO for droplets whose name starts with the cluster name and delete them.
    // DO API supports fuzzy name search — "app-ko" matches "app-ko-5ca7-cp", "app-ko-5152-w1", etc.
    const hadStoredIds =
      !!cluster.control_plane?.droplet_id ||
      (Array.isArray(cluster.workers) && cluster.workers.some((w: Record<string, unknown>) => w?.droplet_id));

    if (!hadStoredIds && cluster.cluster_name) {
      try {
        const searchRes = await axios.get(
          `https://api.digitalocean.com/v2/droplets?name=${encodeURIComponent(cluster.cluster_name)}&per_page=200`,
          {
            headers: {
              Authorization: process.env.DIGITAL_OCEAN_TOKEN,
              "Content-Type": "application/json",
            },
          }
        );
        const clusterPrefix = (cluster.cluster_name as string).toLowerCase();
        const matchingDroplets: Array<{ id: number; name: string }> =
          (searchRes.data?.droplets ?? []).filter(
            (d: { name: string }) => d.name.toLowerCase().startsWith(clusterPrefix)
          );
        console.log(`[Admin K8s Delete] Name-based fallback found ${matchingDroplets.length} droplet(s) for "${cluster.cluster_name}"`);
        for (const droplet of matchingDroplets) {
          try {
            await axios.delete(
              `https://api.digitalocean.com/v2/droplets/${droplet.id}`,
              {
                headers: {
                  Authorization: process.env.DIGITAL_OCEAN_TOKEN,
                  "Content-Type": "application/json",
                },
              }
            );
            console.log(`[Admin K8s Delete] ✅ Deleted droplet by name-match: ${droplet.name} (${droplet.id})`);
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            console.error(`[Admin K8s Delete] ❌ Failed to delete droplet ${droplet.name}: ${errorMsg}`);
            dropletDeletionErrors.push(`${droplet.name}: ${errorMsg}`);
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[Admin K8s Delete] ❌ Name-based DO query failed: ${errorMsg}`);
        dropletDeletionErrors.push(`Name-based fallback: ${errorMsg}`);
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
    logError("DELETE /api/admin/kubernetes/clusters/delete", error);
    return NextResponse.json(
      {
        error: "Request processing failed",
        message: sanitizeError(error),
      },
      { status: 500 }
    );
  }
}
