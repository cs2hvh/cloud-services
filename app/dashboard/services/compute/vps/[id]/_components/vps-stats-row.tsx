'use client';

// VPS detail metric strip — 4 cards with mono label, Live pill,
// big value + unit, and inline sparkline/bar visualization, mono
// sub-line at the bottom. Matches the dashboard's editorial pattern.

import { type VMMetrics } from '@/hooks/use-vm-metrics';
import { type ServerData, formatBytes } from './types';

const SERIF_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-nunito), system-ui, sans-serif',
};
const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';

interface VpsStatsRowProps {
  server: ServerData;
  isRunning: boolean;
  vmMetrics: VMMetrics | null;
  memGB: number;
  monthlyCost: number;
}

interface Stat {
  label: string;
  value: string;
  unit?: string;
  sub: { left: string; right?: string };
  /** Sparkline bars (height 0-100). Optional. */
  spark?: number[];
  /** Single horizontal bar fill 0-100. Optional. */
  bar?: number;
  warn?: boolean;
  live?: boolean;
}

// Deterministic-ish bars for visual rhythm when we don't have history.
function pseudoSpark(seed: number, length = 15): number[] {
  const out: number[] = [];
  let s = seed * 1000;
  for (let i = 0; i < length; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    out.push(15 + Math.floor(r * 70));
  }
  return out;
}

export function VpsStatsRow({
  server,
  isRunning,
  vmMetrics: metrics,
  memGB,
  monthlyCost,
}: VpsStatsRowProps) {
  const live = isRunning && metrics;

  const stats: Stat[] = live
    ? [
        {
          label: 'CPU',
          value: metrics.cpu.toFixed(1),
          unit: '%',
          spark: pseudoSpark(metrics.cpu || 1),
          sub: { left: `${server.cpu_cores} vCPU allocated`, right: '15m' },
          warn: metrics.cpu > 80,
          live: true,
        },
        // Linode-backed servers never report memory usage. Showing "0 B of
        // 2.0 GB — 0%" on a working server is actively misleading, so surface
        // the allocation (which we do know) and say the usage isn't measured.
        server.provider === 'linode'
          ? {
              label: 'Memory',
              value: formatBytes(metrics.mem_total).split(' ')[0],
              unit: ' ' + formatBytes(metrics.mem_total).split(' ')[1],
              sub: { left: 'Allocated · usage not reported' },
              live: false,
            }
          : {
              label: 'Memory',
              value: formatBytes(metrics.mem_used).split(' ')[0],
              unit: ' ' + formatBytes(metrics.mem_used).split(' ')[1],
              bar: metrics.mem_pct,
              sub: { left: `of ${formatBytes(metrics.mem_total)}`, right: `${metrics.mem_pct.toFixed(0)}%` },
              warn: metrics.mem_pct > 85,
              live: true,
            },
        {
          label: 'Network',
          value: formatBytes(metrics.net_out).split(' ')[0],
          unit: ' ' + formatBytes(metrics.net_out).split(' ')[1],
          spark: pseudoSpark((metrics.net_out || 1) / 1024),
          sub: { left: 'Outbound' },
          live: true,
        },
        {
          label: 'Disk I/O',
          value: formatBytes(metrics.disk_read).split(' ')[0],
          unit: ' ' + formatBytes(metrics.disk_read).split(' ')[1],
          spark: pseudoSpark((metrics.disk_read || 1) / 1024),
          sub: { left: 'Read', right: 'NVMe' },
          live: true,
        },
      ]
    : [
        {
          label: 'vCPU',
          value: String(server.cpu_cores),
          sub: { left: 'Allocated cores' },
        },
        {
          label: 'Memory',
          value: String(memGB),
          unit: ' GB',
          sub: { left: 'Provisioned RAM' },
        },
        {
          label: 'Storage',
          value: String(server.disk_gb),
          unit: ' GB',
          sub: { left: 'NVMe attached' },
        },
        {
          label: 'Monthly',
          value: monthlyCost.toFixed(2),
          unit: ' $',
          sub: { left: 'Est. at 730 hrs' },
        },
      ];

  return (
    <div className="mt-2 mb-8 grid grid-cols-2 lg:grid-cols-4 gap-2">
      {stats.map((s) => (
        <div
          key={s.label}
          className="border border-white/[0.06] bg-[#111216] rounded-[5px] p-4 flex flex-col gap-2.5"
        >
          {/* Top: label + Live pill */}
          <div className="flex items-center justify-between">
            <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/45`}>
              {s.label}
            </span>
            {s.live && (
              <span className={`${MONO} inline-flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.12em] font-semibold text-emerald-300`}>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ boxShadow: '0 0 6px #4ade80' }} />
                Live
              </span>
            )}
          </div>

          {/* Big value */}
          <div className="flex items-baseline">
            <span
              style={SERIF_STYLE}
              className={`text-[30px] leading-none font-bold tabular-nums tracking-[-0.035em] ${
                s.warn ? 'text-amber-300' : 'text-white'
              }`}
            >
              {s.value}
            </span>
            {s.unit && (
              <span className={`${MONO} ml-1 text-[12px] text-white/45`}>{s.unit}</span>
            )}
          </div>

          {/* Sparkline bars or single bar */}
          {s.spark && s.spark.length > 0 && (
            <div className="h-8 flex items-end gap-[2px]">
              {s.spark.map((h, i) => (
                <div
                  key={i}
                  className="flex-1"
                  style={{
                    height: `${h}%`,
                    background: 'rgba(0,149,255,0.09)',
                    borderTop: `1.5px solid ${ACCENT}`,
                  }}
                />
              ))}
            </div>
          )}
          {typeof s.bar === 'number' && (
            <div className="h-[3px] overflow-hidden bg-white/[0.06] rounded-[2px]">
              <div
                className="h-full rounded-[2px] transition-all duration-500"
                style={{
                  width: `${Math.min(s.bar, 100)}%`,
                  background: s.warn ? '#fbbf24' : ACCENT,
                  boxShadow: s.warn ? 'none' : `0 0 8px rgba(0,149,255,0.4)`,
                }}
              />
            </div>
          )}

          {/* Sub line */}
          <div className={`${MONO} flex items-center justify-between text-[10.5px] text-white/40`}>
            <span>{s.sub.left}</span>
            {s.sub.right && <span className="text-white/75">{s.sub.right}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
