import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { ObjectStorageFunctions } from "@/config/object-storage-functions";
import { limitByUser } from "@/lib/cooldown/userbased";
import { deleteBucketSchema } from "@/lib/validation/object-storage";
import { validateRequest } from "@/lib/middleware/validate-request";
import { requireAdmin } from "@/lib/supabase/auth";
import { Billing } from "@/lib/supabase/queries";

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
      await Billing.close_active_service("objectspace", {
        userId: auth.user!.id,
        serviceId: bucket_id,
        failOnInsufficient: false,
      });
    } catch (billErr: any) {
      console.warn(`[deleteBucket] Billing close failed: ${billErr?.message || billErr}`);
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
    return NextResponse.json(
      {
        success: true,
        message: result.message,
      },
      { status: 200 }
    );
  } catch (error) {
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
