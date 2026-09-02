import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// PATCH: update roles or suspend status. Inlined from the main app during
// de-coupling; the self-demotion guard is the part that must not be lost.
export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok || !admin.userId) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const { userId, roles, suspend } = body as {
      userId?: string;
      roles?: string[];
      suspend?: boolean;
    };

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }
    // Prevent self-demotion
    if (userId === admin.userId && roles && !roles.includes("admin")) {
      return NextResponse.json(
        { error: "Cannot remove your own admin role" },
        { status: 400 },
      );
    }

    const supabase = await createServiceClient();
    const updates: { roles?: string[]; suspend?: boolean } = {};
    if (roles !== undefined) updates.roles = roles;
    if (suspend !== undefined) updates.suspend = suspend;

    const { data, error } = await supabase
      .from("user_profiles")
      .update(updates)
      .eq("id", userId)
      .select("id, username, display_name, avatar, roles, suspend, created_at")
      .single();

    if (error) {
      console.error("[Admin Users] update failed:", error.message);
      return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
    }

    return NextResponse.json({ message: "User updated successfully", data });
  } catch (err) {
    console.error("[Admin Users] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function sanitizeSearchTerm(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9@._\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Paginated user list. Differs from the main app's GET in one important way:
 * emails come from auth.admin.getUserById per returned row instead of an
 * unpaginated listUsers() call, which silently drops emails past the first
 * 50 users.
 */
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") || "25", 10) || 25),
  );
  const search = sanitizeSearchTerm(searchParams.get("search") || "");
  const roleFilter = searchParams.get("role") || "";
  const suspendedOnly = searchParams.get("suspended") === "true";

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    const supabase = await createServiceClient();

    let query = supabase
      .from("user_profiles")
      .select(
        "id, username, display_name, avatar, roles, suspend, two_factor_enabled, created_at",
        { count: "exact" },
      );

    if (search) {
      query = query.or(
        `username.ilike.%${search}%,display_name.ilike.%${search}%`,
      );
    }
    // roles is an enum[] — an unknown value in contains() errors at PostgREST.
    if (roleFilter === "admin" || roleFilter === "member") {
      query = query.contains("roles", [roleFilter]);
    }
    if (suspendedOnly) query = query.eq("suspend", true);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("[Admin Users] list failed:", error.message);
      return NextResponse.json(
        { error: "Failed to fetch users" },
        { status: 500 },
      );
    }

    const rows = data ?? [];
    const userIds = rows.map((u) => u.id);

    const [emails, serverCounts, gameServerCounts, clusterCounts] =
      await Promise.all([
        Promise.all(
          userIds.map(async (id) => {
            const { data: au } = await supabase.auth.admin.getUserById(id);
            return [id, au?.user?.email ?? null] as const;
          }),
        ),
        supabase.from("servers").select("owner_id").in("owner_id", userIds),
        supabase.from("game_servers").select("user_id").in("user_id", userIds),
        supabase.from("clusters").select("owner_id").in("owner_id", userIds),
      ]);

    const emailMap = new Map(emails);
    const enhanced = rows.map((u) => ({
      ...u,
      email: emailMap.get(u.id) ?? null,
      stats: {
        servers:
          serverCounts.data?.filter((s) => s.owner_id === u.id).length || 0,
        gameServers:
          gameServerCounts.data?.filter((g) => g.user_id === u.id).length || 0,
        clusters:
          clusterCounts.data?.filter((c) => c.owner_id === u.id).length || 0,
      },
    }));

    return NextResponse.json({
      data: enhanced,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err) {
    console.error("[Admin Users] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
