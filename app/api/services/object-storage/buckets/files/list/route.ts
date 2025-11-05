import { NextRequest, NextResponse } from "next/server";
import { ObjectSpaces } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { createS3ClientFromAccessKey } from "@/lib/aws/s3-client";
import { listObjects } from "@/lib/aws/s3-operations";

export async function POST(req: NextRequest) {
  // Check authentication
  // const auth = await authenticateUser();
  // if (!auth.authenticated) {
  //   return auth.response;
  // }

  try {
    const body = await req.json();
    const { bucket_id, prefix = '', max_keys = 1000, continuation_token, use_folders = false } = body;

    if (!bucket_id || typeof bucket_id !== 'string') {
      return NextResponse.json(
        { error: "Invalid request", message: "Bucket ID is required" },
        { status: 400 }
      );
    }

    // Get bucket from database
    const bucket = await ObjectSpaces.get_bucket_by_bucket_id(bucket_id);

    if (!bucket) {
      return NextResponse.json(
        { error: "Bucket not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    // if (bucket.owner_id !== auth.user!.id) {
    //   return NextResponse.json(
    //     { error: "Unauthorized", message: "You don't have access to this bucket" },
    //     { status: 403 }
    //   );
    // }

    // Create S3 client
    const s3Client = createS3ClientFromAccessKey(bucket.region);

    // List objects - only use delimiter if use_folders is true
    const delimiter = use_folders ? '/' : undefined;
    const listResult = await listObjects(s3Client, bucket.name, prefix, max_keys, continuation_token, delimiter);

    return NextResponse.json(
      {
        success: true,
        data: listResult,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("❌ Error listing files:", error);
    return NextResponse.json(
      {
        error: "Failed to list files",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
