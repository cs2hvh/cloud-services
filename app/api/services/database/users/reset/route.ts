import { NextRequest, NextResponse } from "next/server";

import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { DatabaseService } from "@/lib/services/database-service";
import { resetUserPasswordSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated || !auth.user) {
    return auth.response;
  }

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:db-user-reset",
    limit: 60,
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

    const validation = validateRequest(resetUserPasswordSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;

    const result = await DatabaseService.resetDatabaseUserPassword({
      clusterId: validatedData.cluster_id,
      username: validatedData.username,
      userId: auth.user.id,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? "Failed to reset password" },
        { status: result.statusCode ?? 400 }
      );
    }

    const data =
      result.data && typeof result.data === "object"
        ? (result.data as { name?: string; password?: string; role?: string })
        : {};

    return NextResponse.json(
      {
        data: {
          name: data.name,
          password: data.password,
          role: data.role,
        },
        message: "Database user password reset successfully",
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to reset password" },
      { status: 400 }
    );
  }
}
