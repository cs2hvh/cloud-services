import { NextRequest, NextResponse } from "next/server";
import { ObjectSpaces } from "@/lib/supabase/queries/object_spaces";
import { authenticateUser } from "@/lib/auth/server-auth";
import { createS3ClientFromAccessKey } from "@/lib/aws/s3-client";
import { updateBucketCORS } from "@/lib/aws/s3-operations";
import { limitByUser } from "@/lib/cooldown/userbased";
import { updateBucketCorsSchema } from "@/lib/validation/object-storage";
import { validateRequest } from "@/lib/middleware/validate-request";
import { NotificationService, createServiceNotification } from "@/lib/notifications";

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
  const parsed = validateRequest(updateBucketCorsSchema, body);
  if (!parsed.success) return parsed.response;
  const { bucket_id, enabled } = parsed.data ;

    console.log("🌐 Updating bucket CORS:", bucket_id, "enabled:", enabled);

    // Get bucket from database
    const bucket = await ObjectSpaces.get_bucket_by_bucket_id(bucket_id);

    if (!bucket) {
      return NextResponse.json(
        { error: "Bucket not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (bucket.owner_id !== auth.user!.id) {
      return NextResponse.json(
        { error: "Unauthorized", message: "You don't have access to this bucket" },
        { status: 403 }
      );
    }

    // Create S3 client
    const s3Client = createS3ClientFromAccessKey(bucket.region);

    // Update CORS in S3
    const updateResult = await updateBucketCORS(s3Client, bucket.name, enabled);

    if (!updateResult.success) {
      console.error("Failed to update bucket CORS:", updateResult.error);
      return NextResponse.json(
        {
          error: "Failed to update bucket CORS",
          message: updateResult.error,
        },
        { status: 500 }
      );
    }

    // Update in database
  const dbResult = await ObjectSpaces.update_bucket_settings(bucket.id as string, { cors_enabled: enabled });

    if (!dbResult.success) {
      console.error("Failed to update CORS in database:", dbResult.error);
    }

    console.log("✅ Bucket CORS updated successfully");

    // Create success notification
    try {
      await NotificationService.create(
        createServiceNotification({
          userId: auth.user!.id,
          type: 'success',
          action: 'updated',
          serviceType: 'object_storage',
          serviceName: bucket.name,
          serviceId: bucket_id,
          metadata: {
            updateType: 'bucket_cors',
            enabled: enabled
          }
        })
      );
    } catch (notifErr) {
      console.error('[updateBucketCORS] Failed to create notification:', notifErr);
    }

    return NextResponse.json(
      {
        success: true,
        message: `Bucket CORS ${enabled ? 'enabled' : 'disabled'} successfully`,
      },
      { status: 200 }
    );
  }  catch (e) {
  const message =
    e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);

  return NextResponse.json(
    {
      error: "Failed to update bucket CORS",
      details: message,
    },
    { status: 500 }
  );
}

}
