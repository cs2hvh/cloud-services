import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { ObjectStorageService } from "@/lib/services/object-storage-service";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    // Per-user rate limit for listing buckets (moderate)
    const rl = await limitByUser(auth.user!.id, { prefix: "rl:bucket-read-all", limit: 120, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { owner_id } = body;

    // Verify user can only request their own buckets
    if (owner_id !== auth.user!.id) {
      return NextResponse.json(
        { error: "Unauthorized", message: "You can only view your own buckets" },
        { status: 403 }
      );
    }

    console.log("📖 Reading all buckets for user:", owner_id);

    // Use centralized service (decrypt credentials for internal API)
    const buckets = await ObjectStorageService.listBuckets({
      owner_id,
      decrypt_credentials: true,
    });

    console.log("✅ Retrieved buckets with decrypted credentials");

    return NextResponse.json(
      {
        success: true,
        data: buckets,
        count: buckets.length,
      },
      { status: 200 }
    );

  } catch (error: unknown) {
    logError("services/object-storage/buckets/read_all", error);
    
    return NextResponse.json(
      {
        error: "Request processing failed",
        message: sanitizeError(error),
      },
      { status: 500 }
    );
  }
}
