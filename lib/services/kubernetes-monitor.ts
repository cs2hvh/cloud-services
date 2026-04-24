/**
 * Kubernetes Monitor Service
 *
 * Uses the Kubernetes API (via kubeConfig) to fetch deployment health,
 * cluster warning events, and namespace-level workload summaries.
 * This is the data backbone for the admin Cluster Monitor dashboard.
 */

import { CoreV1Api, AppsV1Api } from '@kubernetes/client-node';
import kubeConfig from '@/lib/kubernetes';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeploymentHealth {
  name: string;
  namespace: string;
  desiredReplicas: number;
  readyReplicas: number;
  availableReplicas: number;
  updatedReplicas: number;
  status: 'healthy' | 'degraded' | 'failing' | 'progressing' | 'unknown';
  conditions: Array<{ type: string; status: string; reason: string; message: string }>;
  createdAt: string;
}

export interface ClusterEvent {
  namespace: string;
  name: string;
  type: 'Warning' | 'Normal';
  reason: string;
  message: string;
  involvedObjectKind: string;
  involvedObjectName: string;
  count: number;
  firstTime: string;
  lastTime: string;
}

export interface NamespaceSummary {
  name: string;
  podCount: number;
  runningPods: number;
  pendingPods: number;
  failedPods: number;
  deploymentCount: number;
}

/**
 * A pending pod and the scheduler's reason it cannot be placed.
 * K8s schedules based on resource *requests*, not actual usage — so a pod can
 * be stuck Pending even when nodes show low actual utilisation.
 */
export interface PendingPodInfo {
  namespace: string;
  name: string;
  /** Human-readable scheduler message, e.g. "0/4 nodes available: 4 Insufficient memory." */
  reason: string;
  /** Seconds the pod has been stuck in Pending */
  ageSeconds: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class KubernetesMonitor {
  private static getCoreApi(): CoreV1Api {
    return kubeConfig.makeApiClient(CoreV1Api);
  }

  private static getAppsApi(): AppsV1Api {
    return kubeConfig.makeApiClient(AppsV1Api);
  }

  /**
   * List all deployments across all namespaces with health status.
   * Optionally filter to a single namespace.
   */
  static async getDeploymentHealth(namespace?: string): Promise<DeploymentHealth[]> {
    const appsApi = this.getAppsApi();

    const response = namespace
      ? await appsApi.listNamespacedDeployment({ namespace })
      : await appsApi.listDeploymentForAllNamespaces();

    const deployments = response.items ?? [];

    return deployments.map((d) => {
      const spec = d.spec;
      const status = d.status;
      const desired   = spec?.replicas ?? 0;
      const ready     = status?.readyReplicas ?? 0;
      const available = status?.availableReplicas ?? 0;
      const updated   = status?.updatedReplicas ?? 0;

      const conditions = (status?.conditions ?? []).map((c) => ({
        type: c.type ?? '',
        status: c.status ?? '',
        reason: c.reason ?? '',
        message: c.message ?? '',
      }));

      let health: DeploymentHealth['status'] = 'unknown';
      if (desired === 0) {
        health = 'unknown';
      } else if (ready === desired && available === desired) {
        health = 'healthy';
      } else if (ready > 0) {
        health = 'degraded';
      } else {
        // Check if it's actively rolling out
        const progressing = conditions.find((c) => c.type === 'Progressing' && c.status === 'True');
        health = progressing ? 'progressing' : 'failing';
      }

      return {
        name: d.metadata?.name ?? '',
        namespace: d.metadata?.namespace ?? '',
        desiredReplicas: desired,
        readyReplicas: ready,
        availableReplicas: available,
        updatedReplicas: updated,
        status: health,
        conditions,
        createdAt: d.metadata?.creationTimestamp?.toISOString() ?? '',
      };
    });
  }

  /**
   * Fetch recent Kubernetes warning events across all namespaces.
   * Returns the most recent `limit` warning events sorted newest-first.
   */
  static async getWarningEvents(limit = 50): Promise<ClusterEvent[]> {
    const coreApi = this.getCoreApi();

    const response = await coreApi.listEventForAllNamespaces({
      fieldSelector: 'type=Warning',
      limit,
    });

    const events = (response.items ?? [])
      .map((e) => ({
        namespace: e.metadata?.namespace ?? '',
        name: e.metadata?.name ?? '',
        type: (e.type ?? 'Warning') as ClusterEvent['type'],
        reason: e.reason ?? '',
        message: e.message ?? '',
        involvedObjectKind: e.involvedObject?.kind ?? '',
        involvedObjectName: e.involvedObject?.name ?? '',
        count: e.count ?? 1,
        firstTime: e.firstTimestamp?.toISOString() ?? e.eventTime?.toISOString() ?? '',
        lastTime: e.lastTimestamp?.toISOString() ?? e.eventTime?.toISOString() ?? '',
      }))
      .sort((a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime())
      .slice(0, limit);

    return events;
  }

  /**
   * Per-namespace workload summary (pod phases + deployment count).
   */
  static async getNamespaceSummaries(): Promise<NamespaceSummary[]> {
    const coreApi = this.getCoreApi();
    const appsApi = this.getAppsApi();

    const [nsResponse, podResponse, deployResponse] = await Promise.all([
      coreApi.listNamespace(),
      coreApi.listPodForAllNamespaces(),
      appsApi.listDeploymentForAllNamespaces(),
    ]);

    const namespaces = (nsResponse.items ?? []).map((n) => n.metadata?.name ?? '');
    const pods = podResponse.items ?? [];
    const deployments = deployResponse.items ?? [];

    return namespaces.map((ns) => {
      const nsPods = pods.filter((p) => p.metadata?.namespace === ns);
      const nsDeployments = deployments.filter((d) => d.metadata?.namespace === ns);

      return {
        name: ns,
        podCount: nsPods.length,
        runningPods: nsPods.filter((p) => p.status?.phase === 'Running').length,
        pendingPods: nsPods.filter((p) => p.status?.phase === 'Pending').length,
        failedPods: nsPods.filter((p) => p.status?.phase === 'Failed').length,
        deploymentCount: nsDeployments.length,
      };
    });
  }

  /**
   * List all Pending pods and the scheduler reason they cannot be placed.
   *
   * K8s schedules based on resource *requests*, not actual usage, so a pod can
   * be stuck Pending even when nodes show low real utilisation.  The
   * PodScheduled condition message contains the exact scheduler explanation,
   * e.g. "0/4 nodes available: 4 Insufficient memory."
   */
  static async getPendingPodReasons(): Promise<PendingPodInfo[]> {
    const coreApi = this.getCoreApi();

    const response = await coreApi.listPodForAllNamespaces({
      fieldSelector: 'status.phase=Pending',
      limit: 100,
    });

    const pods = response.items ?? [];

    return pods.map((pod) => {
      const conditions = pod.status?.conditions ?? [];
      const schedulingCond = conditions.find((c) => c.type === 'PodScheduled');

      // Prefer the full scheduler message; fall back to the reason code
      const reason =
        schedulingCond?.status === 'False'
          ? (schedulingCond.message ?? schedulingCond.reason ?? 'Unschedulable')
          : (pod.status?.conditions?.find((c) => c.type === 'ContainersReady')?.message ?? 'Pending');

      const createdAt = pod.metadata?.creationTimestamp;
      const ageSeconds = createdAt
        ? Math.floor((Date.now() - createdAt.getTime()) / 1000)
        : 0;

      return {
        namespace: pod.metadata?.namespace ?? '',
        name: pod.metadata?.name ?? '',
        reason,
        ageSeconds,
      };
    });
  }

  /**
   * Diagnosis helper: for a failing/degraded deployment, return the most
   * useful event messages from that namespace to surface root cause.
   */
  static async getDeploymentDiagnostics(
    namespace: string,
    deploymentName: string,
  ): Promise<{ events: ClusterEvent[]; failedPodReasons: string[] }> {
    const coreApi = this.getCoreApi();

    // Sanitise to valid K8s names (DNS subdomain: a-z0-9, hyphens, dots) before
    // embedding in a field selector to prevent selector-injection attacks.
    const safeDeploymentName = deploymentName.replace(/[^a-z0-9\-\.]/gi, "");
    const [eventsResponse, podsResponse] = await Promise.all([
      coreApi.listNamespacedEvent({
        namespace,
        fieldSelector: `involvedObject.name=${safeDeploymentName}`,
      }).catch(() => ({ items: [] })),
      coreApi.listNamespacedPod({ namespace }).catch(() => ({ items: [] })),
    ]);

    const events = ((eventsResponse as { items: unknown[] }).items ?? []).map((e: unknown) => {
      const ev = e as {
        metadata?: { namespace?: string; name?: string };
        type?: string;
        reason?: string;
        message?: string;
        involvedObject?: { kind?: string; name?: string };
        count?: number;
        firstTimestamp?: { toISOString?: () => string };
        lastTimestamp?: { toISOString?: () => string };
        eventTime?: { toISOString?: () => string };
      };
      return {
        namespace: ev.metadata?.namespace ?? '',
        name: ev.metadata?.name ?? '',
        type: (ev.type ?? 'Warning') as ClusterEvent['type'],
        reason: ev.reason ?? '',
        message: ev.message ?? '',
        involvedObjectKind: ev.involvedObject?.kind ?? '',
        involvedObjectName: ev.involvedObject?.name ?? '',
        count: ev.count ?? 1,
        firstTime: ev.firstTimestamp?.toISOString?.() ?? ev.eventTime?.toISOString?.() ?? '',
        lastTime: ev.lastTimestamp?.toISOString?.() ?? ev.eventTime?.toISOString?.() ?? '',
      };
    });

    // Find pods belonging to this deployment (by owner reference label convention)
    const pods = ((podsResponse as { items: unknown[] }).items ?? []) as Array<{
      metadata?: { name?: string; labels?: Record<string, string>; ownerReferences?: Array<{ kind?: string; name?: string }> };
      status?: { phase?: string; containerStatuses?: Array<{ state?: { waiting?: { reason?: string; message?: string }; terminated?: { reason?: string; message?: string } } }> };
    }>;

    const failedPodReasons: string[] = [];
    pods
      .filter((p) => {
        const labels = p.metadata?.labels ?? {};
        return (
          labels['app'] === deploymentName ||
          labels['app.kubernetes.io/name'] === deploymentName ||
          p.metadata?.name?.startsWith(deploymentName)
        );
      })
      .forEach((p) => {
        (p.status?.containerStatuses ?? []).forEach((cs) => {
          const reason =
            cs.state?.waiting?.reason ||
            cs.state?.terminated?.reason ||
            cs.state?.waiting?.message ||
            cs.state?.terminated?.message;
          if (reason && !failedPodReasons.includes(reason)) {
            failedPodReasons.push(reason);
          }
        });
      });

    return { events, failedPodReasons };
  }
}
