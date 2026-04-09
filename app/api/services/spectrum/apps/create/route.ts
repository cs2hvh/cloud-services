import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { createSpectrumAppSchema } from "@/lib/validation/spectrum";
import type { CreateSpectrumAppPayload } from "@/lib/validation/spectrum";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { SpectrumService } from "@/lib/services/spectrum-service";
import { getAuditContext } from "@/lib/audit";
import { requireAdmin } from "@/lib/supabase/auth";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:spectrum-create",
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
    const validation = validateRequest(createSpectrumAppSchema, body);
    if (!validation.success) return validation.response;

    const auditContext = getAuditContext(req);
    const adminCheck = await requireAdmin();
    const isAdmin = !!adminCheck.ok;

    // Use centralized service — handles all business logic
    // Cast is safe: Zod already validated and applied defaults (e.g. tls defaults to "off")
    // Security: always bill against the authenticated user. Admins may specify an owner_id to
    // create an app on behalf of another user, but billing still requires a real authed session.
    const billingUserId = isAdmin && validation.data.owner_id
      ? validation.data.owner_id
      : auth.user!.id;
    const result = await SpectrumService.createApp({
      userId: billingUserId,
      payload: validation.data as CreateSpectrumAppPayload,
      role: typeof body.role === 'string' ? body.role : (isAdmin ? 'admin' : 'user'),
      audit_context: {
        ip_address: auditContext.ipAddress,
        user_agent: auditContext.userAgent,
        request_id: auditContext.requestId,
        user_email: auth.user?.email,
        user_role: isAdmin ? 'admin' : 'user',
      },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const err = error as Error & { code?: string; details?: Record<string, unknown> };

    // Map error codes to HTTP status codes
    if (err.code === "INSUFFICIENT_CREDITS") {
      return NextResponse.json(
        { 
          error: "Insufficient credits", 
          details: err.details 
        },
        { status: 402 }
      );
    }

    if (err.code === "BILLING_REGISTRATION_FAILED") {
      return NextResponse.json(
        { error: err.message },
        { status: 500 }
      );
    }

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
