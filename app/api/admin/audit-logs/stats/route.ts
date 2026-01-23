import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { requireAdmin } from "@/lib/supabase/auth";
import { AuditLogService } from "@/lib/audit";
import { z } from "zod";

const statsSchema = z.object({
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
});

/**
 * GET /api/admin/audit-logs/stats
 * 
 * Get audit log statistics (counts by action, service type, etc.)
 * Admin-only endpoint.
 */
export async function GET(req: NextRequest) {
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
    // Parse query parameters
    const { searchParams } = new URL(req.url);
    const rawParams = {
      start_date: searchParams.get('start_date') || undefined,
      end_date: searchParams.get('end_date') || undefined,
    };

    const validation = statsSchema.safeParse(rawParams);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid query parameters",
          details: validation.error.errors,
        },
        { status: 400 }
      );
    }

    const params = validation.data;

    // Get stats
    const result = await AuditLogService.getStats({
      date_from: params.start_date,
      date_to: params.end_date,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[audit-logs/stats] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch audit stats', details: errorMessage },
      { status: 500 }
    );
  }
}
