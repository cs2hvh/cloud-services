import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { deleteBucketSchema } from "@/lib/validation/object-storage";
import { validateRequest } from "@/lib/middleware/validate-request";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";
import { requireAdmin } from "@/lib/supabase/auth";
import { getAuditContext } from "@/lib/audit";
import { ObjectStorageService } from "@/lib/services/object-storage-service";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    // Per-user rate limit for deletion (destructive operation)
    const rl = await limitByUser(auth.user!.id, { prefix: "rl:bucket-delete", limit: 5, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = validateRequest(deleteBucketSchema, body);
    if (!parsed.success) return parsed.response;
    const { bucket_id, force = true } = parsed.data;

    const adminCheck = await requireAdmin();
    const isAdmin = adminCheck.ok;

    // Get audit context
    const auditContext = getAuditContext(req);

    // Use centralized service
    const result = await ObjectStorageService.deleteBucket({
      bucket_id,
      user_id: auth.user!.id,
      force,
      is_admin: isAdmin,
      audit_context: {
        ip_address: auditContext.ipAddress,
        user_agent: auditContext.userAgent,
        request_id: auditContext.requestId,
        user_email: auth.user?.email,
        user_role: isAdmin ? 'admin' : 'user',
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: `Bucket ${result.bucket_name} deleted successfully`,
      },
      { status: 200 }
    );

  } catch (error: unknown) {
    const err = error as Error & { code?: string };
    
    // Map error codes to HTTP status codes
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json(
        { error: "Bucket not found", message: "Bucket not found" },
        { status: 404 }
      );
    }
    
    if (err.code === 'FORBIDDEN') {
      return NextResponse.json(
        { error: "Unauthorized", message: "Unauthorized" },
        { status: 403 }
      );
    }

    // Generic error
    logError("services/object-storage/buckets/delete", err);
    return NextResponse.json(
      {
        error: "Request processing failed",
        message: sanitizeError(err),
      },
      { status: 500 }
    );
  }
}
