import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { requireAdmin } from "@/lib/supabase/auth";
import { AuditLogService } from "@/lib/audit";
import { z } from "zod";

const querySchema = z.object({
  user_id: z.string().uuid().optional(),
  service_type: z.enum(['database', 'kubernetes', 'platform_apps', 'network_ddos', 'object_storage']).optional(),
  action: z.enum(['create', 'update', 'delete']).optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * GET /api/admin/audit-logs
 * 
 * Query audit logs with filters and pagination.
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
    // Parse and validate query parameters
    const { searchParams } = new URL(req.url);
    const rawParams = {
      user_id: searchParams.get('user_id') || undefined,
      service_type: searchParams.get('service_type') || undefined,
      action: searchParams.get('action') || undefined,
      start_date: searchParams.get('start_date') || undefined,
      end_date: searchParams.get('end_date') || undefined,
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
    };

    const validation = querySchema.safeParse(rawParams);
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

    // Query audit logs
    const result = await AuditLogService.query(
      {
        user_id: params.user_id,
        service_type: params.service_type,
        action: params.action,
        date_from: params.start_date,
        date_to: params.end_date,
      },
      {
        page: params.page,
        limit: params.limit,
      }
    );

    return NextResponse.json({
      success: true,
      data: result.data,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: result.total,
        pages: Math.ceil((result.total || 0) / params.limit),
      },
    });
  } catch (error) {
    console.error('[audit-logs] Query error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to query audit logs', details: errorMessage },
      { status: 500 }
    );
  }
}
