/**
 * Prometheus Service - Handles metrics queries from Prometheus
 * 
 * Uses Kubernetes API to proxy requests to Prometheus running inside the cluster.
 * This avoids exposing Prometheus externally and uses existing KUBE_CONFIG_STRING.
 */

import kubeConfig from '@/lib/kubernetes';
import { CoreV1Api, AppsV1Api } from '@kubernetes/client-node';
import https from 'https';
import http from 'http';

// ── K8s quantity parsers ─────────────────────────────────────────────────────
// Pod specs express CPU as "100m" (millicores) or "0.5" (cores).
// Memory is "128Mi", "1Gi", etc.  Parse to SI base units for arithmetic.

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

// Prometheus service details inside the cluster
const PROMETHEUS_NAMESPACE = 'monitoring';
const PROMETHEUS_SERVICE = 'prometheus-kube-prometheus-prometheus';
const PROMETHEUS_PORT = 9090;

/**
 * Sanitise a user-supplied string before embedding it in a PromQL label selector.
 * PromQL regex selectors are RE2 expressions. The following characters are meaningful
 * inside a RE2 expression or break the surrounding PromQL syntax:
 *   } closes the label block
 *   " closes the string value
 *   \ starts an escape sequence
 *   .+*?^$[]()| are RE2 metacharacters
 * We also strip newlines and null bytes to prevent log injection.
 * App names in this system are kebab-case slugs so this will never fire in normal
 * use — it is purely a defence-in-depth guard.
 */
function sanitizePromqlLabelValue(value: string): string {
  // Strip any character that is not alphanumeric, hyphen, or underscore.
  // App names are slugs (e.g. "my-app"), so this is safe and non-destructive.
  return value.replace(/[^a-zA-Z0-9\-_]/g, '');
}

export interface PodMetrics {
  pod: string;
  cpu: number;      // CPU usage in cores (e.g., 0.5 = 500m)
  memory: number;   // Memory in bytes
  networkReceiveBytes?: number;
  networkTransmitBytes?: number;
}

export interface AppMetrics {
  appName: string;
  pods: PodMetrics[];
  totalCpu: number;
  totalMemory: number;
  totalNetworkReceiveBytes: number;
  totalNetworkTransmitBytes: number;
  timestamp: string;
}

export interface AppNetworkUsage {
  appName: string;
  ingressBytes: number;
  egressBytes: number;
  totalBytes: number;
  windowSeconds: number;
  timestamp: string;
}

export interface AppHealth {
  appName: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  podsReady: number;
  podsTotal: number;
  restarts: number;
  message: string;
  timestamp: string;
}

// Prometheus query result format
interface PrometheusResult {
  metric: Record<string, string>;
  value: [number, string];
}

export class PrometheusService {
  /**
   * Query Prometheus via K8s API service proxy
   * Path: /api/v1/namespaces/{ns}/services/{svc}:{port}/proxy/{path}
   */
  private static async query(promql: string): Promise<PrometheusResult[]> {
    try {
      const cluster = kubeConfig.getCurrentCluster();
      if (!cluster) {
        throw new Error('Kubernetes cluster not configured');
      }

      // Build the proxy URL
      const proxyPath = `/api/v1/namespaces/${PROMETHEUS_NAMESPACE}/services/${PROMETHEUS_SERVICE}:${PROMETHEUS_PORT}/proxy/api/v1/query?query=${encodeURIComponent(promql)}`;
      const url = new URL(proxyPath, cluster.server);

      // Create request options with K8s auth
      const opts: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      };

      // Apply kubeconfig auth (token, certs, etc.)
      await kubeConfig.applyToHTTPSOptions(opts);

      // Make the request
      const data = await new Promise<string>((resolve, reject) => {
        const reqLib = url.protocol === 'https:' ? https : http;
        const req = reqLib.request(opts, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(body);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${body}`));
            }
          });
        });
        req.on('error', reject);
        req.end();
      });

      const result = JSON.parse(data);
      
      if (result.status !== 'success') {
        throw new Error(`Prometheus error: ${result.error || 'Unknown error'}`);
      }

      return result.data.result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[PrometheusService] Query failed:`, errorMessage);
      throw error;
    }
  }

  /**
   * Get CPU usage for an app's pods
   * Returns CPU in cores (e.g., 0.5 = 500m = 50% of 1 core)
   */
  static async getCpuUsage(appName: string): Promise<{ pod: string; cpu: number }[]> {
    const deploymentName = `${sanitizePromqlLabelValue(appName)}-app`;
    
    // CPU usage rate over 5 minutes, grouped by pod
    const promql = `sum(rate(container_cpu_usage_seconds_total{pod=~"${deploymentName}.*",container!="POD",container!=""}[5m])) by (pod)`;
    
    const result = await this.query(promql);
    
    return result.map((item: PrometheusResult) => ({
      pod: item.metric.pod,
      cpu: parseFloat(item.value[1]) || 0,
    }));
  }

  /**
   * Get memory usage for an app's pods
   * Returns memory in bytes
   */
  static async getMemoryUsage(appName: string): Promise<{ pod: string; memory: number }[]> {
    const deploymentName = `${sanitizePromqlLabelValue(appName)}-app`;
    
    // Current memory usage, grouped by pod
    const promql = `sum(container_memory_working_set_bytes{pod=~"${deploymentName}.*",container!="POD",container!=""}) by (pod)`;
    
    const result = await this.query(promql);
    
    return result.map((item: PrometheusResult) => ({
      pod: item.metric.pod,
      memory: parseFloat(item.value[1]) || 0,
    }));
  }

  /**
   * Get network receive/transmit byte increases for app pods over a window.
   *
   * receive = ingress into the pod. transmit = egress from the pod.
   * This counts all pod network traffic, including traffic to third-party
   * services, so it is suitable as the platform-app bandwidth meter.
   */
  static async getNetworkUsageByPod(
    appName: string,
    windowSeconds = 300
  ): Promise<{ pod: string; receiveBytes: number; transmitBytes: number }[]> {
    const deploymentName = `${sanitizePromqlLabelValue(appName)}-app`;
    const seconds = Math.max(Math.trunc(windowSeconds), 60);

    const receiveQuery =
      `sum(increase(container_network_receive_bytes_total{pod=~"${deploymentName}.*"}[${seconds}s])) by (pod)`;
    const transmitQuery =
      `sum(increase(container_network_transmit_bytes_total{pod=~"${deploymentName}.*"}[${seconds}s])) by (pod)`;

    const [receiveData, transmitData] = await Promise.all([
      this.query(receiveQuery).catch(() => []),
      this.query(transmitQuery).catch(() => []),
    ]);

    const podMap = new Map<string, { pod: string; receiveBytes: number; transmitBytes: number }>();

    receiveData.forEach((item: PrometheusResult) => {
      const pod = item.metric.pod;
      if (!pod) return;
      podMap.set(pod, {
        pod,
        receiveBytes: Math.max(parseFloat(item.value[1]) || 0, 0),
        transmitBytes: 0,
      });
    });

    transmitData.forEach((item: PrometheusResult) => {
      const pod = item.metric.pod;
      if (!pod) return;
      const existing = podMap.get(pod);
      if (existing) {
        existing.transmitBytes = Math.max(parseFloat(item.value[1]) || 0, 0);
      } else {
        podMap.set(pod, {
          pod,
          receiveBytes: 0,
          transmitBytes: Math.max(parseFloat(item.value[1]) || 0, 0),
        });
      }
    });

    return Array.from(podMap.values());
  }

  /**
   * Get absolute cumulative network byte counter values for app pods.
   *
   * These are monotonically increasing counters that reset to 0 on pod restart.
   * Use this for delta-based monthly accumulation: compute (current - last) per pod
   * at each sync interval, handling resets by treating current as the delta when
   * current < last. This is correct across Prometheus retention boundaries because
   * we accumulate in the database rather than querying a long window.
   */
  static async getAppNetworkCounters(appName: string): Promise<{
    pod: string;
    receiveBytes: number;
    transmitBytes: number;
  }[]> {
    const deploymentName = `${sanitizePromqlLabelValue(appName)}-app`;

    const receiveQuery =
      `sum(container_network_receive_bytes_total{pod=~"${deploymentName}.*"}) by (pod)`;
    const transmitQuery =
      `sum(container_network_transmit_bytes_total{pod=~"${deploymentName}.*"}) by (pod)`;

    const [receiveData, transmitData] = await Promise.all([
      this.query(receiveQuery).catch(() => []),
      this.query(transmitQuery).catch(() => []),
    ]);

    const podMap = new Map<string, { pod: string; receiveBytes: number; transmitBytes: number }>();

    receiveData.forEach((item: PrometheusResult) => {
      const pod = item.metric.pod;
      if (!pod) return;
      podMap.set(pod, {
        pod,
        receiveBytes: Math.max(parseFloat(item.value[1]) || 0, 0),
        transmitBytes: 0,
      });
    });

    transmitData.forEach((item: PrometheusResult) => {
      const pod = item.metric.pod;
      if (!pod) return;
      const existing = podMap.get(pod);
      if (existing) {
        existing.transmitBytes = Math.max(parseFloat(item.value[1]) || 0, 0);
      } else {
        podMap.set(pod, {
          pod,
          receiveBytes: 0,
          transmitBytes: Math.max(parseFloat(item.value[1]) || 0, 0),
        });
      }
    });

    return Array.from(podMap.values());
  }

  /**
   * Get HTTP-layer request/response bytes from NGINX ingress controller metrics.
   *
   * These are absolute cumulative counters scoped to the named ingress resource.
   * They measure traffic at the HTTP edge (after TLS termination), which is more
   * accurate for billing than pod-level network bytes that include internal cluster
   * traffic. Returns { requestBytes, responseBytes } as counters since ingress creation.
   */
  static async getIngressHttpCounters(
    ingressName: string,
    namespace = 'default'
  ): Promise<{ requestBytes: number; responseBytes: number }> {
    const safeIngress = sanitizePromqlLabelValue(ingressName);
    const safeNs = sanitizePromqlLabelValue(namespace);

    // nginx_ingress_controller_request_size_sum / response_size_sum are emitted by
    // the NGINX Ingress Controller when the prometheus metrics port is enabled.
    const requestQuery =
      `sum(nginx_ingress_controller_request_size_sum{ingress="${safeIngress}",namespace="${safeNs}"})`;
    const responseQuery =
      `sum(nginx_ingress_controller_response_size_sum{ingress="${safeIngress}",namespace="${safeNs}"})`;

    const [requestResult, responseResult] = await Promise.all([
      this.query(requestQuery).catch(() => []),
      this.query(responseQuery).catch(() => []),
    ]);

    return {
      requestBytes: requestResult.length > 0
        ? Math.max(parseFloat(requestResult[0].value[1]) || 0, 0)
        : 0,
      responseBytes: responseResult.length > 0
        ? Math.max(parseFloat(responseResult[0].value[1]) || 0, 0)
        : 0,
    };
  }

  /**
   * Get aggregate app network usage over a window.
   */
  static async getAppNetworkUsage(appName: string, windowSeconds: number): Promise<AppNetworkUsage> {
    const pods = await this.getNetworkUsageByPod(appName, windowSeconds);
    const ingressBytes = Math.round(pods.reduce((sum, p) => sum + p.receiveBytes, 0));
    const egressBytes = Math.round(pods.reduce((sum, p) => sum + p.transmitBytes, 0));

    return {
      appName,
      ingressBytes,
      egressBytes,
      totalBytes: ingressBytes + egressBytes,
      windowSeconds: Math.max(Math.trunc(windowSeconds), 60),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get restart count for an app's pods
   */
  static async getRestartCount(appName: string): Promise<number> {
    const deploymentName = `${sanitizePromqlLabelValue(appName)}-app`;
    
    const promql = `sum(kube_pod_container_status_restarts_total{pod=~"${deploymentName}.*"})`;
    
    try {
      const result = await this.query(promql);
      if (result.length === 0) return 0;
      return parseInt(result[0].value[1]) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Get pod ready status
   */
  static async getPodStatus(appName: string): Promise<{ ready: number; total: number }> {
    const deploymentName = `${sanitizePromqlLabelValue(appName)}-app`;
    
    // Ready pods
    const readyQuery = `sum(kube_pod_status_ready{pod=~"${deploymentName}.*",condition="true"})`;
    // Total pods
    const totalQuery = `count(kube_pod_info{pod=~"${deploymentName}.*"})`;
    
    try {
      const [readyResult, totalResult] = await Promise.all([
        this.query(readyQuery).catch(() => []),
        this.query(totalQuery).catch(() => []),
      ]);
      
      return {
        ready: readyResult.length > 0 ? parseInt(readyResult[0].value[1]) || 0 : 0,
        total: totalResult.length > 0 ? parseInt(totalResult[0].value[1]) || 0 : 0,
      };
    } catch {
      return { ready: 0, total: 0 };
    }
  }

  /**
   * Get full metrics for an app
   */
  static async getAppMetrics(appName: string): Promise<AppMetrics> {
    const [cpuData, memoryData, networkData] = await Promise.all([
      this.getCpuUsage(appName).catch(() => []),
      this.getMemoryUsage(appName).catch(() => []),
      this.getNetworkUsageByPod(appName, 300).catch(() => []),
    ]);

    // Combine CPU and memory data by pod
    const podMap = new Map<string, PodMetrics>();
    
    cpuData.forEach(({ pod, cpu }) => {
      podMap.set(pod, { pod, cpu, memory: 0 });
    });
    
    memoryData.forEach(({ pod, memory }) => {
      const existing = podMap.get(pod);
      if (existing) {
        existing.memory = memory;
      } else {
        podMap.set(pod, { pod, cpu: 0, memory });
      }
    });

    networkData.forEach(({ pod, receiveBytes, transmitBytes }) => {
      const existing = podMap.get(pod);
      if (existing) {
        existing.networkReceiveBytes = receiveBytes;
        existing.networkTransmitBytes = transmitBytes;
      } else {
        podMap.set(pod, {
          pod,
          cpu: 0,
          memory: 0,
          networkReceiveBytes: receiveBytes,
          networkTransmitBytes: transmitBytes,
        });
      }
    });

    const pods = Array.from(podMap.values());
    
    return {
      appName,
      pods,
      totalCpu: pods.reduce((sum, p) => sum + p.cpu, 0),
      totalMemory: pods.reduce((sum, p) => sum + p.memory, 0),
      totalNetworkReceiveBytes: Math.round(pods.reduce((sum, p) => sum + (p.networkReceiveBytes ?? 0), 0)),
      totalNetworkTransmitBytes: Math.round(pods.reduce((sum, p) => sum + (p.networkTransmitBytes ?? 0), 0)),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get health status for an app
   */
  static async getAppHealth(appName: string): Promise<AppHealth> {
    const [podStatus, restarts] = await Promise.all([
      this.getPodStatus(appName),
      this.getRestartCount(appName),
    ]);

    let status: AppHealth['status'] = 'unknown';
    let message = '';

    if (podStatus.total === 0) {
      status = 'unknown';
      message = 'No pods found';
    } else if (podStatus.ready === podStatus.total) {
      status = 'healthy';
      message = `All ${podStatus.total} pod(s) running`;
    } else if (podStatus.ready > 0) {
      status = 'degraded';
      message = `${podStatus.ready}/${podStatus.total} pods ready`;
    } else {
      status = 'unhealthy';
      message = 'No pods ready';
    }

    // Add restart warning
    if (restarts > 5) {
      message += ` (${restarts} restarts)`;
      if (status === 'healthy') status = 'degraded';
    }

    return {
      appName,
      status,
      podsReady: podStatus.ready,
      podsTotal: podStatus.total,
      restarts,
      message,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Check if Prometheus is reachable via K8s API
   */
  static async healthCheck(): Promise<boolean> {
    try {
      // Simple check - try a basic query
      await this.query('up{job="prometheus"}');
      return true;
    } catch {
      return false;
    }
  }

  // ============================================
  // Cluster-wide metrics (for Admin dashboard)
  // ============================================

  /**
   * Get cluster-wide CPU usage
   * Returns: { used: cores, total: cores, percentage: 0-100 }
   */
  static async getClusterCpuUsage(): Promise<{ used: number; total: number; percentage: number }> {
    try {
      // Total CPU capacity across all nodes (in cores)
      const totalQuery = `sum(kube_node_status_allocatable{resource="cpu"})`;
      // Current CPU usage across all nodes (in cores)
      const usedQuery = `sum(rate(container_cpu_usage_seconds_total{container!="POD",container!=""}[5m]))`;

      const [totalResult, usedResult] = await Promise.all([
        this.query(totalQuery).catch(() => []),
        this.query(usedQuery).catch(() => []),
      ]);

      const total = totalResult.length > 0 ? parseFloat(totalResult[0].value[1]) || 0 : 0;
      const used = usedResult.length > 0 ? parseFloat(usedResult[0].value[1]) || 0 : 0;
      const percentage = total > 0 ? Math.round((used / total) * 100) : 0;

      return { used, total, percentage };
    } catch {
      return { used: 0, total: 0, percentage: 0 };
    }
  }

  /**
   * Get cluster-wide memory usage
   * Returns: { used: bytes, total: bytes, percentage: 0-100 }
   */
  static async getClusterMemoryUsage(): Promise<{ used: number; total: number; percentage: number }> {
    try {
      // Total memory capacity across all nodes (in bytes)
      const totalQuery = `sum(kube_node_status_allocatable{resource="memory"})`;
      // Current memory usage across all nodes (in bytes)
      const usedQuery = `sum(container_memory_working_set_bytes{container!="POD",container!=""})`;

      const [totalResult, usedResult] = await Promise.all([
        this.query(totalQuery).catch(() => []),
        this.query(usedQuery).catch(() => []),
      ]);

      const total = totalResult.length > 0 ? parseFloat(totalResult[0].value[1]) || 0 : 0;
      const used = usedResult.length > 0 ? parseFloat(usedResult[0].value[1]) || 0 : 0;
      const percentage = total > 0 ? Math.round((used / total) * 100) : 0;

      return { used, total, percentage };
    } catch {
      return { used: 0, total: 0, percentage: 0 };
    }
  }

  /**
   * Get total running pods in cluster — uses K8s API (no Prometheus lag/metric-naming bugs).
   */
  static async getClusterPodCount(): Promise<{ running: number; total: number }> {
    try {
      const coreApi = kubeConfig.makeApiClient(CoreV1Api);
      const response = await coreApi.listPodForAllNamespaces();
      const items = response.items ?? [];
      return {
        running: items.filter((p) => p.status?.phase === 'Running').length,
        total: items.length,
      };
    } catch {
      return { running: 0, total: 0 };
    }
  }

  /**
   * Get per-node metrics.
   *
   * Data sources:
   *  • K8s API  — node capacity/allocatable, ready condition, internal IP, pod requests
   *  • Prometheus — actual CPU/memory usage (cAdvisor rate queries)
   *  • Prometheus — disk usage (node_exporter, matched via internal IP)
   *
   * Pod resource requests come from pod specs (the K8s API), NOT from
   * kube-state-metrics, which can lag and return incorrect counts.
   */
  static async getClusterNodes(): Promise<NodeMetrics[]> {
    try {
      const coreApi = kubeConfig.makeApiClient(CoreV1Api);

      const cpuUsedQuery = `sum(rate(container_cpu_usage_seconds_total{container!="POD",container!=""}[5m])) by (node)`;
      const memUsedQuery = `sum(container_memory_working_set_bytes{container!="POD",container!=""}) by (node)`;

      // Fetch K8s node list, all pods, Prometheus actual usage, and disk data in parallel
      const [nodesResp, podsResp, cpuUsedResult, memUsedResult, diskData] = await Promise.all([
        coreApi.listNode().catch(() => ({ items: [] })),
        coreApi.listPodForAllNamespaces().catch(() => ({ items: [] })),
        this.query(cpuUsedQuery).catch(() => [] as PrometheusResult[]),
        this.query(memUsedQuery).catch(() => [] as PrometheusResult[]),
        this.getNodeDiskUsage().catch(() => [] as { node: string; used: number; total: number; percentage: number }[]),
      ]);

      const k8sNodes = nodesResp.items ?? [];

      // ── Per-node requested resources, limits + pod count from pod specs ────
      // K8s uses requests (not actual usage) for scheduling decisions.
      // Reading from pod specs is always accurate — no kube-state-metrics lag.
      const nodeRequestsMap = new Map<string, { cpu: number; memory: number }>();
      const nodeLimitsMap   = new Map<string, { cpu: number; memory: number }>();
      const nodePodCountMap = new Map<string, number>();
      (podsResp.items ?? [])
        .filter((p) => p.status?.phase === 'Running' || p.status?.phase === 'Pending')
        .forEach((pod) => {
          const nodeName = pod.spec?.nodeName;
          if (!nodeName) return;
          // Pod count per node
          nodePodCountMap.set(nodeName, (nodePodCountMap.get(nodeName) ?? 0) + 1);
          // Resource requests per node
          const reqEntry = nodeRequestsMap.get(nodeName) || { cpu: 0, memory: 0 };
          const limEntry = nodeLimitsMap.get(nodeName)   || { cpu: 0, memory: 0 };
          (pod.spec?.containers ?? []).forEach((c) => {
            if (c.resources?.requests?.cpu)
              reqEntry.cpu += parseCpuQuantity(c.resources.requests.cpu);
            if (c.resources?.requests?.memory)
              reqEntry.memory += parseMemoryQuantity(c.resources.requests.memory);
            if (c.resources?.limits?.cpu)
              limEntry.cpu += parseCpuQuantity(c.resources.limits.cpu);
            if (c.resources?.limits?.memory)
              limEntry.memory += parseMemoryQuantity(c.resources.limits.memory);
          });
          nodeRequestsMap.set(nodeName, reqEntry);
          nodeLimitsMap.set(nodeName, limEntry);
        });

      // ── Actual CPU/memory usage from Prometheus (cAdvisor) ──────────────
      const cpuActualMap = new Map<string, number>();
      cpuUsedResult.forEach((r) => cpuActualMap.set(r.metric.node, parseFloat(r.value[1]) || 0));

      const memActualMap = new Map<string, number>();
      memUsedResult.forEach((r) => memActualMap.set(r.metric.node, parseFloat(r.value[1]) || 0));

      // ── Disk: node_exporter labels nodes by InternalIP, not hostname ─────
      // Build IP → disk entry map so we can look up by node's InternalIP.
      const diskByIP = new Map<string, typeof diskData[0]>();
      diskData.forEach((d) => diskByIP.set(d.node, d));

      return k8sNodes.map((node) => {
        const name = node.metadata?.name ?? '';

        // Node ready status from conditions
        const readyCond = (node.status?.conditions ?? []).find((c) => c.type === 'Ready');
        const status = readyCond?.status === 'True' ? 'Ready' : 'NotReady';

        // Capacity from K8s API.
        // allocatable = what pods can use (OS + kubelet reserve some)
        // capacity    = raw hardware total
        const cpuTotal = parseCpuQuantity(
          node.status?.allocatable?.cpu ?? node.status?.capacity?.cpu ?? '0',
        );
        const memoryTotal = parseMemoryQuantity(
          node.status?.allocatable?.memory ?? node.status?.capacity?.memory ?? '0',
        );
        const cpuCapacity = parseCpuQuantity(node.status?.capacity?.cpu ?? '0');
        const memoryCapacity = parseMemoryQuantity(node.status?.capacity?.memory ?? '0');

        // Requested + limits — sum of pod resource specs on this node (from pod specs)
        const requested = nodeRequestsMap.get(name) || { cpu: 0, memory: 0 };
        const limits    = nodeLimitsMap.get(name)   || { cpu: 0, memory: 0 };

        // Actual usage from Prometheus cAdvisor
        const cpuUsed = cpuActualMap.get(name) || 0;
        const memoryUsed = memActualMap.get(name) || 0;

        // Disk — match via InternalIP (node_exporter uses IP:port as instance label)
        const internalIP =
          (node.status?.addresses ?? []).find((a) => a.type === 'InternalIP')?.address ?? '';
        const diskEntry = diskByIP.get(internalIP);

        // Max pods allocatable from K8s node spec
        const podCapacity = parseInt(node.status?.allocatable?.pods ?? node.status?.capacity?.pods ?? '110', 10);

        return {
          name,
          status,
          cpuTotal,
          cpuUsed,
          cpuPercentage: cpuTotal > 0 ? Math.round((cpuUsed / cpuTotal) * 100) : 0,
          cpuRequested: requested.cpu,
          memoryTotal,
          memoryUsed,
          memoryPercentage: memoryTotal > 0 ? Math.round((memoryUsed / memoryTotal) * 100) : 0,
          memoryRequested: requested.memory,
          diskUsed: diskEntry?.used ?? 0,
          diskTotal: diskEntry?.total ?? 0,
          diskPercentage: diskEntry?.percentage ?? 0,
          podCount: nodePodCountMap.get(name) ?? 0,
          podCapacity,
          cpuCapacity,
          memoryCapacity,
          cpuLimitTotal: limits.cpu,
          memoryLimitTotal: limits.memory,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Get node disk usage via node_exporter filesystem metrics
   * Returns disk used/total/percentage per node (root filesystem)
   */
  static async getNodeDiskUsage(): Promise<{ node: string; used: number; total: number; percentage: number }[]> {
    try {
      const totalQuery = `sum(node_filesystem_size_bytes{mountpoint="/",fstype!="tmpfs"}) by (instance)`;
      const freeQuery  = `sum(node_filesystem_free_bytes{mountpoint="/",fstype!="tmpfs"}) by (instance)`;

      const [totalResult, freeResult] = await Promise.all([
        this.query(totalQuery).catch(() => []),
        this.query(freeQuery).catch(() => []),
      ]);

      const totalMap = new Map<string, number>();
      totalResult.forEach((item: PrometheusResult) => {
        const node = item.metric.instance?.split(':')[0] || item.metric.instance || '';
        totalMap.set(node, parseFloat(item.value[1]) || 0);
      });

      return freeResult.map((item: PrometheusResult) => {
        const node = item.metric.instance?.split(':')[0] || item.metric.instance || '';
        const free = parseFloat(item.value[1]) || 0;
        const total = totalMap.get(node) || 0;
        const used = total - free;
        const percentage = total > 0 ? Math.round((used / total) * 100) : 0;
        return { node, used, total, percentage };
      });
    } catch {
      return [];
    }
  }

  /**
   * Get workload summary: deployments, statefulsets, daemonsets, pod phases, restarts.
   * All data from K8s API — no Prometheus dependency.
   */
  static async getWorkloadCounts(): Promise<{
    deployments: {
      total: number; healthy: number; degraded: number;
      details: DeploymentRolloutDetail[];
    };
    statefulsets: number;
    daemonsets: number;
    pods: { running: number; pending: number; failed: number; total: number };
    totalRestarts: number;
    topRestartPods: { name: string; namespace: string; restarts: number }[];
    namespaceRequests: { namespace: string; cpuRequested: number; memoryRequested: number }[];
  }> {
    try {
      const coreApi = kubeConfig.makeApiClient(CoreV1Api);
      const appsApi = kubeConfig.makeApiClient(AppsV1Api);

      const [deplResp, ssResp, dsResp, podsResp] = await Promise.all([
        appsApi.listDeploymentForAllNamespaces().catch(() => ({ items: [] })),
        appsApi.listStatefulSetForAllNamespaces().catch(() => ({ items: [] })),
        appsApi.listDaemonSetForAllNamespaces().catch(() => ({ items: [] })),
        coreApi.listPodForAllNamespaces().catch(() => ({ items: [] })),
      ]);

      const depls = deplResp.items ?? [];
      const deplDetails: DeploymentRolloutDetail[] = depls.map((d) => ({
        name:      d.metadata?.name ?? '',
        namespace: d.metadata?.namespace ?? '',
        desired:   d.spec?.replicas ?? 1,
        ready:     d.status?.readyReplicas ?? 0,
        updated:   d.status?.updatedReplicas ?? 0,
        available: d.status?.availableReplicas ?? 0,
      }));
      const deplHealthy = deplDetails.filter((d) => d.ready >= d.desired).length;

      const pods = podsResp.items ?? [];
      let totalRestarts = 0;
      const restartMap: { name: string; namespace: string; restarts: number }[] = [];
      // Namespace requests map (from pod specs — authoritative for scheduling)
      const nsReqMap = new Map<string, { cpuRequested: number; memoryRequested: number }>();
      pods.forEach((p) => {
        const podRestarts = (p.status?.containerStatuses ?? []).reduce(
          (s, cs) => s + (cs.restartCount ?? 0), 0
        );
        if (podRestarts > 0) {
          restartMap.push({
            name: p.metadata?.name ?? '',
            namespace: p.metadata?.namespace ?? '',
            restarts: podRestarts,
          });
        }
        totalRestarts += podRestarts;
        // Accumulate requests by namespace
        if (p.status?.phase === 'Running' || p.status?.phase === 'Pending') {
          const ns = p.metadata?.namespace ?? '';
          const entry = nsReqMap.get(ns) || { cpuRequested: 0, memoryRequested: 0 };
          (p.spec?.containers ?? []).forEach((c) => {
            if (c.resources?.requests?.cpu)
              entry.cpuRequested += parseCpuQuantity(c.resources.requests.cpu);
            if (c.resources?.requests?.memory)
              entry.memoryRequested += parseMemoryQuantity(c.resources.requests.memory);
          });
          nsReqMap.set(ns, entry);
        }
      });
      restartMap.sort((a, b) => b.restarts - a.restarts);

      return {
        deployments: {
          total: depls.length,
          healthy: deplHealthy,
          degraded: depls.length - deplHealthy,
          details: deplDetails,
        },
        statefulsets: (ssResp.items ?? []).length,
        daemonsets: (dsResp.items ?? []).length,
        pods: {
          running: pods.filter((p) => p.status?.phase === 'Running').length,
          pending: pods.filter((p) => p.status?.phase === 'Pending').length,
          failed:  pods.filter((p) => p.status?.phase === 'Failed').length,
          total: pods.length,
        },
        totalRestarts,
        topRestartPods: restartMap.slice(0, 5),
        namespaceRequests: Array.from(nsReqMap.entries()).map(([namespace, v]) => ({ namespace, ...v })),
      };
    } catch {
      return {
        deployments: { total: 0, healthy: 0, degraded: 0, details: [] },
        statefulsets: 0,
        daemonsets: 0,
        pods: { running: 0, pending: 0, failed: 0, total: 0 },
        totalRestarts: 0,
        topRestartPods: [],
        namespaceRequests: [],
      };
    }
  }

  /**
   * Get top 10 pods by CPU and memory actual usage — Prometheus cAdvisor.
   */
  static async getTopPods(): Promise<{ pod: string; namespace: string; cpuCores: number; memoryBytes: number }[]> {
    try {
      const cpuQuery = `topk(10, sum(rate(container_cpu_usage_seconds_total{container!="POD",container!=""}[5m])) by (pod, namespace))`;
      // No topk on memory — we need values for ALL pods so that pods appearing
      // in the CPU top-10 (but not memory top-10) still get their memory values.
      // Using max() avoids double-counting pod-sandbox + container series.
      const memQuery = `max(container_memory_working_set_bytes{container!="POD"}) by (pod, namespace)`;
      const [cpuResult, memResult] = await Promise.all([
        this.query(cpuQuery).catch(() => [] as PrometheusResult[]),
        this.query(memQuery).catch(() => [] as PrometheusResult[]),
      ]);
      // Seed the map from memory results first so every pod that has Prometheus data gets a value.
      const podMap = new Map<string, { pod: string; namespace: string; cpuCores: number; memoryBytes: number }>();
      memResult.forEach((r) => {
        const key = `${r.metric.namespace}/${r.metric.pod}`;
        if (!r.metric.pod) return;
        const entry = podMap.get(key) || { pod: r.metric.pod, namespace: r.metric.namespace || '', cpuCores: 0, memoryBytes: 0 };
        entry.memoryBytes = parseFloat(r.value[1]) || 0;
        podMap.set(key, entry);
      });
      // Overlay CPU values; pods not yet in map (e.g. hostNetwork pods) get created with memoryBytes=0.
      cpuResult.forEach((r) => {
        const key = `${r.metric.namespace}/${r.metric.pod}`;
        const entry = podMap.get(key) || { pod: r.metric.pod || '', namespace: r.metric.namespace || '', cpuCores: 0, memoryBytes: 0 };
        entry.cpuCores = parseFloat(r.value[1]) || 0;
        podMap.set(key, entry);
      });
      return Array.from(podMap.values())
        .filter((p) => p.pod && p.cpuCores > 0)  // only return pods that appeared in CPU top-10
        .sort((a, b) => b.cpuCores - a.cpuCores)
        .slice(0, 10);
    } catch {
      return [];
    }
  }

  /**
   * Get cluster scheduling pressure metrics — uses K8s API.
   *
   * Prometheus kube_pod_status_phase with count() returns all pods (not just
   * pending ones) because older kube-state-metrics emits one metric series per
   * phase per pod with 0/1 values. The K8s API fieldSelector is authoritative.
   */
  static async getSchedulingMetrics(): Promise<{ pending: number; unschedulable: number }> {
    try {
      const coreApi = kubeConfig.makeApiClient(CoreV1Api);
      const [podsResp, nodesResp] = await Promise.all([
        coreApi.listPodForAllNamespaces({ fieldSelector: 'status.phase=Pending' }).catch(() => ({ items: [] })),
        coreApi.listNode().catch(() => ({ items: [] })),
      ]);
      return {
        pending: (podsResp.items ?? []).length,
        unschedulable: (nodesResp.items ?? []).filter((n) => n.spec?.unschedulable === true).length,
      };
    } catch {
      return { pending: 0, unschedulable: 0 };
    }
  }

  /**
   * Get CPU and memory usage broken down by namespace
   */
  static async getNamespaceUsage(): Promise<{ namespace: string; cpuCores: number; memoryBytes: number }[]> {
    try {
      const cpuQuery = `sum(rate(container_cpu_usage_seconds_total{container!="POD",container!=""}[5m])) by (namespace)`;
      const memQuery = `sum(container_memory_working_set_bytes{container!="POD",container!=""}) by (namespace)`;

      const [cpuResult, memResult] = await Promise.all([
        this.query(cpuQuery).catch(() => []),
        this.query(memQuery).catch(() => []),
      ]);

      const nsMap = new Map<string, { cpuCores: number; memoryBytes: number }>();

      cpuResult.forEach((item: PrometheusResult) => {
        const ns = item.metric.namespace || '';
        const entry = nsMap.get(ns) || { cpuCores: 0, memoryBytes: 0 };
        entry.cpuCores = parseFloat(item.value[1]) || 0;
        nsMap.set(ns, entry);
      });

      memResult.forEach((item: PrometheusResult) => {
        const ns = item.metric.namespace || '';
        const entry = nsMap.get(ns) || { cpuCores: 0, memoryBytes: 0 };
        entry.memoryBytes = parseFloat(item.value[1]) || 0;
        nsMap.set(ns, entry);
      });

      return Array.from(nsMap.entries())
        .map(([namespace, usage]) => ({ namespace, ...usage }))
        .sort((a, b) => b.memoryBytes - a.memoryBytes);
    } catch {
      return [];
    }
  }

  /**
   * Get CPU + memory usage for all pods in a given namespace (batch query).
   * Returns a Map of pod name -> { cpu (cores), memory (bytes) }
   */
  static async getPodMetricsByNamespace(
    namespace: string,
  ): Promise<Map<string, { cpu: number; memory: number }>> {
    const safeNs = sanitizePromqlLabelValue(namespace);
    const cpuQuery = `sum(rate(container_cpu_usage_seconds_total{namespace="${safeNs}",container!="POD",container!=""}[5m])) by (pod)`;
    const memQuery = `sum(container_memory_working_set_bytes{namespace="${safeNs}",container!="POD",container!=""}) by (pod)`;

    const [cpuResult, memResult] = await Promise.all([
      this.query(cpuQuery).catch(() => [] as PrometheusResult[]),
      this.query(memQuery).catch(() => [] as PrometheusResult[]),
    ]);

    const map = new Map<string, { cpu: number; memory: number }>();

    cpuResult.forEach((item: PrometheusResult) => {
      const pod = item.metric.pod || '';
      const entry = map.get(pod) || { cpu: 0, memory: 0 };
      entry.cpu = parseFloat(item.value[1]) || 0;
      map.set(pod, entry);
    });

    memResult.forEach((item: PrometheusResult) => {
      const pod = item.metric.pod || '';
      const entry = map.get(pod) || { cpu: 0, memory: 0 };
      entry.memory = parseFloat(item.value[1]) || 0;
      map.set(pod, entry);
    });

    return map;
  }

  /**
   * Aggregate cluster Warning events by reason — top 10 by total count.
   * Used to surface patterns like FailedScheduling, OOMKilling without listing every raw event.
   */
  static async getEventSummary(): Promise<{ reason: string; count: number; isWarning: boolean }[]> {
    try {
      const coreApi = kubeConfig.makeApiClient(CoreV1Api);
      const response = await coreApi.listEventForAllNamespaces({ limit: 500 }).catch(() => ({ items: [] }));
      const aggMap = new Map<string, { count: number; isWarning: boolean }>();
      (response.items ?? []).forEach((e) => {
        const reason = e.reason ?? 'Unknown';
        if (!reason || reason === 'Unknown') return;
        const isWarning = e.type === 'Warning';
        const entry = aggMap.get(reason) ?? { count: 0, isWarning: false };
        entry.count += e.count ?? 1;
        if (isWarning) entry.isWarning = true;
        aggMap.set(reason, entry);
      });
      return Array.from(aggMap.entries())
        .map(([reason, v]) => ({ reason, ...v }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    } catch {
      return [];
    }
  }

  /**
   * Get complete cluster metrics for admin dashboard
   */
  static async getClusterMetrics(): Promise<ClusterMetrics> {
    // getClusterNodes() fetches disk internally (IP-based matching) so we skip
    // a separate getNodeDiskUsage() call here to avoid a redundant Prometheus query.
    const [cpu, memory, pods, nodes, scheduling, namespaces, workloads, topPods, eventSummary] = await Promise.all([
      this.getClusterCpuUsage(),
      this.getClusterMemoryUsage(),
      this.getClusterPodCount(),      // K8s API
      this.getClusterNodes(),         // K8s API + Prometheus
      this.getSchedulingMetrics(),    // K8s API
      this.getNamespaceUsage(),       // Prometheus
      this.getWorkloadCounts(),       // K8s API
      this.getTopPods(),              // Prometheus
      this.getEventSummary(),         // K8s API
    ]);

    // Derive cluster-wide request totals by summing per-node values
    // (computed from pod specs in getClusterNodes, always accurate)
    const totalCpuRequested = nodes.reduce((s, n) => s + n.cpuRequested, 0);
    const totalMemRequested = nodes.reduce((s, n) => s + n.memoryRequested, 0);

    // Cluster fit capacity — how many more pods can be scheduled given remaining requests headroom.
    // Uses request values (not actual), matching scheduler behaviour.
    const freeCpuCores    = Math.max(0, cpu.total - totalCpuRequested);
    const freeMemoryBytes = Math.max(0, memory.total - totalMemRequested);
    const clusterFit = {
      freeCpuCores,
      freeMemoryBytes,
      // small = 100m CPU, 128Mi RAM
      small:  Math.min(
        Math.floor(freeCpuCores / 0.1),
        Math.floor(freeMemoryBytes / (128 * 1024 * 1024)),
      ),
      // medium = 500m CPU, 512Mi RAM
      medium: Math.min(
        Math.floor(freeCpuCores / 0.5),
        Math.floor(freeMemoryBytes / (512 * 1024 * 1024)),
      ),
      // large = 1 core CPU, 1Gi RAM
      large:  Math.min(
        Math.floor(freeCpuCores / 1.0),
        Math.floor(freeMemoryBytes / (1024 * 1024 * 1024)),
      ),
    };

    // Re-expose disk as a flat array for backward compat (also embedded per-node)
    const disk = nodes
      .filter((n) => n.diskTotal > 0)
      .map((n) => ({ node: n.name, used: n.diskUsed, total: n.diskTotal, percentage: n.diskPercentage }));

    return {
      cpu: {
        ...cpu,
        requested: totalCpuRequested,
        requestedPercentage: cpu.total > 0 ? Math.min(100, Math.round((totalCpuRequested / cpu.total) * 100)) : 0,
      },
      memory: {
        ...memory,
        requested: totalMemRequested,
        requestedPercentage: memory.total > 0 ? Math.min(100, Math.round((totalMemRequested / memory.total) * 100)) : 0,
      },
      pods: {
        ...pods,
        pending: workloads.pods.pending,
        failed: workloads.pods.failed,
      },
      nodes,
      disk,
      scheduling,
      clusterFit,
      eventSummary,
      // Merge Prometheus actual usage with K8s-API namespace requests
      namespaces: namespaces.map((ns) => {
        const req = workloads.namespaceRequests.find((r) => r.namespace === ns.namespace);
        return {
          ...ns,
          cpuRequested:    req?.cpuRequested    ?? 0,
          memoryRequested: req?.memoryRequested ?? 0,
        };
      }),
      workloads: {
        deployments: workloads.deployments,
        statefulsets: workloads.statefulsets,
        daemonsets: workloads.daemonsets,
        totalRestarts: workloads.totalRestarts,
        topRestartPods: workloads.topRestartPods,
      },
      topPods,
      timestamp: new Date().toISOString(),
    };
  }
}

// Cluster metrics types
export interface DeploymentRolloutDetail {
  name: string;
  namespace: string;
  desired: number;
  ready: number;
  updated: number;
  available: number;
}

export interface NodeMetrics {
  name: string;
  status: string;
  cpuTotal: number;        // allocatable CPU (what pods can use)
  cpuCapacity: number;     // raw CPU capacity
  cpuUsed: number;
  cpuPercentage: number;
  cpuRequested: number;    // sum of pod CPU requests (from pod specs)
  cpuLimitTotal: number;   // sum of pod CPU limits (from pod specs)
  memoryTotal: number;     // allocatable memory
  memoryCapacity: number;  // raw memory capacity
  memoryUsed: number;
  memoryPercentage: number;
  memoryRequested: number; // sum of pod memory requests (from pod specs)
  memoryLimitTotal: number;// sum of pod memory limits (from pod specs)
  diskUsed: number;
  diskTotal: number;
  diskPercentage: number;
  podCount: number;        // running/pending pods scheduled on this node
  podCapacity: number;     // max pods this node can run (from allocatable.pods)
}

export interface ClusterMetrics {
  cpu: { used: number; total: number; percentage: number; requested: number; requestedPercentage: number };
  memory: { used: number; total: number; percentage: number; requested: number; requestedPercentage: number };
  pods: { running: number; total: number; pending: number; failed: number };
  nodes: NodeMetrics[];
  disk: { node: string; used: number; total: number; percentage: number }[];
  scheduling: { pending: number; unschedulable: number };
  namespaces: {
    namespace: string;
    cpuCores: number;
    memoryBytes: number;
    cpuRequested: number;
    memoryRequested: number;
  }[];
  workloads: {
    deployments: { total: number; healthy: number; degraded: number; details: DeploymentRolloutDetail[] };
    statefulsets: number;
    daemonsets: number;
    totalRestarts: number;
    topRestartPods: { name: string; namespace: string; restarts: number }[];
  };
  topPods: { pod: string; namespace: string; cpuCores: number; memoryBytes: number }[];
  /** Remaining scheduler headroom + estimated pod fit capacity */
  clusterFit: {
    freeCpuCores: number;
    freeMemoryBytes: number;
    /** How many small pods (100m CPU, 128Mi RAM) can still be scheduled */
    small: number;
    /** How many medium pods (500m CPU, 512Mi RAM) can still be scheduled */
    medium: number;
    /** How many large pods (1 core CPU, 1Gi RAM) can still be scheduled */
    large: number;
  };
  /** Top event reasons aggregated by count (last 500 events) */
  eventSummary: { reason: string; count: number; isWarning: boolean }[];
  timestamp: string;
}
