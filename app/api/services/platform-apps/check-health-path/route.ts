import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";

/**
 * GET /api/services/platform-apps/check-health-path?app_id=xxx
 * Checks whether the app's configured healthcheck_path is reachable.
 * Returns { configured: false } if no path is set.
 * Returns { configured: true, reachable: true/false, status: <http status> } otherwise.
 * Never throws — always returns a JSON response.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:check-health-path",
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const appId = new URL(req.url).searchParams.get("app_id");
    if (!appId) {
      return NextResponse.json({ error: "Missing 'app_id' parameter" }, { status: 400 });
    }

    const result = await Platform_Apps.get(appId);
    if (!result.success || !result.data) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    const app = result.data;
    if (app.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (!app.healthcheck_path) {
      return NextResponse.json({ configured: false });
    }

    const APP_DOMAIN = process.env.APP_DOMAIN || "galaxyhvh.com";
    const baseUrl = app.deployment_url || `https://${app.name}.${APP_DOMAIN}`;
    const path = app.healthcheck_path.startsWith("/")
      ? app.healthcheck_path
      : `/${app.healthcheck_path}`;
    const url = `${baseUrl.replace(/\/$/, "")}${path}`;

    let reachable = false;
    let httpStatus: number | null = null;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(url, { signal: controller.signal });
        httpStatus = res.status;
        reachable = res.ok;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      reachable = false;
    }

    return NextResponse.json({
      configured: true,
      path: app.healthcheck_path,
      reachable,
      status: httpStatus,
    });
  } catch (err) {
    logError("check-health-path", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
