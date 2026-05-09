import { NextRequest, NextResponse } from "next/server";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";

import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { validateRequest } from "@/lib/middleware/validate-request";
import { DatabaseService } from "@/lib/services/database-service";
import { requireAdmin } from "@/lib/supabase/auth";
import { readAllOwnerSchema } from "@/lib/validation/database";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated || !auth.user) {
    return auth.response;
  }

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:db-read-owner",
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

    const validation = validateRequest(readAllOwnerSchema, body);
    if (!validation.success) {
      return validation.response;
    }
    const validatedData = validation.data;

    const authenticatedUserId = auth.user.id;
    let targetOwnerId = authenticatedUserId;

    if (validatedData.id !== authenticatedUserId) {
      const adminCheck = await requireAdmin();
      if (!adminCheck.ok) {
        return NextResponse.json(
          {
            error: "Unauthorized",
            message: "You can only access your own database clusters",
          },
          { status: 403 }
        );
      }
      targetOwnerId = validatedData.id;
    }

    const result = await DatabaseService.readAllOwnerInternal(targetOwnerId);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Invalid request" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        data: result.data,
        message: "database fetched successfully",
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    logError("services/database/read_all_owner", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
