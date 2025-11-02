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

// GET: List all databases with pagination and search
export async function GET(request: Request) {
  const { authorized } = await checkAdminAuth();

  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "10");
  const search = searchParams.get("search") || "";
  const sortBy = searchParams.get("sortBy") || "created_at";

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    const supabase = await createSSRClient();

    // Build query
    let query = supabase
      .from("database_cluster")
      .select(`
        id,
        name,
        engine,
        version,
        region,
        cluster_id,
        status,
        owner_id,
        created_at,
        project_id,
        user_profiles!owner_id(username)
      `, { count: "exact" });

    // Apply search filter
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,cluster_id.ilike.%${search}%,engine.ilike.%${search}%`
      );
    }

    // Apply sorting
    const sortColumn = sortBy === "email" ? "owner_id" : sortBy;
    query = query.range(from, to).order(sortColumn, { ascending: true });

    const { data, error, count } = await query;

    if (error) {
      console.error("[Admin API] Error fetching databases:", error);
      return NextResponse.json(
        { error: "Failed to fetch databases" },
        { status: 500 }
      );
    }

    // Get auth users for emails
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const emailMap = new Map(
      authUsers?.users?.map((u) => [u.id, u.email]) || []
    );

    // Enhance data with emails
    const enhancedData = data?.map((db: any) => ({
      ...db,
      owner_email: emailMap.get(db.owner_id) || null,
      owner_username: db.user_profiles?.username || null,
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

// PATCH: Update database status or other properties (optional)
export async function PATCH(request: Request) {
  const { authorized } = await checkAdminAuth();

  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { clusterId, status, region } = body;

    if (!clusterId) {
      return NextResponse.json(
        { error: "Cluster ID is required" },
        { status: 400 }
      );
    }

    const supabase = await createSSRClient();
    const updates: {
      status?: string;
      region?: string;
    } = {};

    if (status !== undefined) {
      updates.status = status;
    }

    if (region !== undefined) {
      updates.region = region;
    }

    const { data, error } = await supabase
      .from("database_cluster")
      .update(updates)
      .eq("cluster_id", clusterId)
      .select("*")
      .single();

    if (error) {
      console.error("[Admin API] Error updating database:", error);
      return NextResponse.json(
        { error: "Failed to update database" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Database updated successfully",
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

// DELETE: Delete a database cluster (optional, use with caution)
export async function DELETE(request: Request) {
  const { authorized } = await checkAdminAuth();

  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const clusterId = searchParams.get("clusterId");

    if (!clusterId) {
      return NextResponse.json(
        { error: "Cluster ID is required" },
        { status: 400 }
      );
    }

    const supabase = await createSSRClient();

    const { error } = await supabase
      .from("database_cluster")
      .delete()
      .eq("cluster_id", clusterId);

    if (error) {
      console.error("[Admin API] Error deleting database:", error);
      return NextResponse.json(
        { error: "Failed to delete database" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Database deleted successfully",
    });
  } catch (err) {
    console.error("[Admin API] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
