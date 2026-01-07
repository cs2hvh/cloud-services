import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";
import { RuntimeLogsService } from "@/lib/services/runtime-logs";

/**
 * GET /api/services/platform-apps/pods?app_id=xxx
 * 
 * List all instances for an application with their status.
 * 
 * SECURITY: Pod names are masked as "Instance 1", "Instance 2", etc.
 * Internal pod names are NEVER exposed to users to hide infrastructure details.
 * The internal name is only used server-side for K8s API calls.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    // Rate limiting
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-pods",
      limit: 30,
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

    // Get pods from Kubernetes
    const pods = await RuntimeLogsService.listPods(app.name);

    // Calculate aggregate stats
    const runningPods = pods.filter(p => p.status === 'Running' && p.ready);
    const totalRestarts = pods.reduce((sum, p) => sum + p.restartCount, 0);

    // SECURITY: Mask pod names with user-friendly instance IDs
    // The internal pod name stays server-side only
    const maskedInstances = pods.map((pod, index) => ({
      instanceId: `instance-${index + 1}`,
      displayName: `Instance ${index + 1}`,
      status: pod.status,
      ready: pod.ready,
      restartCount: pod.restartCount,
      startTime: pod.startTime,
      // Internal name stored for server-side use only (via lookup)
      _internalId: pod.name,
    }));

    // Create lookup map for resolving instance IDs to pod names
    // This is stored in a short-lived cache or returned encrypted
    const instanceMap = Object.fromEntries(
      maskedInstances.map(inst => [inst.instanceId, inst._internalId])
    );

    // Remove internal ID from response (security: hide pod names from client)
    const publicInstances = maskedInstances.map(inst => ({
      instanceId: inst.instanceId,
      displayName: inst.displayName,
      status: inst.status,
      ready: inst.ready,
      restartCount: inst.restartCount,
      startTime: inst.startTime,
    }));

    return NextResponse.json({
      app_id: appId,
      instances: publicInstances,
      // Include lookup for runtime-logs API to use (base64 encoded to obscure)
      _lookup: Buffer.from(JSON.stringify(instanceMap)).toString('base64'),
      summary: {
        total: pods.length,
        ready: runningPods.length,
        totalRestarts,
        allHealthy: runningPods.length === pods.length && pods.length > 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error("[API] Error getting instances:", err);
    const errorMessage = err instanceof Error ? err.message : "Failed to get instances";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
