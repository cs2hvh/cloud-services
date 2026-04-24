/**
 * Kubernetes Monitor Service
 *
 * Uses the Kubernetes API (via kubeConfig) to fetch deployment health,
 * cluster warning events, and namespace-level workload summaries.
 * This is the data backbone for the admin Cluster Monitor dashboard.
 */

import { CoreV1Api, AppsV1Api } from '@kubernetes/client-node';
import kubeConfig from '@/lib/kubernetes';

// ─── K8s quantity parsers ────────────────────────────────────────────────────

function parseCpuQuantity(cpu: string): number {
  if (!cpu) return 0;
  if (cpu.endsWith('m')) return parseFloat(cpu) / 1000;
  if (cpu.endsWith('n')) return parseFloat(cpu) / 1e9;
  return parseFloat(cpu) || 0;
}

function parseMemoryQuantity(mem: string): number {
  if (!mem) return 0;
  const units: [string, number][] = [
    ['Ki', 1024], ['Mi', 1024 ** 2], ['Gi', 1024 ** 3], ['Ti', 1024 ** 4],
    ['K', 1000],  ['M', 1000 ** 2],  ['G', 1000 ** 3],  ['T', 1000 ** 4],
  ];
  for (const [suffix, mult] of units) {
    if (mem.endsWith(suffix)) return parseFloat(mem) * mult;
  }
  return parseFloat(mem) || 0;
}

// ─── Inline diagnosis helpers ─────────────────────────────────────────────────

function normaliseReason(r: string): string {
  const map: Record<string, string> = {
    CrashLoopBackOff:          'CrashLoopBackOff',
    OOMKilled:                 'OOMKilled',
    ImagePullBackOff:          'Image pull failed',
    ErrImagePull:              'Image pull failed',
    CreateContainerConfigError:'Config error',
    CreateContainerError:      'Container create failed',
    RunContainerError:         'Container run failed',
    InvalidImageName:          'Invalid image name',
    RegistryUnavailable:       'Registry unavailable',
  };
  return map[r] ?? r;
}

type PodLike = {
  status?: {
    phase?: string;
    containerStatuses?: Array<{ state?: { waiting?: { reason?: string }; terminated?: { reason?: string } } }>;
    conditions?: Array<{ type?: string; status?: string; message?: string }>;
  };
};

function buildInlineDiagnosis(
  pods: PodLike[],
  health: 'healthy' | 'degraded' | 'failing' | 'progressing' | 'unknown',
  ready: number,
  desired: number,
  updated: number,
  totalRestarts: number,
): string {
  if (health === 'healthy' || health === 'unknown' || health === 'progressing') return '';

  const reasons = new Set<string>();

  for (const pod of pods) {
    for (const cs of (pod.status?.containerStatuses ?? [])) {
      const wr = cs.state?.waiting?.reason;
      if (wr) reasons.add(normaliseReason(wr));
      const tr = cs.state?.terminated?.reason;
      if (tr && tr !== 'Completed') reasons.add(normaliseReason(tr));
    }
    if (pod.status?.phase === 'Pending') {
      const sc = (pod.status?.conditions ?? []).find((c) => c.type === 'PodScheduled');
      if (sc?.status === 'False') {
        const msg = sc.message ?? '';
        if (msg.includes('Insufficient cpu'))    reasons.add('Insufficient CPU');
        else if (msg.includes('Insufficient memory')) reasons.add('Insufficient memory');
        else if (msg.includes('Insufficient')) {
          const m = msg.match(/Insufficient (\w+)/);
          reasons.add(m ? `Insufficient ${m[1]}` : 'Unschedulable');
        } else reasons.add('Unschedulable');
      }
    }
  }

  if (reasons.size > 0) {
    let msg = Array.from(reasons).slice(0, 2).join(', ');
    if (totalRestarts > 0) msg += ` \u2014 ${totalRestarts} restart${totalRestarts !== 1 ? 's' : ''}`;
    return msg;
  }

  const parts: string[] = [];
  if (ready   < desired) parts.push(`${ready}/${desired} ready`);
  if (updated < desired) parts.push(`${updated}/${desired} updated`);
  return parts.join(' \u00b7 ');
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeploymentHealth {
  name: string;
  namespace: string;
  desiredReplicas: number;
  readyReplicas: number;
  availableReplicas: number;
  updatedReplicas: number;
  status: 'healthy' | 'degraded' | 'failing' | 'progressing' | 'unknown';
  conditions: Array<{ type: string; status: string; reason: string; message: string; lastTransitionTime: string }>;
  createdAt: string;
  /** Sum of container restart counts across all pods (from K8s API container statuses) */
  totalRestarts: number;
  /** Sum of CPU requests (cores) across running/pending pods */
  cpuRequested: number;
  /** Sum of memory requests (bytes) across running/pending pods */
  memoryRequested: number;
  /** ISO timestamp of last rollout — from Progressing condition lastTransitionTime */
  lastRolloutTime: string;
  /** Pre-computed human-readable failure reason (empty when healthy or progressing) */
  inlineDiagnosis: string;
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
    const coreApi = this.getCoreApi();

    // Fetch deployments + pods in parallel — pods are needed to compute
    // restart counts, resource requests, and inline diagnosis without a
    // separate per-deployment API call.
    const [deployResponse, podResponse] = await Promise.all([
      namespace
        ? appsApi.listNamespacedDeployment({ namespace })
        : appsApi.listDeploymentForAllNamespaces(),
      namespace
        ? coreApi.listNamespacedPod({ namespace })
        : coreApi.listPodForAllNamespaces(),
    ]);

    const deployments = deployResponse.items ?? [];
    const allPods     = podResponse.items ?? [];

    return deployments.map((d) => {
      const spec   = d.spec;
      const status = d.status;
      const desired   = spec?.replicas ?? 0;
      const ready     = status?.readyReplicas ?? 0;
      const available = status?.availableReplicas ?? 0;
      const updated   = status?.updatedReplicas ?? 0;
      const dName     = d.metadata?.name ?? '';
      const dNs       = d.metadata?.namespace ?? '';

      const conditions = (status?.conditions ?? []).map((c) => ({
        type:               c.type ?? '',
        status:             c.status ?? '',
        reason:             c.reason ?? '',
        message:            c.message ?? '',
        lastTransitionTime: c.lastTransitionTime?.toISOString() ?? '',
      }));

      let health: DeploymentHealth['status'] = 'unknown';
      if (desired === 0) {
        health = 'unknown';
      } else if (ready === desired && available === desired) {
        health = 'healthy';
      } else if (ready > 0) {
        health = 'degraded';
      } else {
        const progressing = conditions.find((c) => c.type === 'Progressing' && c.status === 'True');
        health = progressing ? 'progressing' : 'failing';
      }

      // Last rollout: prefer Progressing condition lastTransitionTime
      const progressingCond = conditions.find((c) => c.type === 'Progressing');
      const lastRolloutTime = progressingCond?.lastTransitionTime
        ?? d.metadata?.creationTimestamp?.toISOString()
        ?? '';

      // Match pods to this deployment via selector labels
      const selectorLabels = d.spec?.selector?.matchLabels ?? {};
      const deployPods = allPods.filter((p) => {
        if (p.metadata?.namespace !== dNs) return false;
        const podLabels = p.metadata?.labels ?? {};
        return Object.entries(selectorLabels).every(([k, v]) => podLabels[k] === v);
      });

      // Restart count from container statuses across all pods
      let totalRestarts = 0;
      deployPods.forEach((p) => {
        (p.status?.containerStatuses ?? []).forEach((cs) => {
          totalRestarts += cs.restartCount ?? 0;
        });
      });

      // CPU + memory requests from running/pending pods (what K8s uses for scheduling)
      let cpuRequested    = 0;
      let memoryRequested = 0;
      deployPods
        .filter((p) => p.status?.phase === 'Running' || p.status?.phase === 'Pending')
        .forEach((p) => {
          (p.spec?.containers ?? []).forEach((c) => {
            if (c.resources?.requests?.cpu)
              cpuRequested    += parseCpuQuantity(c.resources.requests.cpu);
            if (c.resources?.requests?.memory)
              memoryRequested += parseMemoryQuantity(c.resources.requests.memory);
          });
        });

      const inlineDiagnosis = buildInlineDiagnosis(
        deployPods, health, ready, desired, updated, totalRestarts,
      );

      return {
        name:             dName,
        namespace:        dNs,
        desiredReplicas:  desired,
        readyReplicas:    ready,
        availableReplicas: available,
        updatedReplicas:  updated,
        status:           health,
        conditions,
        createdAt:        d.metadata?.creationTimestamp?.toISOString() ?? '',
        totalRestarts,
        cpuRequested,
        memoryRequested,
        lastRolloutTime,
        inlineDiagnosis,
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
