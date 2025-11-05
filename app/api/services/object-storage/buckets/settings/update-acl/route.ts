import { NextRequest, NextResponse } from "next/server";
import { ObjectSpaces } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { createS3ClientFromAccessKey } from "@/lib/aws/s3-client";
import { updateBucketACL } from "@/lib/aws/s3-operations";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();
    const { bucket_id, acl } = body;

    if (!bucket_id || !acl) {
      return NextResponse.json(
        { error: "Invalid request", message: "Bucket ID and ACL are required" },
        { status: 400 }
      );
    }

    if (acl !== 'private' && acl !== 'public-read') {
      return NextResponse.json(
        { error: "Invalid ACL", message: "ACL must be 'private' or 'public-read'" },
        { status: 400 }
      );
    }

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
    const dbResult = await ObjectSpaces.update_bucket_settings(bucket.id, { acl });

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
