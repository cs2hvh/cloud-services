'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface VMMetrics {
  cpu: number;
  mem_used: number;
  mem_total: number;
  mem_pct: number;
  disk_read: number;
  disk_write: number;
  net_in: number;
  net_out: number;
  uptime: number;
  status: string;
  timestamp: string;
}

export interface VMMetricsHistoryPoint {
  time: number;
  cpu: number;
  mem_pct: number;
  net_in: number;
  net_out: number;
  disk_read: number;
  disk_write: number;
}

interface UseVMMetricsOptions {
  serverId: number;
  /** Only fetch metrics when the VM is in a running state */
  enabled?: boolean;
  /** Polling interval in ms (default: 15000 = 15s) */
  refreshInterval?: number;
}

interface UseVMMetricsReturn {
  metrics: VMMetrics | null;
  history: VMMetricsHistoryPoint[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to poll live VM resource metrics from Proxmox via API.
 *
 * - Auto-pauses when tab is not visible
 * - Stops polling on repeated errors (3 consecutive)
 * - Rate-limit safe: default 15s interval (max 4 req/min)
 */
export function useVMMetrics({
  serverId,
  enabled = true,
  refreshInterval = 15_000,
}: UseVMMetricsOptions): UseVMMetricsReturn {
  const [metrics, setMetrics] = useState<VMMetrics | null>(null);
  const [history, setHistory] = useState<VMMetricsHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const consecutiveErrors = useRef(0);
  const isVisible = useTabVisible();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!serverId || !enabled) return;

    try {
      const res = await fetch(`/api/services/compute/vms/${serverId}/metrics`, {
        cache: 'no-store',
      });

      if (res.status === 429) {
        // Rate limited — back off, don't count as error
        return;
      }

      if (res.status === 422) {
        // Server is provisioning or not ready
        setError('Server not ready for monitoring');
        setLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error || 'Failed to fetch metrics');
      }

      setMetrics(json.metrics);
      setHistory(json.history || []);
      setError(null);
      consecutiveErrors.current = 0;
    } catch (err) {
      consecutiveErrors.current++;
      const msg = err instanceof Error ? err.message : 'Metrics unavailable';
      setError(msg);

      // Stop polling after 3 consecutive failures
      if (consecutiveErrors.current >= 3 && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    } finally {
      setLoading(false);
    }
  }, [serverId, enabled]);

  // Initial fetch + polling setup
  useEffect(() => {
    if (!enabled || !serverId) {
      setLoading(false);
      return;
    }

    // Fetch immediately
    fetchMetrics();

    // Setup polling (only when tab visible)
    if (isVisible) {
      intervalRef.current = setInterval(fetchMetrics, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchMetrics, refreshInterval, isVisible, enabled, serverId]);

  // Pause/resume on visibility change
  useEffect(() => {
    if (!enabled) return;

    if (isVisible && !intervalRef.current && consecutiveErrors.current < 3) {
      // Tab became visible — refresh immediately and restart polling
      fetchMetrics();
      intervalRef.current = setInterval(fetchMetrics, refreshInterval);
    } else if (!isVisible && intervalRef.current) {
      // Tab hidden — stop polling to save resources
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [isVisible, enabled, fetchMetrics, refreshInterval]);

  return { metrics, history, loading, error, refetch: fetchMetrics };
}

/** Track document visibility */
function useTabVisible(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return visible;
}
