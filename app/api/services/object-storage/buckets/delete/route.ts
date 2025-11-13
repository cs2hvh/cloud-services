import { NextRequest, NextResponse } from "next/server";
import { ObjectSpaces } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { createS3Client } from "@/lib/aws/s3-client";
import {
  emptyBucket,
  deleteBucket as s3DeleteBucket,
} from "@/lib/aws/s3-operations";
import { deleteSpacesKey } from "@/lib/digitalocean/api/bucket";
import { Encryption } from "@/config/functions";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();
    const { bucket_id, force = true } = body;

    if (!bucket_id || typeof bucket_id !== "string") {
      return NextResponse.json(
        { error: "Invalid request", message: "Bucket ID is required" },
        { status: 400 }
      );
    }

    //console.log("🗑️ Deleting bucket:", bucket_id, "Force:", force);

    // Get bucket from database
    const bucket = await ObjectSpaces.get_bucket_by_bucket_id(bucket_id);

    if (!bucket) {
      return NextResponse.json({ error: "Bucket not found" }, { status: 404 });
    }

    // Verify ownership
    if (bucket.owner_id !== auth.user!.id) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          message: "You don't have access to this bucket",
        },
        { status: 403 }
      );
    }

    // Get access key and secret from environment
    const accessKeyId = process.env.SPACES_ACCESS_KEY;
    const secretAccessKey = process.env.SPACES_SECRET_KEY;

    if (!accessKeyId || !secretAccessKey) {
      console.error(
        "Missing SPACES_ACCESS_KEY or SPACES_SECRET_KEY environment variables"
      );
      return NextResponse.json(
        {
          error: "Server configuration error",
          message: "Object storage credentials not configured",
        },
        { status: 500 }
      );
    }

    // Create S3 client using env credentials
    let s3Client;
    try {
      s3Client = createS3Client(bucket.region, accessKeyId, secretAccessKey);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Failed to create S3 client:", errorMessage);
      return NextResponse.json(
        { error: "Failed to create S3 client", message: errorMessage },
        { status: 500 }
      );
    }

    // If force=true, empty the bucket first
    if (force) {
     // console.log("🗑️ Force delete: emptying bucket first...");
      const emptyResult = await emptyBucket(s3Client, bucket.name);
      if (!emptyResult.success) {
        console.error("Failed to empty bucket:", emptyResult.error);
        return NextResponse.json(
          {
            error: "Failed to empty bucket",
            message: emptyResult.error,
          },
          { status: 500 }
        );
      }
     // console.log(`✅ Deleted ${emptyResult.deletedCount} objects from bucket`);
    }

    // Delete bucket from DigitalOcean Spaces
    const deleteResult = await s3DeleteBucket(s3Client, bucket.name);

    if (!deleteResult.success) {
      console.error("Failed to delete bucket:", deleteResult.error);
      return NextResponse.json(
        {
          error: "Failed to delete bucket",
          message: deleteResult.error,
          hint: "The bucket might not be empty. Use force=true to empty it first.",
        },
        { status: 500 }
      );
    }

   // console.log("✅ Bucket deleted from DigitalOcean Spaces");

    // Delete the access key from DigitalOcean
    if (bucket.key_id) {
     // console.log("🔑 Deleting Spaces access key:", bucket.key_id);
      const decryptedBucketKey=Encryption.decrypt(JSON.parse(bucket.key_id), process.env.ENCRYPTION_KEY!);
      const deleteKeyResult = await deleteSpacesKey(decryptedBucketKey);
      
      if (!deleteKeyResult.success) {
        console.error("Failed to delete Spaces access key:", deleteKeyResult.error);
        // Continue with bucket deletion even if key deletion fails
        // The key might have already been deleted or doesn't exist
      } else {
        console.log("✅ Spaces access key deleted successfully");
      }
    } else {
      console.log("⚠️ No access key ID found for bucket, skipping key deletion");
    }

    // Delete from database
    const dbResult = await ObjectSpaces.delete(bucket.id);

    if (!dbResult.success) {
      console.error("Failed to delete bucket from database:", dbResult.error);
      return NextResponse.json(
        {
          error: "Failed to delete bucket from database",
          message: dbResult.error,
        },
        { status: 500 }
      );
    }

    console.log("✅ Bucket deleted from database");

    return NextResponse.json(
      {
        success: true,
        message: "Bucket deleted successfully",
      },
      { status: 200 }
    );
  } catch (error: any  ) {
    console.error("❌ Error deleting bucket:", error);
    return NextResponse.json(
      {
        error: "Failed to delete bucket",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
