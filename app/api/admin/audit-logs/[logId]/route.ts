import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { requireAdmin } from "@/lib/supabase/auth";
import { AuditLogService } from "@/lib/audit";

/**
 * GET /api/admin/audit-logs/[logId]
 * 
 * Get a single audit log entry by ID.
 * Admin-only endpoint.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ logId: string }> }
) {
  // Authenticate user
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  // Require admin privileges
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  try {
    console.log('[audit-logs/detail] Fetching audit log detail');
    const { logId } = await params;
    console.log("Fetching audit log ID:", logId);

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(logId)) {
        console.log("Invalid log ID format:", logId);
      return NextResponse.json(
        { error: "Invalid log ID format" },
        { status: 400 }
      );
    }

    // Get audit log
    const result = await AuditLogService.getById(logId);

    if (!result) {
      return NextResponse.json(
        { error: "Audit log not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[audit-logs/detail] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch audit log', details: errorMessage },
      { status: 500 }
    );
  }
}
