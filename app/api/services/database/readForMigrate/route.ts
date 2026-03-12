import { NextRequest, NextResponse } from "next/server";

import { authenticateUser } from "@/lib/auth/server-auth";
import { DatabaseService } from "@/lib/services/database-service";

export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
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
    });

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: result.error || "Failed to check migration status" },
        { status: 400 }
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
