import { NextRequest, NextResponse } from "next/server";

import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { DatabaseService } from "@/lib/services/database-service";
import { migrateRegionSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function PUT(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated || !auth.user) {
    return auth.response;
  }

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:db-region-update",
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

    const validation = validateRequest(migrateRegionSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;

    const result = await DatabaseService.updateRegion(
      validatedData.database_id,
      validatedData.region,
      "migrating",
      req
    );

    if (!result.success) {
      if (result.errorCode === "NOT_FOUND") {
        return NextResponse.json(
          { error: "Database cluster not found" },
          { status: 404 }
        );
      }

      if (result.errorCode === "UNSUPPORTED_OPERATION") {
        return NextResponse.json(
          { error: "Region migration is not available for this database engine." },
          { status: 422 }
        );
      }

      return NextResponse.json(
        { error: "Unable to start migration right now. Please try again." },
        { status: result.statusCode || 400 }
      );
    }

    return NextResponse.json(
      {
        message:
          "Database migration initiated successfully. The cluster status will change to 'migrating' and will transition back to 'online' when complete.",
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("[api/services/database/region] Unexpected error:", err);
    if (err instanceof Error) {
      return NextResponse.json(
        { error: "Unable to process migration request." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Unable to process migration request." },
      { status: 500 }
    );
  }
}
