import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { revealEnvVarSchema } from "@/lib/validation/platform-apps";
import { authenticateUser } from "@/lib/auth/server-auth";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";
import { logAudit } from "@/lib/api/audit-logger";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";

/**
 * POST /api/services/platform-apps/env-vars/reveal
 *
 * Returns the decrypted value for a single env var key.
 * Stricter rate limit (5/min) because each call returns a live secret.
 * Every access is audit-logged with userId, appId, and key name.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-env-reveal",
      limit: 5,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const validation = validateRequest(revealEnvVarSchema, body);
    if (!validation.success) return validation.response;

    const { app_id, key } = validation.data;

    // Ownership check
    const existing = await Platform_Apps.get(app_id);
    if (!existing.success || !existing.data) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    if (existing.data.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Audit every reveal — key name is intentionally logged (not the value)
    logAudit("env_var_revealed", { userId: auth.user!.id, appId: app_id, key });

    // Pass key so only the requested row is queried and decrypted server-side
    const rows = await Platform_Apps.get_env_vars(app_id, key);
    const target = rows[0];

    if (!target) {
      return NextResponse.json({ error: "Variable not found" }, { status: 404 });
    }

    return NextResponse.json({ value: target.value });
  } catch (err) {
    logError("services/platform-apps/env-vars/reveal", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
