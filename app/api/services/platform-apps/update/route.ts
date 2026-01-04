import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { updatePlatformAppSchema } from "@/lib/validation/platform-apps";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";
import { Projects } from "@/lib/supabase/queries/projects";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-update",
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
    const validation = validateRequest(updatePlatformAppSchema, body);
    if (!validation.success) return validation.response;

    const { app_id, ...updateData } = validation.data;

    // Verify ownership first
    const existing = await Platform_Apps.get(app_id);
    if (!existing.success) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    if (existing.data.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const result = await Platform_Apps.update(app_id, updateData);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Add project log if project_id exists
    if (existing.data.project_id) {
      try {
        const changedFields = Object.keys(updateData).filter(k => k !== 'app_id').join(', ');
        await Projects.add_log({
          project_id: existing.data.project_id,
          event: "Platform App Updated",
          text: `Updated app "${existing.data.name}" - Changed: ${changedFields || 'settings'}`,
        });
      } catch (logError) {
        console.warn('[platform-apps/update] Failed to add project log:', logError);
      }
    }

    return NextResponse.json(result.data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
