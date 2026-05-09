import {NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { ObjectSpaces } from "@/lib/supabase/queries/object_spaces";
import { requireAdmin } from "@/lib/supabase/auth";
import { logError, sanitizeError } from "@/lib/api/error-sanitizer";

export async function GET() {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  // Re-validate admin status on every request (fresh profile check)
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Admin access required" },
      { status: 403 }
    );
  }

  try {
    console.log("📖 Admin reading all buckets");

    // Get all buckets with user details for admin
    const buckets = await ObjectSpaces.get_all_for_admin();

    console.log(`✅ Retrieved ${buckets.length} buckets for admin`);

    return NextResponse.json(
      {
        success: true,
        data: buckets,
        count: buckets.length,
      },
      { status: 200 }
    );
  } catch (error) {
    logError("GET /api/admin/object-storage/buckets/read-all", error);
    return NextResponse.json(
      {
        error: "Request processing failed",
        message: sanitizeError(error),
      },
      { status: 500 }
    );
  }
}
