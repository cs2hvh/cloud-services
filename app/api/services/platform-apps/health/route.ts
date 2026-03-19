import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";
import { PrometheusService } from "@/lib/services/prometheus";
import { AppStatusService } from "@/lib/services/app-status";

/**
 * GET /api/services/platform-apps/health?app_id=xxx
 * Get health status for an app
 * 
 * This also syncs the app status from K8s (single source of truth)
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    // Rate limiting
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-health",
      limit: 60,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    // Get app_id from query params
    const { searchParams } = new URL(req.url);
    const appId = searchParams.get("app_id");
    const force = searchParams.get("force") === "true";

    if (!appId) {
      return NextResponse.json(
        { error: "Missing 'app_id' parameter" },
        { status: 400 }
      );
    }

    // Verify ownership
    const result = await Platform_Apps.get(appId);
    if (!result.success || !result.data) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    const app = result.data;
    if (app.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get health from Prometheus
    const health = await PrometheusService.getAppHealth(app.name);

    // Sync status from K8s to DB (single source of truth)
    // This ensures DB status matches actual K8s state
    const syncResult = await AppStatusService.syncStatus(appId, app.name, app.status as "running" | "failed" | "pending" | "building" | "stopped", force);
    
    return NextResponse.json({
      app_id: appId,
      app_name: app.name,
      status: health.status,
      db_status: syncResult.currentStatus, // The synced DB status
      status_changed: syncResult.changed,
      pods: {
        ready: health.podsReady,
        total: health.podsTotal,
      },
      restarts: health.restarts,
      message: health.message,
      timestamp: health.timestamp,
    });
  } catch (err: unknown) {
    console.error("[API] Error getting health:", err);
    const errorMessage = err instanceof Error ? err.message : "Failed to get health status";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
