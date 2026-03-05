import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { updateBucketVersioningSchema } from "@/lib/validation/object-storage";
import { validateRequest } from "@/lib/middleware/validate-request";
import { getAuditContext } from "@/lib/audit";
import { requireAdmin } from "@/lib/supabase/auth";
import { ObjectStorageService } from "@/lib/services/object-storage-service";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const rl = await limitByUser(auth.user!.id, { prefix: "rl:bucket-settings", limit: 20, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }
    const body = await req.json();
    const parsed = validateRequest(updateBucketVersioningSchema, body);
    if (!parsed.success) return parsed.response;
    const { bucket_id, enabled } = parsed.data;

    console.log("📦 Updating bucket versioning:", bucket_id, "enabled:", enabled);

    // Get audit context
    const auditContext = getAuditContext(req);
    const adminCheck = await requireAdmin();

    // Use centralized service
    await ObjectStorageService.updateBucketSettings({
      bucket_id,
      user_id: auth.user!.id,
      settings: { versioning_enabled: enabled },
      audit_context: {
        ip_address: auditContext.ipAddress,
        user_agent: auditContext.userAgent,
        request_id: auditContext.requestId,
        user_email: auth.user?.email,
        user_role: adminCheck.ok ? 'admin' : 'user',
      },
    });

    console.log("✅ Bucket versioning updated successfully");

    return NextResponse.json(
      {
        success: true,
        message: `Bucket versioning ${enabled ? 'enabled' : 'disabled'} successfully`,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const err = error as Error & { code?: string };
    
    // Map error codes to HTTP status codes
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json(
        { error: err.message, message: "Bucket not found" },
        { status: 404 }
      );
    }
    
    if (err.code === 'FORBIDDEN') {
      return NextResponse.json(
        { error: err.message, message: "Unauthorized" },
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
