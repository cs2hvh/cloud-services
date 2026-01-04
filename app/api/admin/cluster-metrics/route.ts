import { NextResponse } from "next/server";
import { PrometheusService, ClusterMetrics } from "@/lib/services/prometheus";
import { createClient } from "@/lib/supabase/server";

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

export async function GET() {
  try {
    // Check admin authorization
    const { authorized } = await checkAdminAuth();

    if (!authorized) {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }

    // Fetch cluster metrics from Prometheus
    const metrics: ClusterMetrics = await PrometheusService.getClusterMetrics();

    return NextResponse.json({
      success: true,
      data: metrics,
    });
  } catch (error: unknown) {
    console.error("[Admin Cluster Metrics] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
