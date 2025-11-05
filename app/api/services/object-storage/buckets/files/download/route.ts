import { NextRequest, NextResponse } from "next/server";
import { ObjectSpaces } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { createS3ClientFromAccessKey } from "@/lib/aws/s3-client";
import { downloadFile } from "@/lib/aws/s3-operations";
import { Readable } from "stream";

export async function POST(req: NextRequest) {
  // Check authentication
  // const auth = await authenticateUser();
  // if (!auth.authenticated) {
  //   return auth.response;
  // }

  try {
    const body = await req.json();
    const { bucket_id, file_key } = body;

    if (!bucket_id || !file_key) {
      return NextResponse.json(
        { error: "Invalid request", message: "Bucket ID and file key are required" },
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

    // Download file
    const downloadResult = await downloadFile(s3Client, bucket.name, file_key);

    if (!downloadResult.success || !downloadResult.data) {
      console.error("Failed to download file:", downloadResult.error);
      return NextResponse.json(
        {
          error: "Failed to download file",
          message: downloadResult.error,
        },
        { status: 500 }
      );
    }

    // Convert stream to buffer
    const stream = downloadResult.data as Readable;
    const chunks: Buffer[] = [];
    
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    const buffer = Buffer.concat(chunks);

    // Get filename from key
    const filename = file_key.split('/').pop() || 'download';

    // Return file as response
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': downloadResult.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error("❌ Error downloading file:", error);
    return NextResponse.json(
      {
        error: "Failed to download file",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
