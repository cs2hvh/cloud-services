import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { createBucketSchema } from "@/lib/validation/object-storage";
import { validateRequest } from "@/lib/middleware/validate-request";
import { ObjectStorageFunctions } from "@/config/object-storage-functions";
import { ObjectSpaces } from "@/lib/supabase/queries";
import { limitByUser } from "@/lib/cooldown/userbased";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }
  try {
    // Per-user rate limit (bucket creation is sensitive / resource provisioning)
    const rl = await limitByUser(auth.user!.id, { prefix: "rl:bucket-create", limit: 3, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }
    const body = await req.json();

    // ✅ VALIDATE REQUEST PAYLOAD
    const validation = validateRequest(createBucketSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;

    // Duplicate check (DB uniqueness exists; this gives user-friendly 409)
    const existing = await ObjectSpaces.get_bucket_by_bucket_id(validatedData.name);
    if (existing) {
      return NextResponse.json(
        { error: "Bucket name already exists", message: "Choose a different name" },
        { status: 409 }
      );
    }

    // 🔒 SECURE: Use centralized function for bucket creation
    // All sensitive operations are handled securely in the config layer
    const result = await ObjectStorageFunctions.createBucket({
      name: validatedData.name,
      region: validatedData.region,
      acl: validatedData.acl,
      cors_enabled: validatedData.cors_enabled,
      versioning_enabled: validatedData.versioning_enabled,
      owner_id: validatedData.owner_id,
      project_id: validatedData.project_id,
    });

    // Handle result based on success/failure
    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error,
          message: result.message,
        },
        { status: 500 }
      );
    }

    // ✅ SUCCESS RESPONSE
    return NextResponse.json(
      {
        success: true,
        data: result.data,
        message: result.message,
      },
      { status: 201 }
    );
  } catch (error) {
    // Generic error handling - no sensitive details exposed
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      {
        error: "Request processing failed",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
