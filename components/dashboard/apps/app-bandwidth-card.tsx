'use client';

import { Activity, RefreshCw, ArrowUpCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useBandwidth } from '@/hooks/use-app-bandwidth';

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

const LIFECYCLE_BADGE: Record<string, { label: string; className: string }> = {
  ok:         { label: 'OK',         className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  warning:    { label: 'Warning',    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  critical:   { label: 'Critical',   className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  overage:    { label: 'Overage',    className: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  restricted: { label: 'Restricted', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

function progressColor(lifecycle: string): string {
  switch (lifecycle) {
    case 'warning':    return '[&>div]:bg-yellow-400';
    case 'critical':   return '[&>div]:bg-orange-400';
    case 'overage':    return '[&>div]:bg-purple-400';
    case 'restricted': return '[&>div]:bg-red-500';
    default:           return '[&>div]:bg-green-500';
  }
}

export function AppBandwidthCard({ appId, onManage }: Props) {
  const { data, loading, error, refresh } = useBandwidth(appId);

  const badge = data ? (LIFECYCLE_BADGE[data.lifecycleStatus] ?? LIFECYCLE_BADGE.ok) : null;
  const isRestricted = data?.lifecycleStatus === 'restricted';
  const isAtRisk = data?.lifecycleStatus === 'critical' || data?.lifecycleStatus === 'warning';

  return (
    <Card className="border border-white/[0.06] bg-[#111216] rounded-[6px] shadow-none">
      <CardHeader className="border-b border-white/[0.06]">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Bandwidth
          {data && (
            <span className="text-sm font-normal text-white/30">
              {fmtDate(data.periodStart)} – {fmtDate(data.periodEnd)}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {badge && (
              <Badge className={`rounded-none text-[10px] px-1.5 py-0 border ${badge.className}`}>
                {badge.label}
              </Badge>
            )}
            <button
              onClick={refresh}
              disabled={loading}
              className="text-white/20 hover:text-white/60 transition-colors disabled:opacity-40"
              title="Refresh bandwidth"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-5 space-y-4">
        {error && (
          <p className="text-sm text-red-400/70">{error}</p>
        )}

        {!error && data && (
          <>
            <div className="border border-white/[0.08] bg-white/[0.03] px-4 py-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-white/40 flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5" /> Bandwidth Usage
                </p>
                <span className="text-sm font-mono text-white">
                  {data.percentUsed !== null ? `${data.percentUsed.toFixed(1)}%` : '—'}
                </span>
              </div>

              <p className="text-[11px] font-mono text-white/40 mb-2">
                {fmtBytes(data.totalBytes)}
                {data.quota.totalBytes && (
                  <span className="text-white/25"> / {fmtBytes(data.quota.totalBytes)}</span>
                )}
              </p>

              <Progress
                value={Math.min(data.percentUsed ?? 0, 100)}
                className={`h-2 bg-white/[0.06] ${progressColor(data.lifecycleStatus)}`}
              />

              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] font-mono text-white/40">
                <div>
                  <p className="text-white/25 mb-0.5">Ingress</p>
                  <p>{fmtBytes(data.ingressBytes)}</p>
                </div>
                <div>
                  <p className="text-white/25 mb-0.5">Egress</p>
                  <p>{fmtBytes(data.egressBytes)}</p>
                </div>
                <div>
                  <p className="text-white/25 mb-0.5">Remaining</p>
                  <p>{data.quota.totalBytes ? fmtBytes(data.remainingBytes) : 'Unlimited'}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-1">
              <button
                onClick={onManage}
                className={`text-[11px] flex items-center gap-1 transition-colors ${
                  isRestricted
                    ? 'text-red-400 hover:text-red-300'
                    : isAtRisk
                    ? 'text-yellow-400/80 hover:text-yellow-300'
                    : 'text-white/25 hover:text-white/50'
                }`}
              >
                <ArrowUpCircle className="w-3 h-3" />
                {isRestricted ? 'Upgrade plan to restore traffic' : 'Upgrade plan'}
              </button>

              {data.lastSampledAt && (
                <p className="text-[10px] text-white/20">
                  {new Date(data.lastSampledAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          </>
        )}

        {!error && !data && !loading && (
          <p className="text-sm text-white/30">No usage recorded yet for this period.</p>
        )}
      </CardContent>
    </Card>
  );
}
