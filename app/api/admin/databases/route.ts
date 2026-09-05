import { createSSRClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth/check-admin";

const DATABASE_SORT_COLUMNS = new Set([
  "created_at",
  "name",
  "engine",
  "version",
  "region",
  "cluster_id",
  "status",
  "owner_id",
  "email",
]);

function sanitizeSearchTerm(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9@._\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Admission is the shared policy in lib/auth/check-admin (requireAdmin:
// ADMIN_EMAILS when set, otherwise user_profiles.roles, plus the second-factor
// and suspension checks). This file used to run its own roles-only query,
// which ignored ADMIN_EMAILS and both of those checks.

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
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10", 10) || 10));
  const search = sanitizeSearchTerm(searchParams.get("search") || "");
  const requestedSortBy = searchParams.get("sortBy") || "created_at";
  const sortBy = DATABASE_SORT_COLUMNS.has(requestedSortBy) ? requestedSortBy : "created_at";

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
    const enhancedData = data?.map((db) => ({
      ...db,
      owner_email: emailMap.get(db.owner_id) || null,
      owner_username: (db.user_profiles as { username?: string } | null)?.username || null,
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
      // Strip credentials — never return password or ca_certificate to client
      data: Object.fromEntries(
        Object.entries(data as Record<string, unknown>).filter(
          ([k]) => k !== "password" && k !== "ca_certificate"
        )
      ),
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
