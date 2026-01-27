import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { ObjectStorageFunctions } from "@/config/object-storage-functions";
import { NotificationService, createServiceNotification } from "@/lib/notifications";
import { limitByUser } from "@/lib/cooldown/userbased";
import { deleteBucketSchema } from "@/lib/validation/object-storage";
import { validateRequest } from "@/lib/middleware/validate-request";
import { requireAdmin } from "@/lib/supabase/auth";
import { Billing } from "@/lib/supabase/queries/billing";
import { ObjectSpaces } from "@/lib/supabase/queries/object_spaces";
import { AuditLogService, getAuditContext } from "@/lib/audit";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  //console.log(auth.user, "...........auth in bucket delete route........");
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

    // 🔒 SECURE: Use centralized function for bucket deletion
    // All sensitive operations are handled securely in the config layer


    // Close billing for object storage bucket
    try {
      console.log(`[deleteBucket] Closing billing`, {
        userId: auth.user!.id,
        serviceId: bucket_id,
      });
      const billingResult = await Billing.close_active_service("objectspace", {
        userId: auth.user!.id,
        serviceId: bucket_id,
        failOnInsufficient: false,
      });
      console.log(`[deleteBucket] Billing closed`, billingResult);
    } catch (billErr) {
      const msg =
        billErr instanceof Error
          ? billErr.message
          : typeof billErr === "string"
            ? billErr
            : JSON.stringify(billErr);

      console.warn(`[deleteDatabase] Billing close failed: ${msg}`);
      // proceed with deletion even if billing fails, per failOnInsufficient=false
    }

    // Get bucket details for audit log
    const bucketData = await ObjectSpaces.get_bucket_by_bucket_id(bucket_id);

    // Create audit log before deletion
    const auditContext = getAuditContext(req);
    
    if (bucketData) {
      await AuditLogService.create({
        user_id: auth.user!.id,
        user_role: isAdmin ? 'admin' : 'user',
        user_email: auth.user?.email,
        action: 'delete',
        service_type: 'object_storage',
        service_id: bucket_id,
        service_name: bucket_id,
        before_state: bucketData as unknown as Record<string, unknown>,
        ip_address: auditContext.ipAddress,
        user_agent: auditContext.userAgent,
        request_id: auditContext.requestId,
        metadata: {
          force,
        },
      });
    }

    const result = await ObjectStorageFunctions.deleteBucket({
      bucket_id,
      user_id: auth.user!.id,
      force,
      is_admin: isAdmin,
    });

    // Handle result based on success/failure
    
    if (!result.success) {
      const statusCode =
        result.error === "Bucket not found"
          ? 404
          : result.error === "Unauthorized"
            ? 403
            : 500;

      return NextResponse.json(
        {
          error: result.error,
          message: result.message,
        },
        { status: statusCode }
      );
    }

    // ✅ SUCCESS RESPONSE
    // Create notification
    await NotificationService.create(
      createServiceNotification({
        userId: auth.user!.id,
        type: 'success',
        action: 'deleted',
        serviceType: 'object_storage',
        serviceName: bucket_id,
        serviceId: bucket_id,
      })
    );

    return NextResponse.json(
      {
        success: true,
        message: result.message,
      },
      { status: 200 }
    );
  } catch (error) {
    // Create error notification
    try {
      await NotificationService.create(
        createServiceNotification({
          userId: auth.user!.id,
          type: 'error',
          action: 'deleted',
          serviceType: 'object_storage',
          serviceName: 'Object Storage Bucket',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      );
    } catch (notifErr) {
      console.error('Failed to create error notification:', notifErr);
    }

    // Generic error handling - no sensitive details exposed
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      {
        error: "Request processing failed",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
