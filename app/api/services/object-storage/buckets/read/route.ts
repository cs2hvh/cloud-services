import { NextRequest, NextResponse } from "next/server";
import { ObjectSpaces } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { Encryption } from "@/config/functions";

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

    console.log("📖 Reading bucket:", bucket_id);

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
          const encryptedData = JSON.parse(bucket.endpoint);
          decryptedBucket.endpoint = Encryption.decrypt(encryptedData, encryptionKey);
          console.log("✅ Endpoint decrypted for client");
        }
      } catch (error) {
        console.error("Error decrypting endpoint:", error);
        // Keep original endpoint if decryption fails
      }
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
