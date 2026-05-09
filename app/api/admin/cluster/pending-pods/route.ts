import { NextResponse } from "next/server";
import { KubernetesMonitor } from "@/lib/services/kubernetes-monitor";
import { checkAdminAuth } from "@/lib/auth/check-admin";
import { logError, sanitizeError } from "@/lib/api/error-sanitizer";

/**
 * GET /api/admin/cluster/pending-pods
 *
 * Returns all pods currently stuck in Pending phase together with the
 * scheduler reason why they cannot be placed on a node.
 *
 * This is the primary debugging tool for "can't deploy more apps"
 * issues — K8s schedules by *requests*, not actual usage, so a cluster can
 * appear lightly loaded in Prometheus while having no room for new pods.
 */
export async function GET() {
  try {
    const { authorized } = await checkAdminAuth();
    if (!authorized) {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 },
      );
    }

    const data = await KubernetesMonitor.getPendingPodReasons();
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    logError("GET /api/admin/cluster/pending-pods", error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
