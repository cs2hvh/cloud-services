import { createClient, createSSRClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

function sanitizeSearchTerm(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9@._\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

// GET: List all users with pagination and search
export async function GET(request: Request) {
  const { authorized } = await checkAdminAuth();

  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10", 10) || 10));
  const search = sanitizeSearchTerm(searchParams.get("search") || "");
  const roleFilter = searchParams.get("role") || "";

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    // Use service role client to access all users
    const supabase = await createSSRClient();

    // First, get all auth users to map emails
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const emailMap = new Map(
      authUsers?.users?.map((u) => [u.id, u.email]) || []
    );

    // Build query
    let query = supabase
      .from("user_profiles")
      .select("*", { count: "exact" });

    // Apply search filter
    if (search) {
      query = query.or(
        `username.ilike.%${search}%,display_name.ilike.%${search}%,id.ilike.%${search}%`
      );
    }

    // Apply role filter
    if (roleFilter) {
      query = query.contains("roles", [roleFilter]);
    }

    // Apply pagination
    query = query.range(from, to).order("created_at", { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      console.error("[Admin API] Error fetching users:", error);
      return NextResponse.json(
        { error: "Failed to fetch users" },
        { status: 500 }
      );
    }

    // Get additional stats for each user
    const userIds = data?.map((u) => u.id) || [];
    
    // Get server counts
    const { data: serverCounts } = await supabase
      .from("servers")
      .select("owner_id")
      .in("owner_id", userIds);

    // Get game server counts
    const { data: gameServerCounts } = await supabase
      .from("game_servers")
      .select("user_id")
      .in("user_id", userIds);

    // Get cluster counts
    const { data: clusterCounts } = await supabase
      .from("clusters")
      .select("owner_id")
      .in("owner_id", userIds);

    // Aggregate counts
    const stats = userIds.reduce((acc, id) => {
      acc[id] = {
        servers: serverCounts?.filter((s) => s.owner_id === id).length || 0,
        gameServers: gameServerCounts?.filter((g) => g.user_id === id).length || 0,
        clusters: clusterCounts?.filter((c) => c.owner_id === id).length || 0,
      };
      return acc;
    }, {} as Record<string, { servers: number; gameServers: number; clusters: number }>);

    // Enhance user data with stats and email
    const enhancedData = data?.map((user) => ({
      ...user,
      email: emailMap.get(user.id) || null,
      stats: stats[user.id] || { servers: 0, gameServers: 0, clusters: 0 },
    }));

    return NextResponse.json({
      data: enhancedData,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
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

// PATCH: Update user roles or suspend status
export async function PATCH(request: Request) {
  const { authorized, user: adminUser } = await checkAdminAuth();

  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { userId, roles, suspend } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Prevent self-demotion
    if (userId === adminUser?.id && roles && !roles.includes("admin")) {
      return NextResponse.json(
        { error: "Cannot remove your own admin role" },
        { status: 400 }
      );
    }

    const supabase = await createSSRClient();
    const updates: {
      roles?: string[];
      suspend?: boolean;
    } = {};

    if (roles !== undefined) {
      updates.roles = roles;
    }

    if (suspend !== undefined) {
      updates.suspend = suspend;
    }

   // console.log(userId,"...............",updates,"...............");
    const { data, error } = await supabase
      .from("user_profiles")
      .update(updates)
      .eq("id", userId)
      .select("*")
      .single();

    if (error) {
      console.error("[Admin API] Error updating user:", error);
      return NextResponse.json(
        { error: "Failed to update user" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "User updated successfully",
      data,
    });
  } catch (err) {
    console.error("[Admin API] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
