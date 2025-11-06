import { NextRequest, NextResponse } from "next/server";
import { ObjectSpaces } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { createBucketSchema, getBucketUrl } from "@/lib/validation/object-storage";
import { validateRequest } from "@/lib/middleware/validate-request";
import { resolveHost } from "@/config/hosttoip";
import { Encryption } from "@/config/functions";
import { createSpacesKey } from "@/lib/digitalocean/api/bucket";
import { createS3Client } from "@/lib/aws/s3-client";
import { createBucket as s3CreateBucket } from "@/lib/aws/s3-operations";

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

    // Check for required environment variables
    const encryptionKey = process.env.ENCRYPTION_KEY;
    const envAccessKey = process.env.SPACES_ACCESS_KEY;
    const envSecretKey = process.env.SPACES_SECRET_KEY;

    if (!encryptionKey) {
      console.error("Missing ENCRYPTION_KEY environment variable");
      return NextResponse.json(
        { error: "Server configuration error", message: "Encryption key not configured" },
        { status: 500 }
      );
    }

    if (!envAccessKey || !envSecretKey) {
      console.error("Missing SPACES_ACCESS_KEY or SPACES_SECRET_KEY environment variables");
      return NextResponse.json(
        { error: "Server configuration error", message: "Spaces credentials not configured" },
        { status: 500 }
      );
    }

    // Step 1: Create bucket using environment credentials
    console.log("🪣 Creating bucket in DigitalOcean Spaces");
    const s3Client = createS3Client(validatedData.region, envAccessKey, envSecretKey);
    const bucketResult = await s3CreateBucket(s3Client, validatedData.name, validatedData.acl);

    if (!bucketResult.success) {
      console.error("Failed to create bucket:", bucketResult.error);
      return NextResponse.json(
        { error: "Failed to create bucket", message: bucketResult.error },
        { status: 500 }
      );
    }

    console.log("✅ Bucket created in DigitalOcean Spaces");

    // Step 2: Create dedicated Spaces access key for this bucket via DigitalOcean API
    console.log("🔑 Creating dedicated Spaces access key for bucket:", validatedData.name);
    const keyResult = await createSpacesKey(validatedData.name, [
      {
        bucket: validatedData.name,
        permission: "readwrite",
      },
    ]);

    if (!keyResult.success || !keyResult.data) {
      console.error("Failed to create Spaces access key:", keyResult.error);
      // Bucket is created but access key creation failed
      // TODO: Consider deleting the bucket or continuing without dedicated key
      return NextResponse.json(
        { error: "Failed to create access key", message: keyResult.error },
        { status: 500 }
      );
    }

    const { access_key: accessKeyId, secret_key: secretAccessKey } = keyResult.data;
    
    // Debug: Check if credentials are present
    console.log("Access Key ID:", accessKeyId ? "Present" : "MISSING");
    console.log("Secret Access Key:", secretAccessKey ? "Present" : "MISSING");
    
    if (!accessKeyId || !secretAccessKey) {
      console.error("Credentials missing from API response:", keyResult.data);
      return NextResponse.json(
        { error: "Invalid API response", message: "Access credentials not returned from DigitalOcean API" },
        { status: 500 }
      );
    }
    
    console.log("✅ Dedicated Spaces access key created");

    // Step 3: Generate and encrypt endpoint URL
    const originalEndpoint = getBucketUrl(validatedData.name, validatedData.region as any);
    let encryptedEndpoint = originalEndpoint;

    try {
      const doSpacesDomain = `${validatedData.name}.${validatedData.region}.digitaloceanspaces.com`;
      const resolveResult = await resolveHost(doSpacesDomain);

      if (resolveResult.records.length > 0) {
        const aRecord = resolveResult.records.find((r) => r.type === "A");
        if (aRecord && aRecord.records.length > 0) {
          const ip = aRecord.records[0] as string;
          const endpointWithIp = originalEndpoint.replace(doSpacesDomain, ip);
          encryptedEndpoint = JSON.stringify(Encryption.encrypt(endpointWithIp, encryptionKey));
          console.log("✅ Endpoint encrypted with IP resolution");
        } else {
          console.warn("⚠️ No A record found, encrypting original endpoint");
          encryptedEndpoint = JSON.stringify(Encryption.encrypt(originalEndpoint, encryptionKey));
        }
      } else {
        console.warn("⚠️ DNS resolution failed, encrypting original endpoint");
        encryptedEndpoint = JSON.stringify(Encryption.encrypt(originalEndpoint, encryptionKey));
      }
    } catch (error) {
      console.error("Error processing endpoint:", error);
      console.warn("⚠️ Using encrypted original endpoint due to error");
      encryptedEndpoint = JSON.stringify(Encryption.encrypt(originalEndpoint, encryptionKey));
    }

    // Step 4: Encrypt credentials
    const encryptedAccessKey = JSON.stringify(
      Encryption.encrypt(accessKeyId, encryptionKey)
    );
    const encryptedSecretKey = JSON.stringify(
      Encryption.encrypt(secretAccessKey, encryptionKey)
    );

    console.log("🔐 Credentials encrypted successfully");

    // Step 5: Store bucket with encrypted credentials in database
    const dbResult = await ObjectSpaces.create_bucket({
      type: "bucket",
      name: validatedData.name,
      bucket_id: validatedData.name,
      region: validatedData.region,
      endpoint: encryptedEndpoint,
      acl: validatedData.acl || "private",
      cors_enabled: validatedData.cors_enabled || false,
      versioning_enabled: validatedData.versioning_enabled || false,
      owner_id: validatedData.owner_id,
      project_id: validatedData.project_id,
      status: "active",
      size_bytes: 0,
      object_count: 0,
      // Store encrypted access keys with the bucket
      key_id: encryptedAccessKey,
      secret_key: encryptedSecretKey,
    });

    if (!dbResult.success) {
      console.error("Failed to save bucket to database:", dbResult.error);
      // TODO: Consider cleanup - delete bucket and access key from DO Spaces
      return NextResponse.json(
        {
          error: "Failed to save bucket",
          message: dbResult.error,
        },
        { status: 500 }
      );
    }

    // console.log("✅ Bucket and credentials saved to database");

    return NextResponse.json(
      {
        success: true,
        data: dbResult.data,
        message: "Bucket created successfully with dedicated access keys",
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
