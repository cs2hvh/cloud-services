import { NextResponse } from "next/server";
import { PrometheusService, ClusterMetrics } from "@/lib/services/prometheus";
import { checkAdminAuth } from "@/lib/auth/check-admin";
import { logError, sanitizeError } from "@/lib/api/error-sanitizer";

export async function GET() {
  try {
    const { authorized } = await checkAdminAuth();
    if (!authorized) {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 },
      );
    }

    const metrics: ClusterMetrics = await PrometheusService.getClusterMetrics();

    return NextResponse.json({ success: true, data: metrics });
  } catch (error: unknown) {
    logError("GET /api/admin/cluster-metrics", error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
