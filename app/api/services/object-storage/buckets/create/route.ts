import { NextRequest, NextResponse } from "next/server";
import { ObjectSpaces } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { createBucketSchema, getBucketUrl } from "@/lib/validation/object-storage";
import { validateRequest } from "@/lib/middleware/validate-request";
import { createS3Client } from "@/lib/aws/s3-client";
import { createBucket as s3CreateBucket } from "@/lib/aws/s3-operations";
import { resolveHost } from "@/config/hosttoip";
import { Encryption } from "@/config/functions";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();

    // ✅ VALIDATE REQUEST PAYLOAD
    const validation = validateRequest(createBucketSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;

    console.log("Creating bucket with data:", validatedData);

    // Get access key and secret from environment
    const accessKeyId = process.env.SPACES_ACCESS_KEY;
    const secretAccessKey = process.env.SPACES_SECRET_KEY;

    if (!accessKeyId || !secretAccessKey) {
      console.error("Missing SPACES_ACCESS_KEY or SPACES_SECRET_KEY environment variables");
      return NextResponse.json(
        { error: "Server configuration error", message: "Object storage credentials not configured" },
        { status: 500 }
      );
    }

    console.log("Using access key:", accessKeyId?.substring(0, 8) + "...");  // Log first 8 chars for debugging

    // Create S3 client using env credentials
    let s3Client;
    try {
      s3Client = createS3Client(validatedData.region, accessKeyId, secretAccessKey);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Failed to create S3 client:", errorMessage);
      return NextResponse.json(
        { error: "Failed to create S3 client", message: errorMessage },
        { status: 500 }
      );
    }

    // Create bucket in DigitalOcean Spaces
    const bucketResult = await s3CreateBucket(s3Client, validatedData.name, validatedData.acl);

    if (!bucketResult.success) {
      console.error("Failed to create bucket:", bucketResult.error);
      return NextResponse.json(
        { error: "Failed to create bucket", message: bucketResult.error },
        { status: 500 }
      );
    }

    console.log("✅ Bucket created in DigitalOcean Spaces");

    // Generate endpoint URL
    const originalEndpoint = getBucketUrl(validatedData.name, validatedData.region as any);
    console.log("Original endpoint:", originalEndpoint);

    // Convert host to IP and encrypt
    let encryptedEndpoint = originalEndpoint;
    try {
      // Extract host from URL (e.g., "bucket-name.ams3.digitaloceanspaces.com")
      const hostMatch = originalEndpoint.match(/https?:\/\/([^\/]+)/);
      if (hostMatch && hostMatch[1]) {
        const host = hostMatch[1];
        console.log("Extracting host:", host);

        // Resolve the DigitalOcean Spaces domain to IP
        const doSpacesDomain = `${validatedData.region}.digitaloceanspaces.com`;
        console.log("Resolving DO Spaces domain:", doSpacesDomain);
        
        const resolveResult = await resolveHost(doSpacesDomain);
        
        if (resolveResult.records.length > 0) {
          // Get the first A record (IPv4)
          const aRecord = resolveResult.records.find((r) => r.type === "A");
          if (aRecord && aRecord.records.length > 0) {
            const ip = aRecord.records[0] as string;
            console.log("Resolved IP:", ip);
            
            // Replace the domain with IP in the endpoint
            const endpointWithIp = originalEndpoint.replace(doSpacesDomain, ip);
            console.log("Endpoint with IP:", endpointWithIp);
            
            // Encrypt the endpoint
            const encryptionKey = process.env.ENCRYPTION_KEY;
            if (encryptionKey) {
              encryptedEndpoint = JSON.stringify(Encryption.encrypt(endpointWithIp, encryptionKey));
              console.log("✅ Endpoint encrypted successfully");
            } else {
              console.warn("⚠️ ENCRYPTION_KEY not found, storing unencrypted");
              encryptedEndpoint = endpointWithIp;
            }
          } else {
            console.warn("⚠️ No A record found, using original endpoint");
          }
        } else {
          console.warn("⚠️ DNS resolution failed, using original endpoint");
        }
      }
    } catch (error) {
      console.error("Error processing endpoint:", error);
      console.warn("⚠️ Using original endpoint due to error");
    }

    // Store in database
    const dbResult = await ObjectSpaces.create_bucket({
      type: 'bucket',
      name: validatedData.name,
      bucket_id: validatedData.name, // Use bucket name as ID
      region: validatedData.region,
      endpoint: encryptedEndpoint, // Store encrypted endpoint with IP
      acl: validatedData.acl || 'private',
      cors_enabled: validatedData.cors_enabled || false,
      versioning_enabled: validatedData.versioning_enabled || false,
      owner_id: validatedData.owner_id,
      project_id: validatedData.project_id,
      status: 'active',
      size_bytes: 0,
      object_count: 0,
    });

    if (!dbResult.success) {
      console.error("Failed to save bucket to database:", dbResult.error);
      
      // TODO: Should we delete the bucket from DO Spaces if database fails?
      
      return NextResponse.json(
        {
          error: "Failed to save bucket",
          message: dbResult.error,
        },
        { status: 500 }
      );
    }

    console.log("✅ Bucket saved to database");

    return NextResponse.json(
      {
        success: true,
        data: dbResult.data,
        message: "Bucket created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Error creating bucket:", errorMessage);
    return NextResponse.json(
      {
        error: "Failed to create bucket",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
