'use client';

import { useEffect, useState } from 'react';
import { Download, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  ACCENT,
  ColHead,
  DataTable,
  EmptyState,
  GhostButton,
  Hero,
  MONO,
  PageCanvas,
  SectionHead,
  SERIF_STYLE,
  StatCell,
  StatsStrip,
} from '@/components/dashboard/inference/chrome';

interface UsageData {
  org: { id: string; slug: string; name: string };
  summary: {
    month: string;
    month_spent_cents: number;
    month_requests: number;
    window_days: number;
    window_requests: number;
    window_spent_cents: number;
    success_count: number;
    error_count: number;
    input_tokens: number;
    output_tokens: number;
    latency_ms_p50: number | null;
    latency_ms_p95: number | null;
    latency_ms_p99: number | null;
    cache_l1_hits: number;
    cache_semantic_hits: number;
    cache_hit_rate: number | null;
  };
  day_series: Array<{ day: string; spent_cents: number; requests: number }>;
  top_models: Array<{ model_id: string; spent_cents: number; requests: number }>;
  top_api_keys: Array<{
    id: string;
    name: string;
    preview: string;
    spent_cents: number;
    requests: number;
    cache_l1_hits: number;
    cache_semantic_hits: number;
    cache_hit_rate: number | null;
  }>;
  recent: Array<{
    created_at: string;
    model_id: string;
    modality: string;
    input_tokens: number | null;
    output_tokens: number | null;
    cost_cents: number;
    latency_ms: number | null;
    status: string;
    billed_to: string;
    cache_kind: 'none' | 'l1' | 'semantic';
  }>;
}

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [days, setDays] = useState('7');

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/inference/usage/summary?days=${days}`, {
        credentials: 'include',
      });
      if (!r.ok) throw new Error('Failed to load usage');
      setData(await r.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load usage');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [days]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const r = await fetch(`/api/inference/usage/export?days=${days}`, {
        credentials: 'include',
      });
      if (!r.ok) {
        let msg = 'Export failed';
        try {
          const j = (await r.json()) as { error?: string };
          if (j.error) msg = j.error;
        } catch { /* non-JSON body */ }
        throw new Error(msg);
      }
      const blob = await r.blob();
      const filename =
        /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') ?? '')?.[1] ??
        `inference-usage-${days}d.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const truncated = r.headers.get('X-Truncated') === 'true';
      const rows = r.headers.get('X-Row-Count') ?? '?';
      toast.success(
        truncated
          ? `Exported ${rows} rows (capped — narrow the window for the full set)`
          : `Exported ${rows} rows`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const formatCents = (c: number) => {
    if (c === 0) return '$0';
    if (c < 100) return `$${(c / 100).toFixed(4)}`;
    return `$${(c / 100).toFixed(2)}`;
  };

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: 'Inference', href: '/dashboard/services/inference' }}
        title="Usage &"
        accent="analytics"
        caption="Spend, request volume, latency percentiles, and per-model + per-API-key breakdowns. Export the raw window as CSV for finance and accounting workflows."
        size="md"
        actions={
          <>
            <div className={`${MONO} flex items-center gap-2`}>
              <span className="text-[10.5px] uppercase tracking-[0.14em] text-white/45">Window</span>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className={`${MONO} h-10 w-28 text-[11.5px] uppercase tracking-[0.12em] bg-white/[0.02] border-white/[0.08]`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <GhostButton onClick={exportCsv} disabled={exporting || loading}>
              <Download className={`h-3.5 w-3.5 ${exporting ? 'animate-pulse' : ''}`} />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </GhostButton>
            <GhostButton onClick={load} disabled={loading}>
              <RotateCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </GhostButton>
          </>
        }
      />

      <StatsStrip>
        <StatCell
          label="This month"
          value={loading ? '—' : formatCents(data?.summary.month_spent_cents ?? 0)}
          hint={loading ? '' : `${(data?.summary.month_requests ?? 0).toLocaleString()} requests`}
        />
        <StatCell
          label={`Window (${days}d)`}
          value={loading ? '—' : formatCents(data?.summary.window_spent_cents ?? 0)}
          hint={loading ? '' : `${(data?.summary.window_requests ?? 0).toLocaleString()} requests`}
          accent={ACCENT}
        />
        <StatCell
          label="Latency p50"
          value={loading ? '—' : data?.summary.latency_ms_p50 ? String(data.summary.latency_ms_p50) : '—'}
          suffix={data?.summary.latency_ms_p50 ? 'ms' : undefined}
          hint={data?.summary.latency_ms_p95 ? `p95 ${data.summary.latency_ms_p95}ms · p99 ${data.summary.latency_ms_p99 ?? '—'}ms` : 'No data'}
        />
        <StatCell
          label="Success rate"
          value={
            loading
              ? '—'
              : data && data.summary.success_count + data.summary.error_count > 0
                ? `${((data.summary.success_count / (data.summary.success_count + data.summary.error_count)) * 100).toFixed(1)}%`
                : '—'
          }
          hint={data ? `${data.summary.error_count} errors · ${data.summary.success_count} ok` : ''}
          accent={
            data && data.summary.success_count + data.summary.error_count > 0
              ? data.summary.success_count / (data.summary.success_count + data.summary.error_count) > 0.99
                ? '#4ade80'
                : '#fbbf24'
              : undefined
          }
        />
        <StatCell
          label="Cache hit rate"
          value={
            loading
              ? '—'
              : data && data.summary.cache_hit_rate !== null
                ? `${(data.summary.cache_hit_rate * 100).toFixed(1)}%`
                : '—'
          }
          hint={
            data
              ? `${(data.summary.cache_l1_hits + data.summary.cache_semantic_hits).toLocaleString()} hits · L1 ${data.summary.cache_l1_hits.toLocaleString()} / sem ${data.summary.cache_semantic_hits.toLocaleString()}`
              : ''
          }
          accent={
            data && (data.summary.cache_l1_hits > 0 || data.summary.cache_semantic_hits > 0)
              ? '#4ade80'
              : undefined
          }
        />
      </StatsStrip>

      {/* Daily spend chart */}
      <section className="mb-14">
        <SectionHead
          eyebrow="Spend"
          title="Daily"
          accent="cost curve"
          rightMeta="UTC days · USD"
        />
        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5">
          {data?.day_series && data.day_series.some((d) => d.spent_cents > 0) ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.day_series} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{
                      fill: 'rgba(255,255,255,0.4)',
                      fontSize: 10,
                      fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                    }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                    tickFormatter={(d) =>
                      new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()
                    }
                  />
                  <YAxis
                    tick={{
                      fill: 'rgba(255,255,255,0.4)',
                      fontSize: 10,
                      fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                    }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => (v === 0 ? '$0' : `$${(v / 100).toFixed(2)}`)}
                  />
                  <Tooltip
                    cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
                    contentStyle={{
                      background: '#0d0e11',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 5,
                      fontSize: 11,
                      fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                      color: '#fff',
                      padding: '8px 10px',
                    }}
                    labelStyle={{
                      color: 'rgba(255,255,255,0.55)',
                      marginBottom: 4,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      fontSize: 10,
                    }}
                    formatter={(v: number) => [`$${(v / 100).toFixed(4)}`, 'Spent']}
                  />
                  <Area
                    type="monotone"
                    dataKey="spent_cents"
                    stroke={ACCENT}
                    strokeWidth={1.5}
                    fill="url(#spendFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className={`${MONO} flex h-48 items-center justify-center text-[11.5px] uppercase tracking-[0.14em] text-white/35`}>
              No spend in this window
            </div>
          )}
        </div>
      </section>

      {/* Top models */}
      <section className="mb-14">
        <SectionHead
          eyebrow="Models"
          title="Top by"
          accent="spend"
          rightMeta={data ? `${data.top_models.length} models active` : undefined}
        />
        {data?.top_models && data.top_models.length > 0 ? (
          <DataTable>
            <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,0.6fr)_minmax(0,0.6fr)] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
              <ColHead>Model</ColHead>
              <ColHead align="right">Requests</ColHead>
              <ColHead align="right">Spend</ColHead>
            </div>
            {data.top_models.map((m) => (
              <div
                key={m.model_id}
                className="grid grid-cols-[minmax(0,2fr)_minmax(0,0.6fr)_minmax(0,0.6fr)] gap-3 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors items-center"
              >
                <span className={`${MONO} text-[12.5px] text-white truncate`}>{m.model_id}</span>
                <span className={`${MONO} text-[11.5px] text-white/75 tabular-nums text-right`}>
                  {m.requests.toLocaleString()}
                </span>
                <span
                  style={SERIF_STYLE}
                  className="text-[15px] font-bold text-white tabular-nums text-right"
                >
                  {formatCents(m.spent_cents)}
                </span>
              </div>
            ))}
          </DataTable>
        ) : (
          <EmptyState title="No model activity" description="Once requests come in, top models will appear here." />
        )}
      </section>

      {/* Top API keys */}
      <section className="mb-14">
        <SectionHead
          eyebrow="API keys"
          title="Top by"
          accent="spend"
          rightMeta={
            data?.top_api_keys
              ? `${data.top_api_keys.length} key${data.top_api_keys.length === 1 ? '' : 's'} active`
              : undefined
          }
        />
        {data?.top_api_keys && data.top_api_keys.length > 0 ? (
          <DataTable>
            <div className="hidden md:grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.5fr)_minmax(0,0.6fr)_minmax(0,0.55fr)] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
              <ColHead>Key</ColHead>
              <ColHead>Preview</ColHead>
              <ColHead align="right">Requests</ColHead>
              <ColHead align="right">Spend</ColHead>
              <ColHead align="right">Cache hit</ColHead>
            </div>
            {data.top_api_keys.map((k) => {
              const hits = k.cache_l1_hits + k.cache_semantic_hits;
              const rate = k.cache_hit_rate;
              return (
                <div
                  key={k.id}
                  className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.5fr)_minmax(0,0.6fr)_minmax(0,0.55fr)] gap-3 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors items-center"
                >
                  <span className={`${MONO} text-[12.5px] text-white truncate`}>{k.name}</span>
                  <code className={`${MONO} text-[11px] text-white/55 truncate`}>{k.preview}</code>
                  <span className={`${MONO} text-[11.5px] text-white/75 tabular-nums text-right`}>
                    {k.requests.toLocaleString()}
                  </span>
                  <span
                    style={SERIF_STYLE}
                    className="text-[15px] font-bold text-white tabular-nums text-right"
                  >
                    {formatCents(k.spent_cents)}
                  </span>
                  <span
                    className={`${MONO} text-[11.5px] tabular-nums text-right`}
                    style={{ color: hits > 0 ? '#4ade80' : 'rgba(255,255,255,0.45)' }}
                    title={
                      hits > 0
                        ? `${hits.toLocaleString()} hits · L1 ${k.cache_l1_hits.toLocaleString()} / sem ${k.cache_semantic_hits.toLocaleString()}`
                        : 'No cache hits in this window'
                    }
                  >
                    {rate !== null ? `${(rate * 100).toFixed(1)}%` : '—'}
                  </span>
                </div>
              );
            })}
          </DataTable>
        ) : (
          <EmptyState
            title="No API-key activity"
            description="Once requests come in, top API keys will appear here."
          />
        )}
      </section>

      {/* Recent requests */}
      <section>
        <SectionHead
          eyebrow="Tail"
          title="Recent"
          accent="requests"
          rightMeta={data?.recent ? `${data.recent.length} most recent` : undefined}
        />
        {data?.recent && data.recent.length > 0 ? (
          <DataTable>
            <div className="hidden md:grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.6fr)_minmax(0,0.8fr)] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
              <ColHead>Time</ColHead>
              <ColHead>Model</ColHead>
              <ColHead align="right">Tokens in/out</ColHead>
              <ColHead align="right">Cost</ColHead>
              <ColHead align="right">Latency</ColHead>
              <ColHead>Status</ColHead>
            </div>
            {data.recent.map((r, i) => (
              <div
                key={i}
                className="grid grid-cols-1 gap-1 px-5 py-2.5 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors md:grid-cols-[minmax(0,0.7fr)_minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.6fr)_minmax(0,0.8fr)] md:items-center"
              >
                <span className={`${MONO} text-[11px] text-white/50 tabular-nums`}>
                  {new Date(r.created_at).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className={`${MONO} text-[11.5px] text-white/85 truncate`}>{r.model_id}</span>
                <span className={`${MONO} text-[11px] text-white/65 tabular-nums text-right`}>
                  {r.input_tokens ?? '—'} / {r.output_tokens ?? '—'}
                </span>
                <span className={`${MONO} text-[11.5px] text-white tabular-nums text-right`}>
                  {formatCents(r.cost_cents)}
                </span>
                <span className={`${MONO} text-[11px] text-white/65 tabular-nums text-right`}>
                  {r.latency_ms ? `${r.latency_ms}ms` : '—'}
                </span>
                <div className="inline-flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{
                      background: r.status === 'success' ? '#4ade80' : '#f87171',
                      boxShadow: `0 0 5px ${r.status === 'success' ? '#4ade80' : '#f87171'}`,
                    }}
                  />
                  <span
                    className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] font-semibold`}
                    style={{ color: r.status === 'success' ? '#4ade80' : '#f87171' }}
                  >
                    {r.status === 'success' ? 'OK' : 'Err'}
                  </span>
                  {r.billed_to === 'byok' && (
                    <span className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-[#0095FF] ml-1`}>
                      BYOK
                    </span>
                  )}
                  {r.cache_kind === 'l1' && (
                    <span
                      className={`${MONO} text-[10px] uppercase tracking-[0.12em] ml-1`}
                      style={{ color: '#a78bfa' }}
                      title="Served from L1 exact-match cache"
                    >
                      L1
                    </span>
                  )}
                  {r.cache_kind === 'semantic' && (
                    <span
                      className={`${MONO} text-[10px] uppercase tracking-[0.12em] ml-1`}
                      style={{ color: '#22d3ee' }}
                      title="Served from semantic (vector-similarity) cache"
                    >
                      SEM
                    </span>
                  )}
                </div>
              </div>
            ))}
          </DataTable>
        ) : (
          <EmptyState title="No recent requests" description="Requests will appear here as they arrive." />
        )}
      </section>
    </PageCanvas>
  );
}
