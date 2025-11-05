import { NextRequest, NextResponse } from "next/server";
import { ObjectSpaces } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { createS3ClientFromAccessKey } from "@/lib/aws/s3-client";
import { updateBucketVersioning } from "@/lib/aws/s3-operations";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();
    const { bucket_id, enabled } = body;

    if (!bucket_id || typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: "Invalid request", message: "Bucket ID and enabled flag are required" },
        { status: 400 }
      );
    }

    console.log("📦 Updating bucket versioning:", bucket_id, "enabled:", enabled);

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

    // Update versioning in S3
    const updateResult = await updateBucketVersioning(s3Client, bucket.name, enabled);

    if (!updateResult.success) {
      console.error("Failed to update bucket versioning:", updateResult.error);
      return NextResponse.json(
        {
          error: "Failed to update bucket versioning",
          message: updateResult.error,
        },
        { status: 500 }
      );
    }

    // Update in database
    const dbResult = await ObjectSpaces.update_bucket_settings(bucket.id, { versioning_enabled: enabled });

    if (!dbResult.success) {
      console.error("Failed to update versioning in database:", dbResult.error);
    }

    console.log("✅ Bucket versioning updated successfully");

    return NextResponse.json(
      {
        success: true,
        message: `Bucket versioning ${enabled ? 'enabled' : 'disabled'} successfully`,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("❌ Error updating bucket versioning:", error);
    return NextResponse.json(
      {
        error: "Failed to update bucket versioning",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
