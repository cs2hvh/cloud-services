import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";

import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { DatabaseService } from "@/lib/services/database-service";
import { deleteDatabaseUserSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated || !auth.user) {
    return auth.response;
  }

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:db-user-delete",
    limit: 60,
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

    const validation = validateRequest(deleteDatabaseUserSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;

    const result = await DatabaseService.deleteDatabaseUser(
      {
        clusterId: validatedData.cluster_id,
        username: validatedData.username,
        userId: auth.user.id,
        userEmail: auth.user?.email,
      },
      req
    );

    if (!result.success) {
      if (result.statusCode === 403 || result.statusCode === 404) {
        return NextResponse.json(
          {
            error: result.error ?? "Invalid request",
            message: result.error ?? "Invalid request",
          },
          { status: result.statusCode }
        );
      }

      if (result.error === "User deleted from the database provider but failed to sync with database") {
        return NextResponse.json(
          {
            error: "User deletion failed. Kindly contact support",
            message: "User deletion failed. Kindly contact support",
            details: result.error,
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          error: result.error ?? "Invalid request",
          message: result.error ?? "Invalid request",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        message: "Database user deleted successfully",
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    logError("services/database/users/delete", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
