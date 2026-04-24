import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth/check-admin";
import { KubernetesMonitor } from "@/lib/services/kubernetes-monitor";
import { logError, sanitizeError } from "@/lib/api/error-sanitizer";

/**
 * GET /api/admin/cluster/events
 * Returns recent Kubernetes warning events.
 * Optional query param: ?limit=50
 */
export async function GET(req: NextRequest) {
  const { authorized } = await checkAdminAuth();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200);

    const data = await KubernetesMonitor.getWarningEvents(limit);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    logError("GET /api/admin/cluster/events", error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
