import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { getPlatformAppSchema } from "@/lib/validation/platform-apps";
import { authenticateUser } from "@/lib/auth/server-auth";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";
import { logAudit } from "@/lib/api/audit-logger";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";

/**
 * POST /api/services/platform-apps/env-vars/export
 *
 * Returns a .env file for download — all values decrypted server-side.
 * The file is streamed with Content-Disposition: attachment so secrets
 * never accumulate in the frontend JS heap beyond the initial fetch().
 *
 * Deliberately strict:
 *   - 1 request per 5 minutes per user (hardest rate limit on the platform)
 *   - Full audit log on every successful export
 *   - Ownership check before touching DB
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    // 1 export per 5 minutes — intentionally restrictive
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-env-export",
      limit: 1,
      windowMs: 5 * 60_000,
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

    // Ownership check
    const existing = await Platform_Apps.get(app_id);
    if (!existing.success || !existing.data) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    if (existing.data.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const rawName = existing.data.name ?? app_id;
    // Strip characters that could inject CRLF or break the quoted filename token
    const safeFilename = rawName.replace(/[^\w\-. ]/g, '_');

    // Audit before sending — log intent, not just completion
    logAudit("env_vars_exported", { userId: auth.user!.id, appId: app_id });

    const raw = await Platform_Apps.get_env_vars(app_id);

    const lines = [
      `# ${safeFilename} — environment variables`,
      `# Exported ${new Date().toISOString()}`,
      `# Keep this file private. Do not commit to version control.`,
      "",
      ...raw.map((ev: { key: string; value: string }) => {
        const needsQuotes =
          ev.value.includes(" ") || ev.value.includes("#") ||
          ev.value.includes('"') || ev.value === "";
        if (needsQuotes) {
          // Escape backslashes first, then double-quotes, so output is valid .env
          const escaped = ev.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          return `${ev.key}="${escaped}"`;
        }
        return `${ev.key}=${ev.value}`;
      }),
    ];

    const content = lines.join("\n") + "\n";

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeFilename}.env"`,
        // Prevent caching of the secrets file
        "Cache-Control": "no-store",
        "Pragma": "no-cache",
      },
    });
  } catch (err) {
    logError("services/platform-apps/env-vars/export", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
