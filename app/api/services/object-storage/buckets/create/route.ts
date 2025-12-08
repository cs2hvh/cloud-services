import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { createBucketSchema } from "@/lib/validation/object-storage";
import { validateRequest } from "@/lib/middleware/validate-request";
import { ObjectStorageFunctions } from "@/config/object-storage-functions";
import { ObjectSpaces, Projects, Billing } from "@/lib/supabase/queries";
import { ensureBalance, postProvisionBilling } from "@/config/billing-flow";
import { limitByUser } from "@/lib/cooldown/userbased";
import { requireAdmin } from "@/lib/supabase/auth";

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

    const authenticatedUserId = auth.user!.id;
    const requestedOwnerId = validatedData.owner_id;
    let targetOwnerId = authenticatedUserId;

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
    }

    

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
    // Billing: upfront and hourly (dummy)
    const INITIAL_COST = 1.0;
    const HOURLY_RATE = 60;

    // Check balance BEFORE provisioning
    const balCheck = await ensureBalance(targetOwnerId, INITIAL_COST);
    if (!balCheck.ok) {
      return NextResponse.json(
        { error: "Insufficient credits", message: `Required: ${INITIAL_COST}`, balance: balCheck.balance },
        { status: 402 }
      );
    }

    const result = await ObjectStorageFunctions.createBucket({
      name: validatedData.name,
      region: validatedData.region,
      acl: validatedData.acl,
      cors_enabled: validatedData.cors_enabled,
      versioning_enabled: validatedData.versioning_enabled,
      owner_id: targetOwnerId,
      project_id: validatedData.project_id,
    });

    // Handle result based on success/failure
    if (!result.success) {
      // Check if the error is due to bucket already existing
      const statusCode = result.error === "Bucket already exists" ? 409 : 500;
      return NextResponse.json(
        {
          error: result.error,
          message: statusCode===409?"Bucket already exists.":result.message,
        },
        { status: statusCode }
      );
    }

    // ✅ SUCCESS RESPONSE
    // Deduct upfront and add to billing.active_objectspace for hourly billing
    try {
      const serviceId = (result.data as any)?.id ?? validatedData.name;
      await postProvisionBilling({
        userId: targetOwnerId,
        initialCost: INITIAL_COST,
        hourlyRate: HOURLY_RATE,
        serviceId,
        addActive: Billing.add_active_objectspace,
      });
    } catch (e: any) {
      return NextResponse.json(
        { error: "Post-provision billing failed", message: e?.message ?? String(e) },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: result.data, message: result.message }, { status: 201 });
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
