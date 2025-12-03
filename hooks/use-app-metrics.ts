'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

export interface AppMetrics {
  cpu_usage: number;      // CPU usage as percentage (0-100)
  memory_usage: number;   // Memory usage as percentage (0-100)
  memory_mb: number;      // Memory in MB
  timestamp: string;
}

export interface AppHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  pod_count: number;
  restart_count: number;
  timestamp: string;
}

interface UseAppMetricsOptions {
  appId: string;
  enabled?: boolean;
  refreshInterval?: number; // in milliseconds
}

interface UseAppMetricsReturn {
  metrics: AppMetrics | null;
  health: AppHealth | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Custom hook to check if tab is visible
 * Pauses auto-refresh when user switches to another tab
 */
function useTabVisible(): boolean {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === 'visible');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return isVisible;
}

// Helper to parse API response into frontend format
function parseMetricsResponse(data: any): AppMetrics | null {
  // Handle error responses or missing data
  if (!data) return null;
  if (data.error) return null;
  if (!data.metrics) return null;
  
  const totalCpu = data.metrics.total?.cpu?.cores ?? 0;
  const totalMemory = data.metrics.total?.memory?.bytes ?? 0;
  
  // Convert CPU cores to percentage (assuming 1 core = 100%)
  // Most small deployments use ~0.001 cores, so multiply by 100 to get %
  const cpuPercent = Number.isFinite(totalCpu) ? totalCpu * 100 : 0;
  
  // Convert memory to MB and estimate percentage (assuming 512MB limit for small apps)
  const memoryMb = Number.isFinite(totalMemory) ? totalMemory / (1024 * 1024) : 0;
  const memoryLimit = 512; // Default memory limit in MB
  const memoryPercent = memoryLimit > 0 ? (memoryMb / memoryLimit) * 100 : 0;
  
  return {
    cpu_usage: Math.min(Math.max(cpuPercent, 0), 100), // Clamp 0-100%
    memory_usage: Math.min(Math.max(memoryPercent, 0), 100),
    memory_mb: Math.max(memoryMb, 0),
    timestamp: data.timestamp || new Date().toISOString(),
  };
}

function parseHealthResponse(data: any): AppHealth | null {
  // Handle error responses or missing data
  if (!data) return null;
  if (data.error) return null;
  
  const podTotal = data.pods?.total ?? 0;
  const podReady = data.pods?.ready ?? 0;
  
  return {
    status: data.status || 'unknown',
    pod_count: Math.max(podTotal, podReady, 0),
    restart_count: Math.max(data.restarts ?? 0, 0),
    timestamp: data.timestamp || new Date().toISOString(),
  };
}

export function useAppMetrics({
  appId,
  enabled = true,
  refreshInterval = 30000, // 30 seconds default
}: UseAppMetricsOptions): UseAppMetricsReturn {
  const [metrics, setMetrics] = useState<AppMetrics | null>(null);
  const [health, setHealth] = useState<AppHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isTabVisible = useTabVisible();
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (!appId || !enabled) return;

    // Cancel any in-flight request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setLoading(true);
    setError(null);

    try {
      // Fetch metrics and health in parallel
      const [metricsRes, healthRes] = await Promise.all([
        fetch(`/api/services/platform-apps/metrics?app_id=${appId}`, { signal }),
        fetch(`/api/services/platform-apps/health?app_id=${appId}`, { signal }),
      ]);

      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        setMetrics(parseMetricsResponse(metricsData));
      }

      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setHealth(parseHealthResponse(healthData));
      }

      if (!metricsRes.ok && !healthRes.ok) {
        setError('Failed to fetch monitoring data');
      }
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to fetch monitoring data');
    } finally {
      setLoading(false);
    }
  }, [appId, enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh only when tab is visible
  useEffect(() => {
    if (!enabled || refreshInterval <= 0 || !isTabVisible) return;

    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [enabled, refreshInterval, fetchData, isTabVisible]);

  return {
    metrics,
    health,
    loading,
    error,
    refetch: fetchData,
  };
}

// Hook for multiple apps at once
interface UseMultipleAppMetricsOptions {
  appIds: string[];
  enabled?: boolean;
  refreshInterval?: number;
}

interface AppMetricsData {
  metrics: AppMetrics | null;
  health: AppHealth | null;
}

export function useMultipleAppMetrics({
  appIds,
  enabled = true,
  refreshInterval = 30000,
}: UseMultipleAppMetricsOptions): {
  data: Record<string, AppMetricsData>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<Record<string, AppMetricsData>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isTabVisible = useTabVisible();
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Memoize appIds to prevent unnecessary re-renders
  const stableAppIds = useMemo(() => appIds.join(','), [appIds]);

  const fetchAllData = useCallback(async () => {
    const currentAppIds = stableAppIds.split(',').filter(Boolean);
    if (!enabled || currentAppIds.length === 0) return;

    // Cancel any in-flight requests
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setLoading(true);
    setError(null);

    try {
      const results: Record<string, AppMetricsData> = {};

      // Fetch all apps in parallel (batched to avoid overwhelming the API)
      const batchSize = 5;
      for (let i = 0; i < currentAppIds.length; i += batchSize) {
        const batch = currentAppIds.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (appId) => {
            try {
              const [metricsRes, healthRes] = await Promise.all([
                fetch(`/api/services/platform-apps/metrics?app_id=${appId}`, { signal }),
                fetch(`/api/services/platform-apps/health?app_id=${appId}`, { signal }),
              ]);

              const metricsData = metricsRes.ok ? await metricsRes.json() : null;
              const healthData = healthRes.ok ? await healthRes.json() : null;

              results[appId] = {
                metrics: parseMetricsResponse(metricsData),
                health: parseHealthResponse(healthData),
              };
            } catch (err) {
              // Ignore abort errors
              if (err instanceof Error && err.name === 'AbortError') return;
              results[appId] = { metrics: null, health: null };
            }
          })
        );
      }

      setData(results);
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to fetch monitoring data');
    } finally {
      setLoading(false);
    }
  }, [stableAppIds, enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Auto-refresh only when tab is visible
  useEffect(() => {
    if (!enabled || refreshInterval <= 0 || !isTabVisible) return;

    const interval = setInterval(fetchAllData, refreshInterval);
    return () => clearInterval(interval);
  }, [enabled, refreshInterval, fetchAllData, isTabVisible]);

  return {
    data,
    loading,
    error,
    refetch: fetchAllData,
  };
}

// Types for app details
export interface PodDetails {
  name: string;
  nodeName: string;
  nodeIP: string;
  podIP: string;
  phase: string;
  uptime: string;
  startTime: string;
}

export interface ContainerDetails {
  name: string;
  image: string;
  imageTag: string;
  ready: boolean;
  restartCount: number;
  state: string;
  resources: {
    requests: { cpu: string; memory: string };
    limits: { cpu: string; memory: string };
  };
}

export interface DeploymentDetails {
  replicas: number;
  availableReplicas: number;
  readyReplicas: number;
  strategy: string;
  createdAt: string;
}

export interface NetworkDetails {
  ingressHost: string;
  tlsEnabled: boolean;
  serviceName: string;
  servicePort: number;
}

export interface EventDetails {
  type: 'Normal' | 'Warning';
  reason: string;
  message: string;
  lastTimestamp: string;
  count: number;
}

export interface AppDetails {
  pod: PodDetails | null;
  container: ContainerDetails | null;
  deployment: DeploymentDetails | null;
  network: NetworkDetails | null;
  events: EventDetails[];
  timestamp: string;
}

// Hook for fetching detailed app info
interface UseAppDetailsOptions {
  appId: string;
  enabled?: boolean;
}

export function useAppDetails({
  appId,
  enabled = true,
}: UseAppDetailsOptions): {
  details: AppDetails | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [details, setDetails] = useState<AppDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetails = useCallback(async () => {
    if (!appId || !enabled) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/services/platform-apps/details?app_id=${appId}`);
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch details');
      }

      const data = await res.json();
      
      // Parse the response
      const parsedDetails: AppDetails = {
        pod: data.pod ? {
          name: data.pod.name || '',
          nodeName: data.pod.nodeName || '',
          nodeIP: data.pod.nodeIP || '',
          podIP: data.pod.podIP || '',
          phase: data.pod.phase || 'Unknown',
          uptime: data.pod.uptime || '',
          startTime: data.pod.startTime || '',
        } : null,
        container: data.pod?.containers?.[0] ? {
          name: data.pod.containers[0].name || '',
          image: data.pod.containers[0].image || '',
          imageTag: data.pod.containers[0].imageTag || 'latest',
          ready: data.pod.containers[0].ready || false,
          restartCount: data.pod.containers[0].restartCount || 0,
          state: data.pod.containers[0].state || 'Unknown',
          resources: {
            requests: {
              cpu: data.pod.containers[0].resources?.requests?.cpu || '100m',
              memory: data.pod.containers[0].resources?.requests?.memory || '128Mi',
            },
            limits: {
              cpu: data.pod.containers[0].resources?.limits?.cpu || '500m',
              memory: data.pod.containers[0].resources?.limits?.memory || '512Mi',
            },
          },
        } : null,
        deployment: data.deployment ? {
          replicas: data.deployment.replicas || 1,
          availableReplicas: data.deployment.availableReplicas || 0,
          readyReplicas: data.deployment.readyReplicas || 0,
          strategy: data.deployment.strategy || 'RollingUpdate',
          createdAt: data.deployment.createdAt || '',
        } : null,
        network: data.network ? {
          ingressHost: data.network.ingressHost || '',
          tlsEnabled: data.network.tlsEnabled || false,
          serviceName: data.network.serviceName || '',
          servicePort: data.network.servicePort || 80,
        } : null,
        events: (data.events || []).map((e: any) => ({
          type: e.type || 'Normal',
          reason: e.reason || '',
          message: e.message || '',
          lastTimestamp: e.lastTimestamp || '',
          count: e.count || 1,
        })),
        timestamp: data.timestamp || new Date().toISOString(),
      };
      
      setDetails(parsedDetails);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch details');
    } finally {
      setLoading(false);
    }
  }, [appId, enabled]);

  useEffect(() => {
    if (enabled) {
      fetchDetails();
    }
  }, [fetchDetails, enabled]);

  return {
    details,
    loading,
    error,
    refetch: fetchDetails,
  };
}
