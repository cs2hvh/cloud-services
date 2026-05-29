'use client';

import { useState, useEffect, useCallback } from 'react';

export interface BandwidthSummary {
  appId: string;
  periodStart: string;
  periodEnd: string;
  ingressBytes: number;
  egressBytes: number;
  totalBytes: number;
  purchasedBytes: number;
  quota: {
    totalBytes: number | null;
    ingressBytes: number | null;
    egressBytes: number | null;
    maxRequestBodyBytes: number | null;
    overagePerGb: number | null;
    overageLimitBytes: number | null;
    source: 'product' | 'default';
  };
  percentUsed: number | null;
  status: 'ok' | 'warning' | 'critical' | 'exceeded' | 'unlimited';
  lifecycleStatus: 'ok' | 'warning' | 'critical' | 'overage' | 'restricted';
  remainingBytes: number | null;
  shouldBlockNewTraffic: boolean;
  policyAction: 'allow' | 'notify' | 'charge_overage' | 'restrict';
  lastSampledAt: string | null;
}

interface UseBandwidthReturn {
  data: BandwidthSummary | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useBandwidth(appId: string, enabled = true): UseBandwidthReturn {
  const [data, setData] = useState<BandwidthSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (refresh = false) => {
    if (!appId || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/services/platform-apps/bandwidth?app_id=${appId}&refresh=${refresh ? 'true' : 'false'}`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to fetch bandwidth data');
      }
      const json = await res.json();
      setData(json.usage ?? json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch bandwidth usage');
    } finally {
      setLoading(false);
    }
  }, [appId, enabled]);

  useEffect(() => { fetchData(true); }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch: () => fetchData(false),
    refresh: () => fetchData(true),
  };
}
