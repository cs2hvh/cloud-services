import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth/check-admin";
import { createServiceClient } from "@/lib/supabase/server";
import { logError } from "@/lib/api/error-sanitizer";

/**
 * GET /api/admin/platform-apps/custom-profile-requests
 * List all custom profile requests, optionally filtered by status.
 */
export async function GET(req: NextRequest) {
  const auth = await checkAdminAuth();
  if (!auth.authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status") ?? "pending";
  if (!["pending", "approved", "applied", "rejected", "all"].includes(status)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

  try {
    const supabase = await createServiceClient();

    const query = supabase
      .from("platform_custom_profile_requests")
      .select(`
        id, status, reason, user_id, user_email,
        requested_cpu, requested_memory, requested_replicas,
        approved_spec, approved_hourly_rate, admin_notes,
        created_at, reviewed_at,
        app:platform_apps(id, name, size, status, framework, user_id)
      `)
      .order("created_at", { ascending: false });

    if (status !== "all") {
      query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      logError("GET /api/admin/platform-apps/custom-profile-requests", error);
      return NextResponse.json({ error: "Failed to fetch requests" }, { status: 500 });
    }

    return NextResponse.json({ requests: data ?? [] });
  } catch (err) {
    logError("GET /api/admin/platform-apps/custom-profile-requests", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
