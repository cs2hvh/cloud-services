import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { getPlatformAppSchema } from "@/lib/validation/platform-apps";
import { authenticateUser } from "@/lib/auth/server-auth";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";

/**
 * POST /api/services/platform-apps/env-vars/list
 *
 * Returns decrypted environment variable key+value pairs for an app.
 * Values are NOT included in the main app GET response — they are fetched
 * on demand (when the user opens the Settings tab) to avoid sending secrets
 * over the wire on every page load.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-env-list",
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

    const body = await req.json();
    const validation = validateRequest(getPlatformAppSchema, body);
    if (!validation.success) return validation.response;

    const { app_id } = validation.data;

    // Verify ownership before returning secrets
    const existing = await Platform_Apps.get(app_id);
    if (!existing.success || !existing.data) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    if (existing.data.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const raw = await Platform_Apps.get_env_vars(app_id);
    const env_vars = raw.map((ev: { key: string; value: string }) => ({
      key: ev.key,
      value: ev.value,
    }));

    return NextResponse.json({ env_vars });
  } catch (err) {
    logError("services/platform-apps/env-vars/list", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
