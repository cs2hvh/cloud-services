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

    if (!database_id) {
      return NextResponse.json(
        { error: "database_id is required" },
        { status: 400 }
      );
    }

    const result = await DatabaseService.readMaintenanceWindow(database_id);

    if (!result.success) {
      const message = result.error || "Failed to fetch maintenance window";
      const status = message.toLowerCase().includes("not found") ? 404 : 400;
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json(
      {
        maintenance_window: result.data ?? null,
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
