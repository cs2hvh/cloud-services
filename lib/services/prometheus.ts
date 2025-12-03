/**
 * Prometheus Service - Handles metrics queries from Prometheus
 * 
 * Uses Kubernetes API to proxy requests to Prometheus running inside the cluster.
 * This avoids exposing Prometheus externally and uses existing KUBE_CONFIG_STRING.
 */

import kubeConfig from '@/lib/kubernetes';
import https from 'https';
import http from 'http';

// Prometheus service details inside the cluster
const PROMETHEUS_NAMESPACE = 'monitoring';
const PROMETHEUS_SERVICE = 'prometheus-kube-prometheus-prometheus';
const PROMETHEUS_PORT = 9090;

export interface PodMetrics {
  pod: string;
  cpu: number;      // CPU usage in cores (e.g., 0.5 = 500m)
  memory: number;   // Memory in bytes
}

export interface AppMetrics {
  appName: string;
  pods: PodMetrics[];
  totalCpu: number;
  totalMemory: number;
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

export class PrometheusService {
  /**
   * Query Prometheus via K8s API service proxy
   * Path: /api/v1/namespaces/{ns}/services/{svc}:{port}/proxy/{path}
   */
  private static async query(promql: string): Promise<any> {
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
    } catch (error: any) {
      console.error(`[PrometheusService] Query failed:`, error?.message);
      throw error;
    }
  }

  /**
   * Get CPU usage for an app's pods
   * Returns CPU in cores (e.g., 0.5 = 500m = 50% of 1 core)
   */
  static async getCpuUsage(appName: string): Promise<{ pod: string; cpu: number }[]> {
    const deploymentName = `${appName}-app`;
    
    // CPU usage rate over 5 minutes, grouped by pod
    const promql = `sum(rate(container_cpu_usage_seconds_total{pod=~"${deploymentName}.*",container!="POD",container!=""}[5m])) by (pod)`;
    
    const result = await this.query(promql);
    
    return result.map((item: any) => ({
      pod: item.metric.pod,
      cpu: parseFloat(item.value[1]) || 0,
    }));
  }

  /**
   * Get memory usage for an app's pods
   * Returns memory in bytes
   */
  static async getMemoryUsage(appName: string): Promise<{ pod: string; memory: number }[]> {
    const deploymentName = `${appName}-app`;
    
    // Current memory usage, grouped by pod
    const promql = `sum(container_memory_working_set_bytes{pod=~"${deploymentName}.*",container!="POD",container!=""}) by (pod)`;
    
    const result = await this.query(promql);
    
    return result.map((item: any) => ({
      pod: item.metric.pod,
      memory: parseFloat(item.value[1]) || 0,
    }));
  }

  /**
   * Get restart count for an app's pods
   */
  static async getRestartCount(appName: string): Promise<number> {
    const deploymentName = `${appName}-app`;
    
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
    const deploymentName = `${appName}-app`;
    
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
    const [cpuData, memoryData] = await Promise.all([
      this.getCpuUsage(appName).catch(() => []),
      this.getMemoryUsage(appName).catch(() => []),
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

    const pods = Array.from(podMap.values());
    
    return {
      appName,
      pods,
      totalCpu: pods.reduce((sum, p) => sum + p.cpu, 0),
      totalMemory: pods.reduce((sum, p) => sum + p.memory, 0),
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
}
