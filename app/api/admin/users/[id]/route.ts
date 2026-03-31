import { createClient, createSSRClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

// GET: Get detailed user information
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authorized } = await checkAdminAuth();

  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  const { id: userId } = await params;

  if (!userId) {
    return NextResponse.json(
      { error: "User ID is required" },
      { status: 400 }
    );
  }

  try {
    const supabase = await createSSRClient();

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get user's auth email
    const { data: authData } = await supabase.auth.admin.getUserById(userId);

    // Get user's servers
    const { data: servers } = await supabase
      .from("servers")
      .select("id, vmid, hostname, os, status, created_at, location")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });

    // Get user's game servers
    const { data: gameServers } = await supabase
      .from("game_servers")
      .select("id, name, game_type, status, created_at, ip, port")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    // Get user's clusters
    const { data: clusters } = await supabase
      .from("clusters")
      .select("id, clusterId, clusterName, status, k8sVersion, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });

    // Get user's projects
    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, description, created_at, is_default")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });

    // Get user's apps
    const { data: apps } = await supabase
      .from("platform_apps")
      .select("id, name, github_url:repository_url, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    return NextResponse.json({
      profile: {
        ...profile,
        email: authData?.user?.email || null,
      },
      resources: {
        servers: servers || [],
        gameServers: gameServers || [],
        clusters: clusters || [],
        projects: projects || [],
        apps: apps || [],
      },
      stats: {
        totalServers: servers?.length || 0,
        totalGameServers: gameServers?.length || 0,
        totalClusters: clusters?.length || 0,
        totalProjects: projects?.length || 0,
        totalApps: apps?.length || 0,
      },
    });
  } catch (err) {
    console.error("[Admin API] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
