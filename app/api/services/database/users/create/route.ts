import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";

import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { DatabaseService } from "@/lib/services/database-service";
import { createDatabaseUserSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated || !auth.user) {
    return auth.response;
  }

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:db-user-create",
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

    const validation = validateRequest(createDatabaseUserSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;

    const result = await DatabaseService.createDatabaseUser(
      {
        clusterId: validatedData.cluster_id,
        name: validatedData.name,
        userId: auth.user.id,
      },
      req,
      auth.user?.email
    );

    if (!result.success) {
      if (result.statusCode === 403 || result.statusCode === 404) {
        return NextResponse.json(
          { error: result.error ?? "Invalid request" },
          { status: result.statusCode }
        );
      }

      if (result.error === "User created in DigitalOcean but failed to sync with database") {
        return NextResponse.json(
          {
            error: "User created in DigitalOcean but failed to sync with database",
            details: result.error,
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { error: result.error ?? "Invalid request" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        data: result.data,
        message: "Database user created successfully",
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    logError("services/database/users/create", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
