import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { updateEnvVarsSchema } from "@/lib/validation/platform-apps";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-env-update",
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
    const validation = validateRequest(updateEnvVarsSchema, body);
    if (!validation.success) return validation.response;

    const { app_id, env_vars } = validation.data;

    // Verify ownership first
    const existing = await Platform_Apps.get(app_id);
    if (!existing.success) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    if (existing.data.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const result = await Platform_Apps.set_env_vars(app_id, env_vars);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ message: "Environment variables updated successfully" });
  } catch (err: any) {
    const msg = err?.message || "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
