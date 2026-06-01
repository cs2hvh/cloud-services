'use client';

import { useState } from 'react';
import { Activity, RefreshCw, ShoppingCart, X, Check, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useBandwidth } from '@/hooks/use-app-bandwidth';
import { BANDWIDTH_PACK_LIST, type BandwidthPackId } from '@/lib/services/platform-app-bandwidth/packs';

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

// ── Purchase modal ─────────────────────────────────────────────────────────────

function PurchaseModal({ appId, onClose, onSuccess }: {
  appId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selected, setSelected] = useState<BandwidthPackId | null>(null);
  const [loading, setLoading] = useState(false);

  async function handlePurchase() {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await fetch('/api/services/platform-apps/bandwidth/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, pack: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Purchase failed');
      const pack = BANDWIDTH_PACK_LIST.find(p => p.id === selected)!;
      toast.success(`${pack.label} bandwidth added${data.restriction_lifted ? ' — traffic restored' : ''}`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Purchase failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-sm mx-4 bg-[#111] border border-white/[0.10] rounded-lg p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-white">Buy Bandwidth</p>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-white/40 mb-4 leading-relaxed">
          One-time bandwidth packs for this billing period. Deducted from your credit balance.
        </p>

        <div className="space-y-2 mb-5">
          {BANDWIDTH_PACK_LIST.map(pack => (
            <button
              key={pack.id}
              onClick={() => setSelected(pack.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded border text-sm transition-colors ${
                selected === pack.id
                  ? 'border-white/40 bg-white/[0.08] text-white'
                  : 'border-white/[0.08] bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white/80'
              }`}
            >
              <span className="font-medium">{pack.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-white/40 text-xs font-mono">${pack.price.toFixed(2)}</span>
                {selected === pack.id && <Check className="w-3.5 h-3.5 text-green-400" />}
              </div>
            </button>
          ))}
        </div>

        <Button
          onClick={handlePurchase}
          disabled={!selected || loading}
          className="w-full h-9 text-sm bg-white text-black hover:bg-white/90 disabled:opacity-40"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Purchase'}
        </Button>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function AppBandwidthCard({ appId, onManage }: Props) {
  const { data, loading, error, refetch, refresh } = useBandwidth(appId);
  const [showModal, setShowModal] = useState(false);
  const openPurchase = onManage ?? (() => setShowModal(true));

  const badge = data ? (LIFECYCLE_BADGE[data.lifecycleStatus] ?? LIFECYCLE_BADGE.ok) : null;
  const isRestricted = data?.lifecycleStatus === 'restricted';
  const isAtRisk = data?.lifecycleStatus === 'critical' || data?.lifecycleStatus === 'warning';

  return (
    <>
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
                {/* Usage header row — mirrors CPU/Memory pattern */}
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-white/40 flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5" /> Bandwidth Usage
                  </p>
                  <span className="text-sm font-mono text-white">
                    {data.percentUsed !== null ? `${data.percentUsed.toFixed(1)}%` : '—'}
                  </span>
                </div>

                {/* Total / quota label */}
                <p className="text-[11px] font-mono text-white/40 mb-2">
                  {fmtBytes(data.totalBytes)}
                  {data.quota.totalBytes && (
                    <span className="text-white/25"> / {fmtBytes(data.quota.totalBytes)}</span>
                  )}
                  {data.purchasedBytes > 0 && (
                    <span className="text-white/25"> · +{fmtBytes(data.purchasedBytes)} purchased</span>
                  )}
                </p>

                <Progress
                  value={Math.min(data.percentUsed ?? 0, 100)}
                  className={`h-2 bg-white/[0.06] ${progressColor(data.lifecycleStatus)}`}
                />

                {/* Ingress / Egress / Remaining — same sub-stat style as CPU details */}
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

              {/* Footer row */}
              <div className="flex items-center justify-between px-1">
                <button
                  onClick={openPurchase}
                  className={`text-[11px] flex items-center gap-1 transition-colors ${
                    isRestricted
                      ? 'text-red-400 hover:text-red-300'
                      : data.lifecycleStatus === 'overage'
                      ? 'text-purple-400 hover:text-purple-300'
                      : isAtRisk
                      ? 'text-yellow-400/80 hover:text-yellow-300'
                      : 'text-white/25 hover:text-white/50'
                  }`}
                >
                  <ShoppingCart className="w-3 h-3" />
                  {isRestricted ? 'Buy to restore traffic' : 'Buy more bandwidth'}
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
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-white/30">No usage recorded yet for this period.</p>
              <button
                onClick={openPurchase}
                className="text-[11px] text-white/25 hover:text-white/50 flex items-center gap-1 transition-colors shrink-0"
              >
                <ShoppingCart className="w-3 h-3" />
                Buy
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {showModal && (
        <PurchaseModal
          appId={appId}
          onClose={() => setShowModal(false)}
          onSuccess={refetch}
        />
      )}
    </>
  );
}
