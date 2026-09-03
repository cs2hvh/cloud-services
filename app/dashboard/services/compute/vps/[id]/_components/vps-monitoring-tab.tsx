'use client';

import {
  Loader2,
  AlertTriangle,
  BarChart3,
  HardDrive,
  ArrowUpDown,
  RefreshCw,
} from 'lucide-react';
import { type ServerData, formatBytes } from './types';
import { type VMMetrics, type VMMetricsHistoryPoint } from '@/hooks/use-vm-metrics';

interface VpsMonitoringTabProps {
  server: ServerData;
  isRunning: boolean;
  metrics: VMMetrics | null;
  history: VMMetricsHistoryPoint[];
  loading: boolean;
  error: string | null;
  onRefetch: () => void;
}

export function VpsMonitoringTab({
  server,
  isRunning,
  metrics: met,
  history: hist,
  loading,
  error,
  onRefetch,
}: VpsMonitoringTabProps) {
  if (!isRunning) {
    return (
      <div className="border border-white/[0.06] bg-[#111216] p-16 text-center">
        <BarChart3 className="mx-auto h-10 w-10 text-white/15 mb-4" />
        <p className="text-white/40 text-sm">Start the server to view real-time metrics</p>
      </div>
    );
  }

  if (loading && !met) {
    return (
      <div className="border border-white/[0.06] bg-[#111216] p-16 text-center">
        <Loader2 className="mx-auto h-8 w-8 text-white/20 animate-spin mb-4" />
        <p className="text-white/30 text-sm">Loading metrics…</p>
      </div>
    );
  }

  if (error && !met) {
    return (
      <div className="border border-white/[0.06] bg-[#111216] p-16 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-400/50 mb-4" />
        <p className="text-white/40 text-sm mb-3">{error}</p>
        <button onClick={onRefetch} className="text-xs text-[#0095FF] hover:text-[#0095FF] transition-colors">Retry</button>
      </div>
    );
  }

  if (!met) return null;

  // Linode-backed servers report CPU, network and a single combined I/O series
  // only — memory and a separate disk-write figure are never exposed. Rendering
  // those as a hard 0 reads as "this server uses no memory", which is worse
  // than admitting the number isn't available.
  const memoryUnavailable = server.provider === 'linode';

  const gauges = [
    { label: 'CPU', value: met.cpu, unit: '%', color: met.cpu > 80 ? '#ef4444' : met.cpu > 50 ? '#f59e0b' : '#06b6d4', unavailable: false },
    { label: 'Memory', value: met.mem_pct, unit: '%', color: met.mem_pct > 85 ? '#ef4444' : met.mem_pct > 60 ? '#f59e0b' : '#3b82f6', unavailable: memoryUnavailable },
  ];
  const ioCards = [
    { label: 'Network In', value: formatBytes(met.net_in), icon: ArrowUpDown, color: 'text-violet-400', unavailable: false },
    { label: 'Network Out', value: formatBytes(met.net_out), icon: ArrowUpDown, color: 'text-purple-400', unavailable: false },
    { label: memoryUnavailable ? 'Disk I/O' : 'Disk Read', value: formatBytes(met.disk_read), icon: HardDrive, color: 'text-emerald-400', unavailable: false },
    { label: 'Disk Write', value: formatBytes(met.disk_write), icon: HardDrive, color: 'text-teal-400', unavailable: memoryUnavailable },
  ];

  return (
    <div className="space-y-6">
      {/* Auto-refresh indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] text-white/30 font-medium uppercase tracking-wider">Live · 15s refresh</span>
        </div>
        <button onClick={onRefetch} className="text-[11px] text-white/30 hover:text-white/60 transition-colors flex items-center gap-1.5">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* CPU & Memory Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {gauges.map((g) => {
          const r = 54;
          const circ = 2 * Math.PI * r;
          const offset = circ - (Math.min(g.value, 100) / 100) * circ;
          return (
            <div key={g.label} className="border border-white/[0.06] bg-[#111216] p-6 flex items-center gap-6">
              <div className="relative flex-shrink-0">
                <svg width="128" height="128" viewBox="0 0 128 128">
                  <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                  <circle
                    cx="64" cy="64" r={r} fill="none"
                    stroke={g.color} strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={circ} strokeDashoffset={g.unavailable ? circ : offset}
                    transform="rotate(-90 64 64)"
                    style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-white tabular-nums">
                    {g.unavailable ? '—' : g.value.toFixed(1)}
                  </span>
                  {!g.unavailable && (
                    <span className="text-[10px] text-white/30 font-semibold uppercase">{g.unit}</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-white mb-1">{g.label} Usage</p>
                {g.label === 'Memory' && (
                  g.unavailable ? (
                    <p className="text-xs text-white/30">
                      Not reported for this server type — check inside the server with{' '}
                      <span className="font-mono text-white/40">free -h</span>
                    </p>
                  ) : (
                    <p className="text-xs text-white/30">{formatBytes(met.mem_used)} / {formatBytes(met.mem_total)}</p>
                  )
                )}
                {g.label === 'CPU' && (
                  <p className="text-xs text-white/30">{server.cpu_cores} vCPU cores</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* I/O Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ioCards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="border border-white/[0.06] bg-[#111216] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`h-3.5 w-3.5 ${c.color}`} />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">{c.label}</p>
              </div>
              <p className="text-lg font-bold text-white tabular-nums">
                {c.unavailable ? '—' : c.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* History Sparklines — absent for the first few minutes after a boot,
          which otherwise renders as an unexplained gap in the page. */}
      {hist.length <= 1 && (
        <div className="border border-white/[0.06] bg-[#111216] p-6 text-center">
          <p className="text-white/40 text-sm">Usage history is still being collected.</p>
          <p className="text-white/25 text-xs mt-1">
            Charts appear a few minutes after a server starts.
          </p>
        </div>
      )}
      {hist.length > 1 && (
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/30">Usage History (Last Hour)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([
              { key: 'cpu' as const, label: 'CPU %', color: '#06b6d4', max: 100 },
              // Memory is never reported for Linode-backed servers, so its
              // series is a flat line at zero — drop it rather than draw a
              // chart that looks like real measured data.
              ...(memoryUnavailable
                ? []
                : [{ key: 'mem_pct' as const, label: 'Memory %', color: '#3b82f6', max: 100 }]),
              { key: 'net_in' as const, label: 'Network In', color: '#8b5cf6', max: null },
              { key: 'net_out' as const, label: 'Network Out', color: '#a855f7', max: null },
            ]).map((chart) => {
              const values = hist.map((h) => h[chart.key] ?? 0);
              const maxVal = chart.max ?? Math.max(...values, 1);
              const w = 400;
              const h2 = 64;
              const points = values.map((v, i) => {
                const x = (i / (values.length - 1)) * w;
                const y = h2 - (Math.min(v, maxVal) / maxVal) * (h2 - 4);
                return `${x},${y}`;
              }).join(' ');
              const areaPoints = `0,${h2} ${points} ${w},${h2}`;
              return (
                <div key={chart.key} className="border border-white/[0.06] bg-[#111216] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">{chart.label}</p>
                    <p className="text-xs font-bold text-white tabular-nums">
                      {chart.max !== null ? `${values[values.length - 1]?.toFixed(1)}%` : formatBytes(values[values.length - 1] ?? 0)}
                    </p>
                  </div>
                  <svg viewBox={`0 0 ${w} ${h2}`} className="w-full" preserveAspectRatio="none" style={{ height: 64 }}>
                    <defs>
                      <linearGradient id={`grad-${chart.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chart.color} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={chart.color} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <polygon points={areaPoints} fill={`url(#grad-${chart.key})`} />
                    <polyline points={points} fill="none" stroke={chart.color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  </svg>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* System Info */}
      <div className="border border-white/[0.06] bg-[#111216] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/30 mb-3">System Status</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-white/25 uppercase tracking-wider mb-1">Status</p>
            <p className="text-sm font-semibold text-white capitalize">{met.status}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/25 uppercase tracking-wider mb-1">Uptime</p>
            <p className="text-sm font-semibold text-white tabular-nums">
              {/* Linode does not expose uptime — a hard "0h 0m" on a server
                  that has been up for days is worse than saying nothing. */}
              {memoryUnavailable ? (
                <span className="text-white/40">Not reported</span>
              ) : (
                <>
                  {met.uptime > 86400 ? `${Math.floor(met.uptime / 86400)}d ` : ''}
                  {Math.floor((met.uptime % 86400) / 3600)}h {Math.floor((met.uptime % 3600) / 60)}m
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
