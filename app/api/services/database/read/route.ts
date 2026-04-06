import { NextRequest, NextResponse } from "next/server";

import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { validateRequest } from "@/lib/middleware/validate-request";
import { DatabaseService } from "@/lib/services/database-service";
import { readDatabaseSchema } from "@/lib/validation/database";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated || !auth.user) {
    return auth.response;
  }

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:db-read",
    limit: 120,
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

    const validation = validateRequest(readDatabaseSchema, body);
    if (!validation.success) {
      return validation.response;
    }
    const validatedData = validation.data;

    const result = await DatabaseService.getClusterInternal({
      clusterId: validatedData.id,
      userId: auth.user.id,
      checkStatus: validatedData.checkStatus,
    });

    if (!result.success) {
      const status =
        result.errorCode === "NOT_FOUND"
          ? 404
          : result.errorCode === "FORBIDDEN"
            ? 403
            : result.errorCode === "INTERNAL_ERROR"
              ? 500
              : 400;
      return NextResponse.json(
        { error: result.error || "Invalid request" },
        { status }
      );
    }

    return NextResponse.json(
      {
        data: result.data,
        message: "database fetched successfully",
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof Error) {
      return NextResponse.json(
        { error: err.message ?? "Invalid request" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Unknown error occurred" }, { status: 400 });
  }
}
