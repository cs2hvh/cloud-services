import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { ObjectStorageService } from "@/lib/services/object-storage-service";

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

    // Validate request payload
    if (!bucket_id || typeof bucket_id !== 'string') {
      return NextResponse.json(
        { error: "Invalid request", message: "Bucket ID is required" },
        { status: 400 }
      );
    }

    // Use centralized service (decrypt credentials for internal API)
    const bucket = await ObjectStorageService.getBucket({
      bucket_id,
      user_id: auth.user!.id,
      decrypt_credentials: true,
    });

    return NextResponse.json(
      {
        success: true,
        data: bucket,
      },
      { status: 200 }
    );

  } catch (error: unknown) {
    const err = error as Error & { code?: string };
    
    // Map error codes to HTTP status codes
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json(
        { error: err.message, message: "Bucket not found" },
        { status: 404 }
      );
    }
    
    if (err.code === 'FORBIDDEN') {
      return NextResponse.json(
        { error: "Unauthorized", message: err.message || "Unauthorized" },
        { status: 403 }
      );
    }

    // Generic error
    const errorMessage = err.message || "An unexpected error occurred";
    return NextResponse.json(
      {
        error: "Request processing failed",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
