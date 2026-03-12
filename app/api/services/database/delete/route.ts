import { NextRequest, NextResponse } from "next/server";

import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { DatabaseService } from "@/lib/services/database-service";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated || !auth.user) {
    return auth.response;
  }

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:db-cluster-delete",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
      { status: 429 }
    );
  }

  try {
    const body = (await req.json()) as {
      id?: string;
      force?: boolean;
    };

    if (!body.id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    const result = await DatabaseService.deleteCluster(
      {
        clusterId: body.id,
        force: Boolean(body.force),
        userId: auth.user.id,
      },
      req,
      auth.user?.email
    );

    if (!result.success) {
      if (result.errorCode === "DATABASE_HAS_ACTIVE_LINKS") {
        return NextResponse.json(
          {
            success: false,
            error: "Cannot delete database with active integrations",
            code: "DATABASE_HAS_ACTIVE_LINKS",
            linked_apps_count: result.linkedAppsCount ?? 0,
            linked_app_names: result.linkedAppNames ?? [],
            hint: "Unlink all apps first, or use force=true to auto-unlink",
          },
          { status: 409 }
        );
      }

      if (result.errorCode === "SUPABASE_DELETE_FAILED") {
        return NextResponse.json(
          { error: result.error || "Failed to delete from database" },
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
        message: "database deleted successfully",
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
      { status: 400 }
    );
  }
}
