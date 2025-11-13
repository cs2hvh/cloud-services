import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { ObjectStorageFunctions } from "@/config/object-storage-functions";
import { limitByUser } from "@/lib/cooldown/userbased";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    // Higher limit for read (used by UI), still protect from abuse
    const rl = await limitByUser(auth.user!.id, { prefix: "rl:bucket-read", limit: 60, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { bucket_id } = body;

    // ✅ VALIDATE REQUEST PAYLOAD
    if (!bucket_id || typeof bucket_id !== 'string') {
      return NextResponse.json(
        { error: "Invalid request", message: "Bucket ID is required" },
        { status: 400 }
      );
    }

    // � SECURE: Use centralized function for bucket reading
    // All sensitive operations are handled securely in the config layer
    const result = await ObjectStorageFunctions.readBucket({
      bucket_id,
      user_id: auth.user!.id,
    });

    // Handle result based on success/failure
    if (!result.success) {
      const statusCode = result.error === "Bucket not found" ? 404 : 
                        result.error === "Unauthorized" ? 403 : 500;
      
      return NextResponse.json(
        {
          error: result.error,
          message: result.message,
        },
        { status: statusCode }
      );
    }

    // ✅ SUCCESS RESPONSE
    return NextResponse.json(
      {
        success: true,
        data: result.data,
      },
      { status: 200 }
    );
  } catch (error) {
    // Generic error handling - no sensitive details exposed
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      {
        error: "Request processing failed",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
