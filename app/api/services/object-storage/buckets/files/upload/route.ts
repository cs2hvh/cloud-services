import { NextRequest, NextResponse } from "next/server";
import { ObjectSpaces } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { createS3ClientFromAccessKey } from "@/lib/aws/s3-client";
import { uploadFile } from "@/lib/aws/s3-operations";

export async function POST(req: NextRequest) {
  // Check authentication
  // const auth = await authenticateUser();
  // if (!auth.authenticated) {
  //   return auth.response;
  // }

  try {
    const formData = await req.formData();
    console.log("Form Data received:", formData);
    const bucket_id = formData.get('bucket_id') as string;
    const file = formData.get('file') as File;
    const folder_path = formData.get('folder_path') as string || '';

    console.log("📤 Uploading file:", file?.name, "to bucket:", bucket_id);

    // if (!bucket_id) {
    //   return NextResponse.json(
    //     { error: "Invalid request", message: "Bucket ID is required" },
    //     { status: 400 }
    //   );
    // }

    if (!file) {
      return NextResponse.json(
        { error: "Invalid request", message: "File is required" },
        { status: 400 }
      );
    }

    console.log("📤 Uploading file:", file.name, "to bucket:", bucket_id);

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

    // Construct file key (path)
    const fileKey = folder_path ? `${folder_path}/${file.name}` : file.name;

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload file
    const uploadResult = await uploadFile(
      s3Client,
      bucket.name,
      fileKey,
      buffer,
      file.type
    );

    if (!uploadResult.success) {
      console.error("Failed to upload file:", uploadResult.error);
      return NextResponse.json(
        {
          error: "Failed to upload file",
          message: uploadResult.error,
        },
        { status: 500 }
      );
    }

    console.log("✅ File uploaded successfully");

    // Update bucket stats (increment object count and size)
    await ObjectSpaces.update_bucket_stats(
      bucket.id,
      bucket.size_bytes + file.size,
      bucket.object_count + 1
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          key: fileKey,
          size: file.size,
          etag: uploadResult.etag,
        },
        message: "File uploaded successfully",
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("❌ Error uploading file:", error);
    return NextResponse.json(
      {
        error: "Failed to upload file",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
