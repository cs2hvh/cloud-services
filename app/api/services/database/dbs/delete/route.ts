import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { DatabaseService } from "@/lib/services/database-service";
import { deleteDbSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated || !auth.user) {
    return auth.response;
  }

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:db-dbs-delete",
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

  try {
    const body = await req.json();

    const validation = validateRequest(deleteDbSchema, body);
    if (!validation.success) {
      return validation.response;
    }
    const validatedData = validation.data;

    const result = await DatabaseService.deleteDatabaseInternal({
      clusterId: validatedData.cluster_id,
      dbName: validatedData.db_name,
    });

    if (!result.success) {
      if (result.statusCode === 500 && result.details) {
        return NextResponse.json(
          {
            error: "Database deleted from DigitalOcean but failed to sync with database",
            details: result.details,
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { error: result.error || "Invalid request" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        message: "Database deleted successfully",
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message =
      (err as { response?: { data?: { message?: string } } })?.response?.data
        ?.message ?? "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
