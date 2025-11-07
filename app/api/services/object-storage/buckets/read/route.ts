import { NextRequest, NextResponse } from "next/server";
import { ObjectSpaces } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { Encryption } from "@/config/functions";
import { createS3Client } from "@/lib/aws/s3-client";
import { getBucketStats } from "@/lib/aws/s3-operations";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();
    const { bucket_id } = body;

    if (!bucket_id || typeof bucket_id !== 'string') {
      return NextResponse.json(
        { error: "Invalid request", message: "Bucket ID is required" },
        { status: 400 }
      );
    }

   // console.log("📖 Reading bucket:", bucket_id);

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

    // Decrypt endpoint if encrypted
    let decryptedBucket = { ...bucket };
    if (bucket.endpoint) {
      try {
        const encryptionKey = process.env.ENCRYPTION_KEY;
        if (encryptionKey && bucket.endpoint.startsWith('{')) {
          // Endpoint is encrypted (JSON stringified)
          const encryptedEndpoint = JSON.parse(bucket.endpoint);
          const encryptedAccessKey = JSON.parse(bucket.key_id);
          const encryptedSecretKey = JSON.parse(bucket.secret_key);
          decryptedBucket.endpoint = Encryption.decrypt(encryptedEndpoint, encryptionKey);
          decryptedBucket.key_id = Encryption.decrypt(encryptedAccessKey, encryptionKey);
          decryptedBucket.secret_key = Encryption.decrypt(encryptedSecretKey, encryptionKey);
          //console.log("✅ Endpoint, access key, and secret key decrypted for client");
        }
      } catch (error) {
        console.error("Error decrypting endpoint:", error);
        // Keep original endpoint if decryption fails
      }
    }

    // Get live bucket stats from S3
    try {
      const accessKeyId = process.env.SPACES_ACCESS_KEY;
      const secretAccessKey = process.env.SPACES_SECRET_KEY;

      if (accessKeyId && secretAccessKey) {
        const s3Client = createS3Client(bucket.region, accessKeyId, secretAccessKey);
        const stats = await getBucketStats(s3Client, bucket.name);
        
        if (stats.success) {
          // Update bucket with live stats
          decryptedBucket.size_bytes = stats.size;
          decryptedBucket.object_count = stats.count;
          //console.log(`✅ Live stats fetched - Objects: ${stats.count}, Size: ${stats.size} bytes`);
        } else {
          console.warn("Failed to fetch live stats, using DB values:", stats.error);
        }
      } else {
        console.warn("S3 credentials not available, using DB values");
      }
    } catch (error) {
      console.error("Error fetching live bucket stats:", error);
      // Continue with DB values if live stats fail
    }

    // Return bucket details with decrypted endpoint
    return NextResponse.json(
      {
        success: true,
        data: decryptedBucket,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("❌ Error reading bucket:", error);
    return NextResponse.json(
      {
        error: "Failed to read bucket",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
