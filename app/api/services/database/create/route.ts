import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";

import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { DatabaseService } from "@/lib/services/database-service";
import {
  createDatabaseSchema,
  validateEngineVersion,
} from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated || !auth.user) {
    return auth.response;
  }

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:db-cluster-create",
    limit: 10,
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

    const validation = validateRequest(createDatabaseSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;

    if (!validateEngineVersion(validatedData.engine, validatedData.version)) {
      return NextResponse.json(
        {
          error: "Invalid version for selected engine",
          message: `Version ${validatedData.version} is not valid for engine ${validatedData.engine}`,
        },
        { status: 400 }
      );
    }

    const result = await DatabaseService.createCluster(
      {
        ...validatedData,
        user_email: auth.user?.email,
      },
      req
    );

    if (!result.success) {
      if (result.errorCode === "INSUFFICIENT_BALANCE") {
        return NextResponse.json(
          {
            error: result.error || "Insufficient credits",
            balance: result.balance,
            required: result.required,
          },
          { status: 402 }
        );
      }

      if (result.errorCode === "SERVER_BUSY") {
        return NextResponse.json(
          {
            error: "Service is temporarily busy. Please try again shortly.",
            message: "Service is temporarily busy. Please try again shortly.",
          },
          { status: 503 }
        );
      }

      if (result.errorCode === "SUPABASE_INSERT_FAILED") {
        return NextResponse.json(
          {
            error: "Failed to save database cluster to database",
            details: result.error,
          },
          { status: 500 }
        );
      }

      if (result.errorCode === "POST_PROVISION_BILLING_FAILED") {
        return NextResponse.json(
          {
            error: "Post-provision billing failed",
            details: result.error,
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          error: result.error || "Invalid request",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        data: result.data,
        connection: result.connection,
        message: "database creation started",
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    logError("services/database/create", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
