import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { deletePlatformAppSchema } from "@/lib/validation/platform-apps";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { requireAdmin } from "@/lib/supabase/auth";
import { PlatformAppService } from "@/lib/services/platform-app-service";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-delete",
      limit: 10,
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

    const body = await req.json();
    const validation = validateRequest(deletePlatformAppSchema, body);
    if (!validation.success) return validation.response;

    const { app_id, is_admin } = validation.data;

    // If admin flag is set, verify the user is actually an admin
    let isAdminUser = false;
    if (is_admin) {
      const adminCheck = await requireAdmin();
      if (!adminCheck.ok) {
        return NextResponse.json(
          {
            error: "Admin privileges required",
            message: "Admin privileges required",
          },
          { status: 403 }
        );
      }
      isAdminUser = true;
    }

    // Delete using shared service (handles all cleanup)
    try {
      await PlatformAppService.deleteApp({
        appId: app_id,
        userId: auth.user!.id,
        isAdmin: isAdminUser,
      });

      return NextResponse.json({ message: "App deleted successfully" });
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      const statusCode = errorMsg === "App not found" ? 404 :
                        errorMsg === "Unauthorized" ? 403 : 400;
      
      return NextResponse.json(
        { error: errorMsg, message: errorMsg },
        { status: statusCode }
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg, message: msg }, { status: 400 });
  }
}
