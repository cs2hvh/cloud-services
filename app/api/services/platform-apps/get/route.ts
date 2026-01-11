import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { getPlatformAppSchema } from "@/lib/validation/platform-apps";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";
import { AppStatusService } from "@/lib/services/app-status";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-get",
      limit: 20,
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
    const validation = validateRequest(getPlatformAppSchema, body);
    if (!validation.success) return validation.response;

    const result = await Platform_Apps.get(validation.data.app_id);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    // Verify ownership
    if (result.data.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Sync status from K8s (single source of truth)
    // This ensures the status is always accurate when viewing app details
    const syncResult = await AppStatusService.syncStatus(
      validation.data.app_id,
      result.data.name,
      result.data.status as "running" | "failed" | "pending" | "building" | "stopped"
    );

    // Get environment variables
    const env_vars = await Platform_Apps.get_env_vars(validation.data.app_id);

    // Return app with synced status
    return NextResponse.json({ 
      ...result.data, 
      status: syncResult.currentStatus, // Use synced status
      env_vars 
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
