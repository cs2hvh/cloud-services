'use client';

import { Activity, RefreshCw, ArrowUpCircle } from 'lucide-react';
import { useBandwidth } from '@/hooks/use-app-bandwidth';

// ─── Design tokens (match app-overview-tab / compute / database) ────
const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const SERIF_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-nunito), system-ui, sans-serif',
};
const ACCENT = '#0095FF';

interface Props {
  appId: string;
  onManage?: () => void;
}

function fmtBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return `${v.toFixed(u <= 1 ? 0 : 1)} ${units[u]}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const LIFECYCLE_BADGE: Record<string, { label: string; color: string }> = {
  ok:         { label: 'OK',         color: '#4ade80' },
  warning:    { label: 'Warning',    color: '#fbbf24' },
  critical:   { label: 'Critical',   color: '#fb923c' },
  overage:    { label: 'Overage',    color: '#c084fc' },
  restricted: { label: 'Restricted', color: '#f87171' },
};

function barColor(lifecycle: string): string {
  switch (lifecycle) {
    case 'warning':    return '#fbbf24';
    case 'critical':   return '#fb923c';
    case 'overage':    return '#c084fc';
    case 'restricted': return '#f87171';
    default:           return ACCENT;
  }
}

export function AppBandwidthCard({ appId, onManage }: Props) {
  const { data, loading, error, refresh } = useBandwidth(appId);

  const badge = data ? (LIFECYCLE_BADGE[data.lifecycleStatus] ?? LIFECYCLE_BADGE.ok) : null;
  const isRestricted = data?.lifecycleStatus === 'restricted';
  const isAtRisk = data?.lifecycleStatus === 'critical' || data?.lifecycleStatus === 'warning';
  const fill = data ? barColor(data.lifecycleStatus) : ACCENT;
  const pct = data ? Math.min(data.percentUsed ?? 0, 100) : 0;

  return (
    <section className="rounded-[8px] border border-white/[0.06] bg-[#111216] overflow-hidden">
      <header className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3.5">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-white/[0.08] bg-[#0d0e11]" style={{ color: ACCENT }}>
          <Activity className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-white">Bandwidth</h3>
        {data && (
          <span className={`${MONO} text-[10px] uppercase tracking-[0.1em] text-white/30`}>
            {fmtDate(data.periodStart)} – {fmtDate(data.periodEnd)}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2.5">
          {badge && (
            <span
              className={`${MONO} inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]`}
              style={{ color: badge.color, background: `${badge.color}1a`, borderColor: `${badge.color}40` }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: badge.color }} />
              {badge.label}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="text-white/25 transition-colors hover:text-white/70 disabled:opacity-40"
            title="Refresh bandwidth"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="space-y-4 p-5">
        {error && <p className="text-[12px] text-red-400/80">{error}</p>}

        {!error && data && (
          <>
            <div className="rounded-[6px] border border-white/[0.06] bg-[#0d0e11] px-4 py-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className={`${MONO} inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-white/45`}>
                  <Activity className="h-3.5 w-3.5" /> Bandwidth Usage
                </span>
                <span style={SERIF_STYLE} className="text-[16px] font-bold tabular-nums tracking-[-0.02em] text-white">
                  {data.percentUsed !== null ? `${data.percentUsed.toFixed(1)}%` : '—'}
                </span>
              </div>

              <p className={`${MONO} mb-2.5 text-[11px] text-white/45`}>
                {fmtBytes(data.totalBytes)}
                {data.quota.totalBytes && (
                  <span className="text-white/25"> / {fmtBytes(data.quota.totalBytes)}</span>
                )}
              </p>

              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: fill, boxShadow: pct > 2 ? `0 0 8px ${fill}` : 'none' }}
                />
              </div>

              <div className={`${MONO} mt-3.5 grid grid-cols-3 gap-2 text-[11px]`}>
                <div>
                  <p className="mb-1 text-[9.5px] uppercase tracking-[0.12em] text-white/35">Ingress</p>
                  <p className="text-white/70">{fmtBytes(data.ingressBytes)}</p>
                </div>
                <div>
                  <p className="mb-1 text-[9.5px] uppercase tracking-[0.12em] text-white/35">Egress</p>
                  <p className="text-white/70">{fmtBytes(data.egressBytes)}</p>
                </div>
                <div>
                  <p className="mb-1 text-[9.5px] uppercase tracking-[0.12em] text-white/35">Remaining</p>
                  <p className="text-white/70">{data.quota.totalBytes ? fmtBytes(data.remainingBytes) : 'Unlimited'}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-0.5">
              <button
                onClick={onManage}
                className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.1em] transition-colors ${
                  isRestricted
                    ? 'text-red-400 hover:text-red-300'
                    : isAtRisk
                    ? 'text-amber-400/80 hover:text-amber-300'
                    : 'text-white/30 hover:text-white/60'
                }`}
              >
                <ArrowUpCircle className="h-3.5 w-3.5" />
                {isRestricted ? 'Upgrade plan to restore traffic' : 'Upgrade plan'}
              </button>

              {data.lastSampledAt && (
                <p className={`${MONO} text-[10px] text-white/25`}>
                  {new Date(data.lastSampledAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          </>
        )}

        {!error && !data && !loading && (
          <p className={`${MONO} text-[11px] uppercase tracking-[0.12em] text-white/30`}>No usage recorded yet for this period.</p>
        )}
      </div>
    </section>
  );
}
