import { NextRequest, NextResponse } from "next/server";

import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { DatabaseService } from "@/lib/services/database-service";
import { updateMaintenanceSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function PUT(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated || !auth.user) {
    return auth.response;
  }

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:db-maintenance-update",
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

    const validation = validateRequest(updateMaintenanceSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;

    const result = await DatabaseService.updateMaintenanceWindow(
      validatedData.database_id,
      validatedData.day,
      validatedData.hour
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to update maintenance window" },
        { status: result.statusCode || 500 }
      );
    }

    return NextResponse.json(
      {
        message: "Maintenance window configured successfully",
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

    return NextResponse.json(
      { error: "Unknown error occurred" },
      { status: 500 }
    );
  }
}
