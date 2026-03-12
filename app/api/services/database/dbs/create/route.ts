import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { DatabaseService } from "@/lib/services/database-service";
import { createDbSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated || !auth.user) {
    return auth.response;
  }

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:db-dbs-create",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "Too Many Requests",
        message: `Retry after ${rl.retryAfterSec}s`,
      },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const validation = validateRequest(createDbSchema, body);
    if (!validation.success) {
      return validation.response;
    }
    const validatedData = validation.data;

    const result = await DatabaseService.createDatabaseInternal(
      {
        clusterId: validatedData.cluster_id,
        name: validatedData.name,
        userId: auth.user.id,
      },
      req,
      auth.user.email
    );

    if (!result.success) {
      if (result.statusCode === 404) {
        return NextResponse.json(
          { error: result.error || "Database cluster not found" },
          { status: 404 }
        );
      }

      if (result.statusCode === 403) {
        return NextResponse.json(
          {
            error:
              result.error || "You are not authorized to create databases in this cluster",
          },
          { status: 403 }
        );
      }

      if (result.statusCode === 409) {
        return NextResponse.json(
          { error: result.error || "Database already exists" },
          { status: 409 }
        );
      }

      if (result.statusCode === 500 && result.details) {
        return NextResponse.json(
          {
            error:
              result.error || "there is some issue in creating database in our database",
            details: result.details,
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { error: result.error || "Invalid request" },
        { status: result.statusCode === 400 ? 400 : 500 }
      );
    }

    return NextResponse.json(
      {
        database: result.data,
        message: "Database created successfully",
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message =
      (err as { response?: { data?: { message?: string } } })?.response?.data
        ?.message ?? "Invalid request";
    const status =
      (err as { response?: { status?: number } })?.response?.status ?? 500;

    if (status === 409) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    return NextResponse.json(
      { error: message },
      { status: status === 400 ? 400 : 500 }
    );
  }
}
