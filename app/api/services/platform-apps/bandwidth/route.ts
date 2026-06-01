import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";
import { Platform_Apps } from "@/lib/supabase/queries";
import { PlatformAppBandwidthService, syncRestrictionState } from "@/lib/services/platform-app-bandwidth";

/**
 * GET /api/services/platform-apps/bandwidth?app_id=xxx&refresh=true
 *
 * Returns current month ingress/egress usage for a deployed app. By default it
 * returns the last stored sample; pass refresh=true to query Prometheus and
 * update counters. Dashboard reads should stay non-mutating.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-bandwidth",
      limit: 30,
      windowMs: 60_000,
    });

    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const appId = searchParams.get("app_id");
    const shouldRefresh = searchParams.get("refresh") === "true";

    if (!appId) {
      return NextResponse.json(
        { error: "Missing 'app_id' parameter" },
        { status: 400 }
      );
    }

    const result = await Platform_Apps.get(appId);
    if (!result.success || !result.data) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }

    const app = result.data;
    if (app.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    let usage;
    if (shouldRefresh) {
      usage = await PlatformAppBandwidthService.refreshCurrentUsage({
        appId: app.id,
        appName: app.name,
        userId: app.user_id,
        size: app.size,
      });
      // Enforce K8s restriction state without blocking the response.
      // This makes enforcement work even without a cron — any dashboard
      // visit that triggers a refresh will apply or lift the K8s annotation.
      syncRestrictionState(app.name, usage.lifecycleStatus).catch((err) =>
        console.warn("[bandwidth] restriction sync failed:", err?.message)
      );
    } else {
      usage = PlatformAppBandwidthService.summarizeStoredUsage(
        await PlatformAppBandwidthService.getCurrentUsage(app.id),
        await PlatformAppBandwidthService.getQuotaForSize(app.size),
        { appId: app.id, userId: app.user_id }
      );
    }

    return NextResponse.json({
      app_id: app.id,
      app_name: app.name,
      size: app.size || "small",
      usage,
    });
  } catch (err: unknown) {
    logError("services/platform-apps/bandwidth", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
