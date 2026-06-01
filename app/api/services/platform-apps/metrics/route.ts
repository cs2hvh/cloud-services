import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";
import { PrometheusService } from "@/lib/services/prometheus";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";

/**
 * GET /api/services/platform-apps/metrics?app_id=xxx
 * Get CPU and memory metrics for an app
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    // Rate limiting
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-metrics",
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

    // For non-running apps, return empty metrics with helpful message
    if (app.status !== 'running' && app.status !== 'degraded') {
      return NextResponse.json({
        app_id: appId,
        app_name: app.name,
        status: app.status,
        message: `Metrics not available - app is ${app.status}`,
        metrics: null,
      });
    }

    // Get metrics from Prometheus
    const metrics = await PrometheusService.getAppMetrics(app.name);

    return NextResponse.json({
      app_id: appId,
      app_name: app.name,
      metrics: {
        pods: metrics.pods.map(p => ({
          pod: p.pod,
          cpu: {
            cores: p.cpu,
            millicores: Math.round(p.cpu * 1000),
            display: `${Math.round(p.cpu * 1000)}m`,
          },
          memory: {
            bytes: p.memory,
            megabytes: Math.round(p.memory / 1024 / 1024),
            display: `${Math.round(p.memory / 1024 / 1024)}Mi`,
          },
          network: {
            receive_bytes_5m: Math.round(p.networkReceiveBytes ?? 0),
            transmit_bytes_5m: Math.round(p.networkTransmitBytes ?? 0),
            total_bytes_5m: Math.round((p.networkReceiveBytes ?? 0) + (p.networkTransmitBytes ?? 0)),
          },
        })),
        total: {
          cpu: {
            cores: metrics.totalCpu,
            millicores: Math.round(metrics.totalCpu * 1000),
            display: `${Math.round(metrics.totalCpu * 1000)}m`,
          },
          memory: {
            bytes: metrics.totalMemory,
            megabytes: Math.round(metrics.totalMemory / 1024 / 1024),
            display: `${Math.round(metrics.totalMemory / 1024 / 1024)}Mi`,
          },
          network: {
            receive_bytes_5m: metrics.totalNetworkReceiveBytes,
            transmit_bytes_5m: metrics.totalNetworkTransmitBytes,
            total_bytes_5m: metrics.totalNetworkReceiveBytes + metrics.totalNetworkTransmitBytes,
          },
        },
      },
      timestamp: metrics.timestamp,
    });
  } catch (err: unknown) {
    logError("services/platform-apps/metrics", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
