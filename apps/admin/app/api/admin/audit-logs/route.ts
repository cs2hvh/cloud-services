import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { requireAdmin } from "@/lib/supabase/auth";
import { AuditLogService } from "@/lib/audit";
import { z } from "zod";
import { logError, sanitizeError } from "@/lib/api/error-sanitizer";

// Custom datetime validation that accepts both ISO 8601 and datetime-local format
const datetimeString = z.string().refine((val) => {
  // Accept formats: "2026-01-24T18:09" (datetime-local) or "2026-01-24T18:09:00Z" (ISO)
  const dateLocalRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
  return dateLocalRegex.test(val) || isoRegex.test(val);
}, { message: "Invalid datetime format" });

const querySchema = z.object({
  user_id: z.string().uuid().optional(),
  service_type: z.enum(['database', 'kubernetes', 'platform_apps', 'network_ddos', 'object_storage', 'auth', 'git_webhook']).optional(),
  action: z.enum(['create', 'update', 'delete', 'login', 'logout', 'token_expired', 'token_refreshed', 'webhook_received', 'provider_connect', 'provider_disconnect', 'password_change']).optional(),
  start_date: datetimeString.optional(),
  end_date: datetimeString.optional(),
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
        console.log("Invalid query parameters:", validation.error.errors);
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

    // A dead audit read must not render as an empty-but-healthy log — that
    // hid six days of unwritten audits once already.
    if (result.error) {
      return NextResponse.json(
        { error: `Audit log unreadable: ${result.error}` },
        { status: 502 }
      );
    }

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
    logError('GET /api/admin/audit-logs', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
