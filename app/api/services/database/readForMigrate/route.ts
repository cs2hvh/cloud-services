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
    prefix: "rl:db-read-migrate",
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
    const target_region = searchParams.get("target_region");

    if (!database_id || !target_region) {
      return NextResponse.json(
        { error: "database_id and target_region are required" },
        { status: 400 }
      );
    }

    const result = await DatabaseService.readMigrationStatus({
      clusterId: database_id,
      targetRegion: target_region,
      userId: auth.user.id,
    });

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: result.error || "Failed to check migration status" },
        { status: result.statusCode || 400 }
      );
    }

    return NextResponse.json(
      {
        migration_complete: result.data.migration_complete,
        current_region: result.data.current_region,
        current_status: result.data.current_status,
        target_region: result.data.target_region,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    logError("services/database/readForMigrate", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
