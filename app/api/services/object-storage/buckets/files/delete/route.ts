import { NextRequest, NextResponse } from "next/server";
import { ObjectSpaces } from "@/lib/supabase/queries";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { createS3ClientFromAccessKey } from "@/lib/aws/s3-client";
import { deleteFile, getFileMetadata } from "@/lib/aws/s3-operations";

export async function POST(req: NextRequest) {
  // Check authentication (supports both cookie and Authorization header)
  const auth = await authenticateUserFromHeader(req);
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();
    const { bucket_id, file_key } = body;

    if (!bucket_id || !file_key) {
      return NextResponse.json(
        { error: "Invalid request", message: "Bucket ID and file key are required" },
        { status: 400 }
      );
    }

    console.log("🗑️ Deleting file:", file_key, "from bucket:", bucket_id);

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

    // Get file metadata before deletion (to update stats)
    const metadataResult = await getFileMetadata(s3Client, bucket.name, file_key);
    const fileSize = metadataResult.size || 0;

    // Delete file
    const deleteResult = await deleteFile(s3Client, bucket.name, file_key);

    if (!deleteResult.success) {
      console.error("Failed to delete file:", deleteResult.error);
      return NextResponse.json(
        {
          error: "Failed to delete file",
          message: deleteResult.error,
        },
        { status: 500 }
      );
    }

    console.log("✅ File deleted successfully");

    // Update bucket stats (decrement object count and size)
    await ObjectSpaces.update_bucket_stats(
      bucket.id,
      Math.max(0, bucket.size_bytes - fileSize),
      Math.max(0, bucket.object_count - 1)
    );

    return NextResponse.json(
      {
        success: true,
        message: "File deleted successfully",
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("❌ Error deleting file:", error);
    return NextResponse.json(
      {
        error: "Failed to delete file",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
