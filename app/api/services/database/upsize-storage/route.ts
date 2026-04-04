import { NextRequest, NextResponse } from "next/server";

import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { DatabaseService } from "@/lib/services/database-service";
import { upsizeStorageSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function PUT(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated || !auth.user) {
    return auth.response;
  }

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:db-storage-upsize",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();

    const validation = validateRequest(upsizeStorageSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;

    const result = await DatabaseService.upsizeStorage(
      {
        clusterId: validatedData.database_id,
        storageSizeMib: validatedData.storage_size_mib,
        userId: auth.user.id,
      },
      req
    );

    if (!result.success) {
      if (result.errorCode === "NOT_FOUND") {
        return NextResponse.json(
          { error: result.error || "Database cluster not found" },
          { status: 404 }
        );
      }

      if (result.errorCode === "FORBIDDEN") {
        return NextResponse.json(
          { error: result.error || "You are not authorized to modify this database cluster" },
          { status: 403 }
        );
      }

      if (result.errorCode === "INVALID_PARAMETER") {
        return NextResponse.json(
          { error: result.error || "Invalid storage size selected." },
          { status: 400 }
        );
      }

      if (result.errorCode === "UNSUPPORTED_OPERATION") {
        return NextResponse.json(
          { error: "Storage upsize is not available for this database engine." },
          { status: 422 }
        );
      }

      if (result.errorCode === "UNKNOWN_ERROR" && result.error === "Unknown error occurred") {
        return NextResponse.json(
          { error: "An unexpected error occurred" },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { error: result.error || "Unable to upsize storage right now. Please try again." },
        { status: result.statusCode || 500 }
      );
    }

    return NextResponse.json(
      {
        message: "Storage upsize initiated. It will reflect changes in some time",
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("[api/services/database/upsize-storage] Unexpected error:", err);
    if (err instanceof Error) {
      return NextResponse.json(
        { error: "Unable to process storage upsize request." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Unable to process storage upsize request." },
      { status: 500 }
    );
  }
}
