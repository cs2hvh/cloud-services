import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { validateRequest } from "@/lib/middleware/validate-request";
import { deleteSpectrumAppSchema } from "@/lib/validation/spectrum";
import { limitByUser } from "@/lib/cooldown/userbased";
import { SpectrumService } from "@/lib/services/spectrum-service";
import { getAuditContext } from "@/lib/audit";
import { requireAdmin } from "@/lib/supabase/auth";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:spectrum-delete",
      limit: 3,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "Too Many Requests",
          message: `Retry after ${rl.retryAfterSec}s`,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const validation = validateRequest(deleteSpectrumAppSchema, body);
    if (!validation.success) return validation.response;

    const adminCheck = await requireAdmin();
    const isAdmin = !!adminCheck.ok;

    const auditContext = getAuditContext(req);

    // Use centralized service — handles billing closure, audit, notifications
    const result = await SpectrumService.deleteApp({
      appId: validation.data.app_id,
      userId: auth.user!.id,
      isAdmin,
      audit_context: {
        ip_address: auditContext.ipAddress,
        user_agent: auditContext.userAgent,
        request_id: auditContext.requestId,
        user_email: auth.user?.email,
        user_role: isAdmin ? 'admin' : 'user',
      },
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const err = error as Error & { code?: string };

    // Map error codes to HTTP status codes
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        { error: err.message },
        { status: 404 }
      );
    }

    if (err.code === "FORBIDDEN") {
      return NextResponse.json(
        { error: err.message },
        { status: 403 }
      );
    }

    // Generic error
    const errorMessage = err.message || "An unexpected error occurred";
    return NextResponse.json(
      {
        error: "Request processing failed",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
