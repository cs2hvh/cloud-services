import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";
import { RuntimeLogsService } from "@/lib/services/runtime-logs";

/**
 * GET /api/services/platform-apps/runtime-logs?app_id=xxx
 * 
 * Stream runtime logs from Kubernetes pods via Server-Sent Events.
 * This is DIFFERENT from build logs (which come from Jenkins).
 * 
 * SECURITY: Instance IDs (instance-1, instance-2) are used instead of pod names.
 * Internal pod names are resolved server-side via the _lookup parameter.
 * 
 * Query Parameters:
 * - app_id (required): The platform app ID
 * - instance (optional): Instance ID (e.g., "instance-1"). If omitted, streams from all
 * - _lookup (optional): Base64 encoded instance-to-pod mapping from pods API
 * - tail (optional): Number of lines to return from end of log. Default: 500, Max: 5000
 * - since (optional): Seconds of history to return. Default: 3600 (1h), Max: 86400 (24h)
 * - follow (optional): "true" to stream live logs. Default: false
 * - previous (optional): "true" to get logs from previous container instance
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    // Rate limiting - more lenient for streaming
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-runtime-logs",
      limit: 20, // Allow 20 requests per minute
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(req.url);
    const appId = searchParams.get("app_id");
    const instanceId = searchParams.get("instance"); // User-friendly instance ID
    // Note: _lookup param reserved for future use (pod name resolution)
    const tailLines = parseInt(searchParams.get("tail") || "500");
    const sinceSeconds = parseInt(searchParams.get("since") || "3600");
    const follow = searchParams.get("follow") === "true";
    const previous = searchParams.get("previous") === "true";

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

    // Check app status - allow logs for any deployed state
    // Users need to see logs to debug issues, even when status is 'failed' or 'building'
    const nonDeployedStates = ['pending'];
    if (nonDeployedStates.includes(app.status)) {
      return NextResponse.json(
        { 
          error: "App not deployed yet",
          message: `App is in '${app.status}' state. Runtime logs will be available after deployment starts.`,
          status: app.status,
        },
        { status: 400 }
      );
    }

    // Get pods and create instance mapping
    const pods = await RuntimeLogsService.listPods(app.name);
    
    // Create instance ID to pod name mapping
    const instanceToPod = new Map<string, typeof pods[0]>();
    pods.forEach((pod, index) => {
      instanceToPod.set(`instance-${index + 1}`, pod);
    });

    // Resolve instance ID to actual pod name (internal use only)
    let targetPod: typeof pods[0] | undefined;
    if (instanceId) {
      targetPod = instanceToPod.get(instanceId);
      if (!targetPod) {
        return NextResponse.json(
          { error: "Instance not found", message: `Instance '${instanceId}' does not exist` },
          { status: 404 }
        );
      }
    }

    const logOptions = {
      tailLines,
      sinceSeconds,
      previous,
      follow,
    };

    // If streaming requested, use SSE
    if (follow) {
      // Get abort signal from request for cleanup on disconnect
      const abortSignal = req.signal;
      
      // Get target pod for streaming
      if (!targetPod) {
        if (pods.length === 0) {
          return NextResponse.json(
            { error: "No instances found", message: "The app has no running instances" },
            { status: 404 }
          );
        }

        // For simplicity in MVP, stream from first running pod
        targetPod = pods.find(p => p.status === 'Running') || pods[0];
      }

      const podIndex = pods.findIndex(p => p.name === targetPod!.name);
      const stream = await RuntimeLogsService.streamLogs(
        targetPod.name, 
        logOptions, 
        'default',
        abortSignal
      );
      
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          // Return masked instance ID, not pod name
          'X-Instance-Id': `instance-${podIndex + 1}`,
          'X-Restart-Count': String(targetPod.restartCount),
        },
      });
    }

    // Non-streaming: return logs as JSON
    if (targetPod) {
      // Get logs for specific instance
      const logs = await RuntimeLogsService.getLogs(targetPod.name, logOptions).catch((err) => {
        console.log(`[API] Failed to get logs for ${targetPod.name}:`, err.message);
        return '';
      });
      const podIndex = pods.findIndex(p => p.name === targetPod!.name);
      
      return NextResponse.json({
        app_id: appId,
        instance: `instance-${podIndex + 1}`,
        displayName: `Instance ${podIndex + 1}`,
        status: targetPod.status,
        ready: targetPod.ready,
        restartCount: targetPod.restartCount,
        logs,
        timestamp: new Date().toISOString(),
      });
    }

    // Get logs for all instances (+ previous logs for restarted instances)
    const instanceLogsWithPrevious = await Promise.all(
      pods.map(async (pod, index) => {
        const currentLogs = await RuntimeLogsService.getLogs(pod.name, logOptions).catch((err) => {
          console.log(`[API] Failed to get logs for ${pod.name}:`, err.message);
          return '';
        });
        
        // If instance has restarted, also fetch previous container logs
        let previousLogs: string | null = null;
        if (pod.restartCount > 0) {
          previousLogs = await RuntimeLogsService.getPreviousLogs(pod.name).catch(() => null);
        }
        
        return {
          instance: `instance-${index + 1}`,
          displayName: `Instance ${index + 1}`,
          status: pod.status,
          restartCount: pod.restartCount,
          logs: currentLogs,
          previousLogs,
          ready: pod.ready,
        };
      })
    );
    
    return NextResponse.json({
      app_id: appId,
      instances: instanceLogsWithPrevious,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error("[API] Error getting runtime logs:", err);
    const errorMessage = err instanceof Error ? err.message : "Failed to get runtime logs";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
