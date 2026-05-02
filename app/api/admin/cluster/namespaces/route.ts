import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth/check-admin";
import { KubernetesMonitor } from "@/lib/services/kubernetes-monitor";
import { PrometheusService } from "@/lib/services/prometheus";
import { logError, sanitizeError } from "@/lib/api/error-sanitizer";

/**
 * GET /api/admin/cluster/namespaces
 * Returns namespace-level workload summaries combined with Prometheus usage metrics.
 */
export async function GET() {
  const { authorized } = await checkAdminAuth();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const [k8sSummaries, prometheusUsage] = await Promise.all([
      KubernetesMonitor.getNamespaceSummaries(),
      PrometheusService.getNamespaceUsage().catch(() => []),
    ]);

    // Merge Prometheus usage into the K8s summaries
    const usageMap = new Map(prometheusUsage.map((u) => [u.namespace, u]));

    const data = k8sSummaries.map((ns) => {
      const usage = usageMap.get(ns.name);
      return {
        ...ns,
        cpuCores: usage?.cpuCores ?? 0,
        memoryBytes: usage?.memoryBytes ?? 0,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    logError("GET /api/admin/cluster/namespaces", error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
