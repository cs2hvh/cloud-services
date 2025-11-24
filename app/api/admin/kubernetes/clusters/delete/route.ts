import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

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
   // console.log("Admin kubernetes cluster delete request received");
    const body = await req.json();
    const { cluster_id } = body;
   // console.log(cluster_id, "...........cluster_id to delete........");

    if (!cluster_id) {
      return NextResponse.json(
        { error: "Invalid request", message: "Cluster ID is required" },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();

    // Get cluster details first to destroy droplets if needed
    const { data: cluster } = await supabase
      .from("clusters")
      .select("*")
      .eq("cluster_id", cluster_id)
      .single();

    if (!cluster) {
      return NextResponse.json(
        { error: "Cluster not found" },
        { status: 404 }
      );
    }

    // TODO: Call DigitalOcean API to destroy droplets
    // This should be implemented based on your DigitalOcean integration
    // For now, we'll just delete from database
    
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
