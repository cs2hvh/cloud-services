import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth/check-admin";
import { Platform_Apps } from "@/lib/supabase/queries";
import { KubernetesMonitor } from "@/lib/services/kubernetes-monitor";
import { PrometheusService } from "@/lib/services/prometheus";
import { logError, sanitizeError } from "@/lib/api/error-sanitizer";

// All platform apps deploy into the default namespace
const PLATFORM_NAMESPACE = "default";

export interface PlatformAppResource {
  id: string;
  name: string;
  slug: string;
  status: string;
  framework: string | null;
  size: string | null;
  deployment_url: string | null;
  ip: string | null;
  repository_url: string;
  branch: string;
  owner_email: string | null;
  owner_username: string | null;
  created_at: string | null;
  // K8s
  desiredReplicas: number;
  readyReplicas: number;
  k8sStatus: string;
  // Prometheus
  cpuCores: number;
  memoryBytes: number;
  // K8s enriched
  totalRestarts: number;
  cpuRequested: number;
  memoryRequested: number;
  cpuLimited: number;
  memoryLimited: number;
  lastRolloutTime: string | null;
  inlineDiagnosis: string;
}

export async function GET() {
  const auth = await checkAdminAuth();
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized - Admin access required" }, { status: 403 });
  }

  try {
    // Fetch everything in parallel
    const [apps, deployments, podMetrics] = await Promise.allSettled([
      Platform_Apps.get_all_for_admin(),
      KubernetesMonitor.getDeploymentHealth(PLATFORM_NAMESPACE),
      PrometheusService.getPodMetricsByNamespace(PLATFORM_NAMESPACE),
    ]);

    const appList = apps.status === "fulfilled" ? apps.value : [];
    const deploymentList = deployments.status === "fulfilled" ? deployments.value : [];
    const podMap: Map<string, { cpu: number; memory: number }> =
      podMetrics.status === "fulfilled" ? podMetrics.value : new Map();

    // Build a deployment lookup: appName -> { desired, ready, k8sStatus }
    const deploymentMap = new Map<
      string,
      {
        desiredReplicas: number;
        readyReplicas: number;
        k8sStatus: string;
        totalRestarts: number;
        cpuRequested: number;
        memoryRequested: number;
        cpuLimited: number;
        memoryLimited: number;
        lastRolloutTime: string;
        inlineDiagnosis: string;
      }
    >();
    for (const d of deploymentList) {
      // Convention: deployment name is "{appName}-app"
      if (d.name.endsWith("-app")) {
        const appName = d.name.slice(0, -4);
        deploymentMap.set(appName, {
          desiredReplicas: d.desiredReplicas,
          readyReplicas: d.readyReplicas,
          k8sStatus: d.status,
          totalRestarts: d.totalRestarts,
          cpuRequested: d.cpuRequested,
          memoryRequested: d.memoryRequested,
          cpuLimited: d.cpuLimited,
          memoryLimited: d.memoryLimited,
          lastRolloutTime: d.lastRolloutTime,
          inlineDiagnosis: d.inlineDiagnosis,
        });
      }
    }

    // Aggregate per-app CPU + memory from pod-level metrics
    // Pod names follow: "{appName}-app-{replicaSetHash}-{podHash}"
    const appCpu = new Map<string, number>();
    const appMem = new Map<string, number>();

    podMap.forEach(({ cpu, memory }, podName) => {
      for (const app of appList) {
        const prefix = `${app.name}-app-`;
        if (podName.startsWith(prefix) || podName === `${app.name}-app`) {
          appCpu.set(app.name, (appCpu.get(app.name) ?? 0) + cpu);
          appMem.set(app.name, (appMem.get(app.name) ?? 0) + memory);
          break;
        }
      }
    });

    const result: PlatformAppResource[] = appList.map((app) => {
      const k8s = deploymentMap.get(app.name);
      return {
        id: app.id,
        name: app.name,
        slug: app.slug,
        status: app.status,
        framework: app.framework,
        size: app.size,
        deployment_url: app.deployment_url,
        ip: app.ip,
        repository_url: app.repository_url,
        branch: app.branch,
        owner_email: app.owner_email,
        owner_username: app.owner_username,
        created_at: app.created_at,
        desiredReplicas: k8s?.desiredReplicas ?? 0,
        readyReplicas: k8s?.readyReplicas ?? 0,
        k8sStatus: k8s?.k8sStatus ?? "not_deployed",
        cpuCores: appCpu.get(app.name) ?? 0,
        memoryBytes: appMem.get(app.name) ?? 0,
        totalRestarts: k8s?.totalRestarts ?? 0,
        cpuRequested: k8s?.cpuRequested ?? 0,
        memoryRequested: k8s?.memoryRequested ?? 0,
        cpuLimited: k8s?.cpuLimited ?? 0,
        memoryLimited: k8s?.memoryLimited ?? 0,
        lastRolloutTime: k8s?.lastRolloutTime ?? null,
        inlineDiagnosis: k8s?.inlineDiagnosis ?? "",
      };
    });

    return NextResponse.json({
      apps: result,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    logError("GET /api/admin/cluster/platform-apps", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
