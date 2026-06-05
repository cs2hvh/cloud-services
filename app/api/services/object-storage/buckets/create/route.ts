import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { createBucketSchema } from "@/lib/validation/object-storage";
import { validateRequest } from "@/lib/middleware/validate-request";
import { limitByUser } from "@/lib/cooldown/userbased";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";
import { requireAdmin } from "@/lib/supabase/auth";
import { getAuditContext } from "@/lib/audit";
import { ObjectStorageService } from "@/lib/services/object-storage-service";

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

    // Validate request payload
    const validation = validateRequest(createBucketSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;

    // Check admin access if creating for another user
    const authenticatedUserId = auth.user!.id;
    const requestedOwnerId = validatedData.owner_id;
    let targetOwnerId = authenticatedUserId;
    let isAdmin = false;

    if (requestedOwnerId !== authenticatedUserId) {
      const adminCheck = await requireAdmin();
      if (!adminCheck.ok) {
        return NextResponse.json(
          {
            error: "Unauthorized",
            message: "You cannot create buckets for other users",
          },
          { status: 403 }
        );
      }
      targetOwnerId = requestedOwnerId;
      isAdmin = true;
    }

    // Get audit context
    const auditContext = getAuditContext(req);

    // Use centralized service
    const result = await ObjectStorageService.createBucket({
      name: validatedData.name,
      region: validatedData.region,
      acl: validatedData.acl || 'private',
      cors_enabled: validatedData.cors_enabled ?? false,
      versioning_enabled: validatedData.versioning_enabled ?? false,
      owner_id: targetOwnerId,
      project_id: validatedData.project_id || null,
      audit_context: {
        ip_address: auditContext.ipAddress,
        user_agent: auditContext.userAgent,
        request_id: auditContext.requestId,
        user_email: auth.user?.email,
        user_role: isAdmin ? 'admin' : 'user',
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: result.bucket,
        message: "Bucket created successfully"
      },
      { status: 201 }
    );

  } catch (error: unknown) {
    const err = error as Error & { code?: string; balance?: number };
    
    // Map error codes to HTTP status codes
    if (err.code === 'BUCKET_EXISTS') {
      return NextResponse.json(
        { error: "Bucket name already exists", message: "Bucket name already exists" },
        { status: 409 }
      );
    }
    
    if (err.code === 'INSUFFICIENT_BALANCE') {
      return NextResponse.json(
        { error: "Insufficient credits", message: "Insufficient credits", balance: err.balance },
        { status: 402 }
      );
    }

    if (err.code === 'CREATION_FAILED') {
      return NextResponse.json(
        { error: "Failed to create bucket", message: "Failed to create bucket" },
        { status: 400 }
      );
    }

    if (err.code === 'BILLING_FAILED') {
      return NextResponse.json(
        { error: "Post provision billing failed", message: "Post provision billing failed" },
        { status: 500 }
      );
    }

    // Generic error
    logError("services/object-storage/buckets/create", err);
    return NextResponse.json(
      {
        error: "Request processing failed",
        message: sanitizeError(err),
      },
      { status: 500 }
    );
  }
}
