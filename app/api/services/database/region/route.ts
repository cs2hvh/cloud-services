import { NextRequest, NextResponse } from "next/server";

import { authenticateUser } from "@/lib/auth/server-auth";
import { DatabaseService } from "@/lib/services/database-service";
import { migrateRegionSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function PUT(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
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
      return NextResponse.json(
        { error: result.error || "Failed to migrate database cluster" },
        { status: 400 }
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
