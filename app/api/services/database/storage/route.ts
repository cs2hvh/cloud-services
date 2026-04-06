import { NextRequest, NextResponse } from "next/server";

import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { validateRequest } from "@/lib/middleware/validate-request";
import { DatabaseService } from "@/lib/services/database-service";
import { updateStorageSchema } from "@/lib/validation/database";

export async function PUT(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated || !auth.user) {
    return auth.response;
  }

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:db-storage-update",
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

    const validation = validateRequest(updateStorageSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;

    const result = await DatabaseService.updateStorageInternal(
      validatedData.database_id,
      validatedData.size,
      auth.user.id
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to upgrade database storage tier" },
        { status: result.statusCode || 500 }
      );
    }

    return NextResponse.json(
      {
        message: "resize cluster initiated.It will  reflect changes in some time",
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof Error) {
      return NextResponse.json(
        { error: err.message || "Failed to upgrade database storage tier" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
