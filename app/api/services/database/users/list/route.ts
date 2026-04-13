import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";

import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { DatabaseService } from "@/lib/services/database-service";
import { listUsersSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated || !auth.user) {
    return auth.response;
  }

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:db-user-list",
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

    const validation = validateRequest(listUsersSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;

    const result = await DatabaseService.listDatabaseUsers({
      clusterId: validatedData.cluster_id,
      userId: auth.user.id,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? "Invalid request" },
        { status: result.statusCode ?? 400 }
      );
    }

    if (result.warning) {
      return NextResponse.json(
        {
          data: result.data ?? [],
          message: "Database users fetched successfully (sync failed)",
          warning: result.warning,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        data: result.data ?? [],
        message: "Database users fetched and synced successfully",
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    logError("services/database/users/list", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
