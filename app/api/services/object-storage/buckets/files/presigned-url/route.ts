import { NextRequest, NextResponse } from "next/server";
import { ObjectSpaces } from "@/lib/supabase/queries";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { createS3ClientFromAccessKey } from "@/lib/aws/s3-client";
import { generatePresignedUrl } from "@/lib/aws/s3-operations";
import { presignedUrlSchema } from "@/lib/validation/object-storage";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function POST(req: NextRequest) {
  // Check authentication (supports both cookie and Authorization header)
  const auth = await authenticateUserFromHeader(req);
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();

    // Validate request
    const validation = validateRequest(presignedUrlSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const { bucket_id, file_key, expires_in, operation } = validation.data;

    console.log("🔗 Generating presigned URL for:", file_key, "Operation:", operation);

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

    // Generate presigned URL
    const urlResult = await generatePresignedUrl(
      s3Client,
      bucket.name,
      file_key,
      expires_in,
      operation
    );

    if (!urlResult.success || !urlResult.url) {
      console.error("Failed to generate presigned URL:", urlResult.error);
      return NextResponse.json(
        {
          error: "Failed to generate presigned URL",
          message: urlResult.error,
        },
        { status: 500 }
      );
    }

    console.log("✅ Presigned URL generated successfully");

    const expiresInSeconds = expires_in || 3600;

    return NextResponse.json(
      {
        success: true,
        data: {
          url: urlResult.url,
          expires_in: expiresInSeconds,
          expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("❌ Error generating presigned URL:", error);
    return NextResponse.json(
      {
        error: "Failed to generate presigned URL",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
