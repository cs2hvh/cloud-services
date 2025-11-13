import { NextRequest, NextResponse } from "next/server";
import { ObjectSpaces } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { createS3ClientFromAccessKey } from "@/lib/aws/s3-client";
import { updateBucketACL } from "@/lib/aws/s3-operations";
import { limitByUser } from "@/lib/cooldown/userbased";
import { updateBucketAclSchema } from "@/lib/validation/object-storage";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    // Per-user rate limit for settings updates (small burst allowed)
    const rl = await limitByUser(auth.user!.id, { prefix: "rl:bucket-settings", limit: 20, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = validateRequest(updateBucketAclSchema, body);
    if (!parsed.success) return parsed.response;
    const { bucket_id, acl } = parsed.data as any;

    console.log("🔒 Updating bucket ACL:", bucket_id, "to", acl);

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

    // Update ACL in S3
    const updateResult = await updateBucketACL(s3Client, bucket.name, acl);

    if (!updateResult.success) {
      console.error("Failed to update bucket ACL:", updateResult.error);
      return NextResponse.json(
        {
          error: "Failed to update bucket ACL",
          message: updateResult.error,
        },
        { status: 500 }
      );
    }

    // Update in database
  const dbResult = await ObjectSpaces.update_bucket_settings(bucket.id as string, { acl });

    if (!dbResult.success) {
      console.error("Failed to update ACL in database:", dbResult.error);
    }

    console.log("✅ Bucket ACL updated successfully");

    return NextResponse.json(
      {
        success: true,
        message: "Bucket ACL updated successfully",
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("❌ Error updating bucket ACL:", error);
    return NextResponse.json(
      {
        error: "Failed to update bucket ACL",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
