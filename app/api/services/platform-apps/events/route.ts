import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";
import { RuntimeLogsService } from "@/lib/services/runtime-logs";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";
import { 
  translateToIssues, 
  calculateSummary, 
  getActionableIssues,
  filterResolvedIssues,
} from "@/lib/services/issue-translator";

/**
 * GET /api/services/platform-apps/events?app_id=xxx
 * 
 * Get platform issues for an application.
 * 
 * IMPORTANT: This endpoint returns TRANSLATED, customer-friendly issues.
 * Raw Kubernetes events are NEVER exposed to users.
 * 
 * Issues include:
 * - "Application crashed on startup" (from CrashLoopBackOff)
 * - "Application exceeded memory limit" (from OOMKilled)
 * - "Deployment failed to start" (from ImagePullBackOff)
 * - "Health check failed" (from Unhealthy)
 * 
 * No infrastructure details (pod names, nodes, exit codes) are exposed.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    // Rate limiting
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-events",
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

    // Get events from Kubernetes (internal only)
    const rawEvents = await RuntimeLogsService.getEvents(app.name);

    // Get pods to check if app is healthy
    const pods = await RuntimeLogsService.listPods(app.name);
    const isAppHealthy = pods.length > 0 && pods.every(p => p.status === 'Running' && p.ready);
    
    // Extract success event reasons to filter resolved issues
    const successEvents = rawEvents
      .filter(e => e.type === 'Normal')
      .map(e => e.reason);

    // TRANSLATE to customer-friendly issues
    // Raw K8s events are NEVER sent to the frontend
    const allIssues = translateToIssues(rawEvents);
    
    // Filter out stale/resolved issues based on current health
    const issues = filterResolvedIssues(allIssues, isAppHealthy, successEvents);
    
    const summary = calculateSummary(issues);
    const actionableIssues = getActionableIssues(issues);

    // LAZY STATE UPDATE: Fire-and-forget status sync when critical issues are detected.
    // Using void + non-blocking update avoids concurrent request races and prevents
    // the GET response from being held up by a write.
    if (summary.hasCriticalIssues && app.status === 'running') {
      const criticalIssue = issues.find(i => i.severity === 'critical');
      if (criticalIssue) {
        void Platform_Apps.update(appId, {
          status: 'failed',
          last_failure_reason: criticalIssue.title,
        }).then(() => {
          console.log(`[Events API] 🔄 Lazy state update: ${app.name} marked as failed due to ${criticalIssue.title}`);
        }).catch((err: unknown) => {
          console.error(`[Events API] Failed lazy status update for ${app.name}:`, err);
        });
      }
    }

    return NextResponse.json({
      app_id: appId,
      app_status: summary.hasCriticalIssues ? 'failed' : app.status,
      // Customer-friendly issues only - no raw events
      issues: issues,
      // Issues that need user attention (critical + warnings)
      actionableIssues: actionableIssues.length > 0 ? actionableIssues : undefined,
      summary: summary,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    logError("services/platform-apps/events", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
