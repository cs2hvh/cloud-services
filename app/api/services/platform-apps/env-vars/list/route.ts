import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { getPlatformAppSchema } from "@/lib/validation/platform-apps";
import { authenticateUser } from "@/lib/auth/server-auth";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";
import { logAudit } from "@/lib/api/audit-logger";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";

/** Maximum number of env var keys returned in a single response */
const ENV_VARS_MAX = 200;

/**
 * POST /api/services/platform-apps/env-vars/list
 *
 * Returns the list of env var KEYS (and whether a value exists) for an app.
 * Values are NEVER included here — they must be fetched one at a time via
 * POST /api/services/platform-apps/env-vars/reveal.
 *
 * This keeps decrypted secrets off the wire on every page load and minimises
 * the surface area exposed by a single compromised request.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    // Tighter rate limit — this endpoint is the gateway to secrets
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-env-list",
      limit: 10,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const validation = validateRequest(getPlatformAppSchema, body);
    if (!validation.success) return validation.response;

    const { app_id } = validation.data;

    // Verify ownership before returning any metadata
    const existing = await Platform_Apps.get(app_id);
    if (!existing.success || !existing.data) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    if (existing.data.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    logAudit("env_vars_list", { userId: auth.user!.id, appId: app_id });

    const raw = await Platform_Apps.get_env_vars(app_id);

    // Soft-cap: return up to ENV_VARS_MAX keys and signal when the list was truncated.
    const truncated = raw.length > ENV_VARS_MAX;
    const visible = truncated ? raw.slice(0, ENV_VARS_MAX) : raw;

    // Return keys only — values stay server-side
    const env_vars = visible.map((ev: { key: string; value: string }) => ({
      key: ev.key,
      hasValue: ev.value !== "" && ev.value != null,
    }));

    return NextResponse.json({ env_vars, truncated });
  } catch (err) {
    logError("services/platform-apps/env-vars/list", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}

