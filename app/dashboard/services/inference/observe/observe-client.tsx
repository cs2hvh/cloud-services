'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { toast } from 'sonner';

import {
  ACCENT,
  GhostButton,
  Hero,
  PageCanvas,
  StatCell,
  StatsStrip,
} from '@/components/dashboard/inference/chrome';

import { AnalyticsCard } from './analytics-card';
import { SpanDetailDialog } from './span-detail-dialog';
import { SpanStream } from './span-stream';
import { formatCost, formatLatency, spanLabel } from './_helpers';
import type {
  Analytics,
  AnalyticsGroupBy,
  Period,
  SpanCounts,
  StreamPeriod,
  TraceRow,
  TracesResponse,
} from './_types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STREAM_LIMIT: Record<StreamPeriod, number> = {
  live: 100,
  '24h': 500,
  '7d': 1000,
  '30d': 2000,
};

function buildTracesUrl(period: StreamPeriod): string {
  const p = new URLSearchParams({ limit: String(STREAM_LIMIT[period]) });
  if (period !== 'live') {
    const ms: Record<string, number> = { '24h': 24, '7d': 168, '30d': 720 };
    const from = new Date(Date.now() - ms[period] * 3_600_000).toISOString();
    p.set('from', from);
  }
  return `/api/inference/traces?${p}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ObserveClient() {
  // Span stream
  const [allRows, setAllRows]         = useState<TraceRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [streamPeriod, setStreamPeriod] = useState<StreamPeriod>('live');

  // Client-side filter state (no network call — just slices allRows)
  const [filter, setFilter]           = useState('All');
  const [modelSearch, setModelSearch] = useState('');

  // Analytics
  const [analytics, setAnalytics]               = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsPeriod, setAnalyticsPeriod]   = useState<Period>('7d');
  const [analyticsGroupBy, setAnalyticsGroupBy] = useState<AnalyticsGroupBy>('model');

  // Dialog
  const [detail, setDetail] = useState<TraceRow | null>(null);

  // ── Network calls ──────────────────────────────────────────────────────────

  const loadSpans = useCallback(async (period: StreamPeriod) => {
    setLoading(true);
    try {
      const r = await fetch(buildTracesUrl(period), { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to load traces');
      const json: TracesResponse = await r.json();
      setAllRows(json.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load traces');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAnalytics = useCallback(async (period: Period, groupBy: AnalyticsGroupBy) => {
    setAnalyticsLoading(true);
    try {
      const r = await fetch(
        `/api/inference/observe/analytics?period=${period}&group_by=${groupBy}`,
        { credentials: 'include' },
      );
      if (!r.ok) throw new Error('Failed to load analytics');
      setAnalytics(await r.json());
    } catch {
      // non-fatal
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadSpans('live');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadAnalytics(analyticsPeriod, analyticsGroupBy);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsPeriod, analyticsGroupBy]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleStreamPeriodChange = useCallback((p: StreamPeriod) => {
    setStreamPeriod(p);
    setFilter('All');
    setModelSearch('');
    loadSpans(p);
  }, [loadSpans]);

  const handleRefresh = useCallback(() => {
    loadSpans(streamPeriod);
    loadAnalytics(analyticsPeriod, analyticsGroupBy);
  }, [loadSpans, loadAnalytics, streamPeriod, analyticsPeriod, analyticsGroupBy]);

  // ── Derived state ──────────────────────────────────────────────────────────

  const counts: SpanCounts = useMemo(() => {
    const byType: Record<string, number> = {};
    let blocked = 0, errors = 0;
    for (const r of allRows) {
      const t = spanLabel(r.name);
      byType[t] = (byType[t] ?? 0) + 1;
      if (r.guardrail_action === 'blocked') blocked++;
      if ((r.status.startsWith('error_') && r.status !== 'error_guardrail_blocked') || r.status === 'cancelled') errors++;
    }
    return { byType, blocked, errors };
  }, [allRows]);

  const visible = useMemo(() => {
    let rows = allRows;
    if (filter === 'blocked') rows = rows.filter((r) => r.guardrail_action === 'blocked');
    else if (filter === 'errors') rows = rows.filter((r) => (r.status.startsWith('error_') && r.status !== 'error_guardrail_blocked') || r.status === 'cancelled');
    else if (filter !== 'All') rows = rows.filter((r) => spanLabel(r.name) === filter);
    if (modelSearch.trim()) {
      const q = modelSearch.trim().toLowerCase();
      rows = rows.filter((r) => r.model_id?.toLowerCase().includes(q));
    }
    return rows;
  }, [allRows, filter, modelSearch]);

  const stats = useMemo(() => {
    let totalLatency = 0, latencyCount = 0, blockedCount = 0, errorCount = 0;
    let totalCost = 0, totalIn = 0, totalOut = 0;
    const latencies: number[] = [];
    for (const r of visible) {
      if (r.latency_ms != null) { totalLatency += r.latency_ms; latencyCount++; latencies.push(r.latency_ms); }
      if (r.guardrail_action === 'blocked') blockedCount++;
      if ((r.status.startsWith('error_') && r.status !== 'error_guardrail_blocked') || r.status === 'cancelled') errorCount++;
      if (r.cost_cents != null) totalCost += Number(r.cost_cents);
      if (r.input_tokens != null) totalIn += r.input_tokens;
      if (r.output_tokens != null) totalOut += r.output_tokens;
    }
    latencies.sort((a, b) => a - b);
    return {
      count:       visible.length,
      avgLatency:  latencyCount > 0 ? Math.round(totalLatency / latencyCount) : null,
      p99Latency:  latencies[Math.floor(latencies.length * 0.99)] ?? null,
      blockedCount,
      blockedPct:  visible.length > 0 ? Math.round((blockedCount / visible.length) * 100) : 0,
      totalCost:   Math.round(totalCost * 1000) / 1000,
      totalTokens: totalIn + totalOut,
    };
  }, [visible]);

  const busy = loading;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: 'Inference', href: '/dashboard/services/inference' }}
        title="Observe"
        accent="traces"
        caption="Every gateway request emits an OTel GenAI-compatible span. No SDK required — spans are captured natively from the CF Worker for every /v1/* call and stored in inference.trace_spans."
        size="md"
        actions={
          <GhostButton onClick={handleRefresh} disabled={busy}>
            <RotateCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
            Refresh
          </GhostButton>
        }
      />

      <StatsStrip>
        <StatCell
          label="Requests"
          value={loading ? '—' : String(stats.count)}
          hint={filter === 'All' ? 'Spans in this view' : `Filtered to "${filter}"`}
        />
        <StatCell
          label="Avg latency"
          value={loading ? '—' : formatLatency(stats.avgLatency)}
          hint={stats.p99Latency != null ? `p99 ${formatLatency(stats.p99Latency)}` : 'No data'}
          accent={ACCENT}
        />
        <StatCell
          label="Blocked"
          value={loading ? '—' : `${stats.blockedPct}%`}
          hint={`${stats.blockedCount} requests guardrail-blocked`}
          accent={stats.blockedPct > 5 ? '#f87171' : undefined}
        />
        <StatCell
          label="Total cost"
          value={loading ? '—' : formatCost(stats.totalCost)}
          hint={`${(stats.totalTokens / 1000).toFixed(1)}k tokens`}
        />
      </StatsStrip>

      <AnalyticsCard
        analytics={analytics}
        loading={analyticsLoading}
        period={analyticsPeriod}
        groupBy={analyticsGroupBy}
        onPeriodChange={setAnalyticsPeriod}
        onGroupByChange={setAnalyticsGroupBy}
      />

      {/* Divider */}
      <div className="flex items-center gap-4 mb-12">
        <div className="h-px flex-1 bg-white/[0.05]" />
        <span className={`font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/20`}>span stream</span>
        <div className="h-px flex-1 bg-white/[0.05]" />
      </div>

      <SpanStream
        visibleRows={visible}
        allRowCount={allRows.length}
        loading={loading}
        filter={filter}
        modelSearch={modelSearch}
        counts={counts}
        streamPeriod={streamPeriod}
        onFilterChange={setFilter}
        onModelSearchChange={setModelSearch}
        onStreamPeriodChange={handleStreamPeriodChange}
        onRowClick={setDetail}
      />

      <SpanDetailDialog detail={detail} onClose={() => setDetail(null)} />
    </PageCanvas>
  );
}
