import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";

import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { DatabaseService } from "@/lib/services/database-service";

export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated || !auth.user) {
    return auth.response;
  }

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:db-maintenance-read",
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
    const searchParams = req.nextUrl.searchParams;
    const database_id = searchParams.get("database_id");

    if (!database_id) {
      return NextResponse.json(
        { error: "database_id is required" },
        { status: 400 }
      );
    }

    const result = await DatabaseService.readMaintenanceWindow(database_id, auth.user.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to fetch maintenance window" },
        { status: result.statusCode || 400 }
      );
    }

    return NextResponse.json(
      {
        maintenance_window: result.data ?? null,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    logError("services/database/maintenance/read", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
