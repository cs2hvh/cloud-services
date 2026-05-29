'use client';

// Resize section (Linode-style) — change a server's plan in place. Lists the
// plans that fit on the server's current host (capacity-checked server-side;
// disk can only grow), and on confirm power-cycles + re-rates billing.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Check, AlertTriangle, RefreshCw, PowerOff } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { type ServerData } from './types';

const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';
const ACCENT_BRIGHT = '#33adff';
const ACCENT_DIM = 'rgba(0,149,255,0.08)';

interface ResizePlan {
  slug: string;
  name: string;
  tier: 'shared' | 'dedicated';
  vcpu: number;
  memoryMB: number;
  diskGB: number;
  hourlyUSD: number;
  monthlyUSD: number;
  isCurrent: boolean;
  fits: boolean;
  reason?: string;
}

interface ResizeData {
  current: { planSlug: string | null; vcpu: number; memoryMB: number; diskGB: number; tier: string };
  plans: ResizePlan[];
}

function ramGb(mb: number) {
  return mb % 1024 === 0 ? mb / 1024 : (mb / 1024).toFixed(1);
}
function money(n: number) {
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
}

export function VpsResizeSection({ server }: { server: ServerData }) {
  const [data, setData] = useState<ResizeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [powering, setPowering] = useState(false);
  const [tier, setTier] = useState<'shared' | 'dedicated'>('shared');
  const [supabase] = useState(() => createClient());

  const busy = server.status === 'provisioning';
  const needsPowerOff = server.status === 'running' || server.status === 'suspended';
  const isStopped = server.status === 'stopped';

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data: s } = await supabase.auth.getSession();
    const token = s?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/services/compute/vms/${server.id}/resize`, { headers });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to load plans');
      setData({ current: json.current, plans: json.plans });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load resize options');
    } finally {
      setLoading(false);
    }
  }, [server.id, authHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  // Default the tier toggle to the server's current tier once plans load.
  const currentTier = data?.current.tier;
  useEffect(() => {
    if (currentTier === 'shared' || currentTier === 'dedicated') setTier(currentTier);
  }, [currentTier]);

  const selectedPlan = data?.plans.find((p) => p.slug === selected) ?? null;

  const submit = async () => {
    if (!selectedPlan) return;
    setSubmitting(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/services/compute/vms/${server.id}/resize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ planSlug: selectedPlan.slug }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || 'Resize failed');
      toast.success('Resize started — your server will reboot and come back on the new plan.');
      setSelected('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Resize failed');
    } finally {
      setSubmitting(false);
    }
  };

  const powerOff = async () => {
    setPowering(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/services/compute/vms/power', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ serverId: server.id, action: 'stop' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to power off');
      toast.success('Powering off — plans will appear once the server stops.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to power off');
    } finally {
      setPowering(false);
    }
  };

  // Non-current plans of the selected tier, laddered by size (matches the
  // create form). Non-fitting plans stay visible but greyed, with a reason.
  const visible = (data?.plans ?? [])
    .filter((p) => !p.isCurrent && p.tier === tier)
    .sort((a, b) => a.vcpu - b.vcpu || a.memoryMB - b.memoryMB);

  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
      {busy ? (
        <div className={`${MONO} flex items-center gap-2.5 px-5 py-6 text-[12px] text-white/55`}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: ACCENT }} />
          A resize or provisioning operation is in progress. Plans will be
          available again once it finishes.
        </div>
      ) : needsPowerOff ? (
        <div className="px-5 py-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-9 w-9 shrink-0 flex items-center justify-center border border-white/[0.08] bg-[#0d0e11] rounded-[6px]">
              <PowerOff className="h-4 w-4 text-white/55" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-white">Power off to resize</p>
              <p className={`${MONO} mt-1 text-[11px] text-white/55 leading-relaxed`}>
                Changing CPU, memory, or storage requires the server to be
                powered off. Stop it first, then choose a new plan.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={powerOff}
            disabled={powering}
            className={`${MONO} inline-flex h-9 items-center gap-2 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all disabled:opacity-50`}
            style={{ background: ACCENT, color: '#001930' }}
            onMouseEnter={(e) => { if (!powering) e.currentTarget.style.background = ACCENT_BRIGHT; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = ACCENT; }}
          >
            {powering ? <Loader2 className="h-3 w-3 animate-spin" /> : <PowerOff className="h-3.5 w-3.5" />}
            Power off server
          </button>
        </div>
      ) : loading ? (
        <div className={`${MONO} flex items-center gap-2.5 px-5 py-6 text-[12px] text-white/45`}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading plans…
        </div>
      ) : error ? (
        <div className="px-5 py-6">
          <p className={`${MONO} text-[12px] text-amber-200/85`}>{error}</p>
          <button
            type="button"
            onClick={load}
            className={`${MONO} mt-3 inline-flex items-center gap-1.5 h-8 px-3 text-[10.5px] uppercase tracking-[0.12em] text-white/65 hover:text-white border border-white/[0.08] hover:bg-white/[0.04] rounded-[4px] transition-colors`}
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      ) : !isStopped ? (
        <div className={`${MONO} px-5 py-6 text-[12px] text-white/45`}>
          Resize is unavailable while the server is {server.status}.
        </div>
      ) : (
        <>
          {/* Current plan banner */}
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-white/[0.06] bg-white/[0.015]">
            <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40`}>
              Current
            </span>
            <span className={`${MONO} text-[11.5px] text-white/80 tabular-nums`}>
              {data?.current.planSlug ? `${data.current.planSlug} · ` : ''}
              {data?.current.vcpu} vCPU
              <span className="text-white/25"> · </span>
              {ramGb(data?.current.memoryMB ?? 0)} GB
              <span className="text-white/25"> · </span>
              {data?.current.diskGB} GB
            </span>
          </div>

          {/* Tier toggle — keep shared and dedicated plans separate */}
          <div className="flex items-center gap-0.5 px-5 py-2.5 border-b border-white/[0.06]">
            {(['shared', 'dedicated'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTier(t);
                  setSelected('');
                }}
                className={`${MONO} text-[10px] uppercase tracking-[0.12em] font-semibold px-3 h-7 rounded-[4px] transition-colors`}
                style={
                  tier === t
                    ? { color: ACCENT, background: ACCENT_DIM, border: '1px solid rgba(0,149,255,0.25)' }
                    : { color: 'rgba(255,255,255,0.5)', border: '1px solid transparent' }
                }
              >
                {t === 'shared' ? 'Shared CPU' : 'Dedicated CPU'}
              </button>
            ))}
          </div>

          {/* Plan rows */}
          <div className="max-h-[360px] overflow-y-auto">
            {visible.length === 0 ? (
              <div className={`${MONO} px-5 py-6 text-[11px] text-white/40`}>
                No {tier === 'shared' ? 'shared' : 'dedicated'} plans available to switch to.
              </div>
            ) : (
              visible.map((p) => {
              const sel = selected === p.slug;
              const disabled = !p.fits;
              return (
                <button
                  type="button"
                  key={p.slug}
                  disabled={disabled}
                  onClick={() => setSelected(sel ? '' : p.slug)}
                  className="relative w-full text-left grid grid-cols-[22px_minmax(46px,64px)_minmax(0,1.2fr)_minmax(52px,0.6fr)_minmax(64px,0.7fr)_minmax(64px,0.7fr)_minmax(90px,130px)] gap-3 px-5 py-2.5 items-center border-b border-white/[0.04] last:border-b-0 transition-colors disabled:cursor-not-allowed"
                  style={{
                    background: sel ? ACCENT_DIM : 'transparent',
                    opacity: disabled ? 0.4 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!sel && !disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                  }}
                  onMouseLeave={(e) => {
                    if (!sel) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {sel && (
                    <span className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: ACCENT }} />
                  )}
                  <span
                    aria-hidden
                    className="relative h-[15px] w-[15px] rounded-full shrink-0"
                    style={{ border: `1.5px solid ${sel ? ACCENT : 'rgba(255,255,255,0.18)'}` }}
                  >
                    {sel && (
                      <span
                        className="absolute inset-[3px] rounded-full block"
                        style={{ background: ACCENT, boxShadow: '0 0 6px rgba(0,149,255,0.6)' }}
                      />
                    )}
                  </span>
                  <span className={`${MONO} text-[11.5px] text-white/80`}>{p.slug}</span>
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-[12.5px] text-white truncate">{p.name}</span>
                    {p.tier === 'dedicated' && (
                      <span
                        className={`${MONO} text-[8.5px] font-semibold uppercase tracking-[0.1em] border border-amber-400/25 bg-amber-400/[0.06] text-amber-300 px-1 py-px rounded-[3px] shrink-0`}
                      >
                        Ded
                      </span>
                    )}
                    {disabled && p.reason && (
                      <span className={`${MONO} text-[9px] text-white/40 truncate`}>· {p.reason}</span>
                    )}
                  </span>
                  <span className={`${MONO} text-right text-[12px] text-white/85 tabular-nums`}>
                    {p.vcpu}
                  </span>
                  <span className={`${MONO} text-right text-[12px] text-white/85 tabular-nums`}>
                    {ramGb(p.memoryMB)}
                    <span className="text-white/35 text-[10px]"> GB</span>
                  </span>
                  <span className={`${MONO} text-right text-[11.5px] text-white/60 tabular-nums`}>
                    {p.diskGB}
                    <span className="text-white/35 text-[10px]"> GB</span>
                  </span>
                  <span className="text-right tabular-nums">
                    <span className="text-[13px] text-white font-semibold">${money(p.monthlyUSD)}</span>
                    <span className={`${MONO} text-[9.5px] text-white/35`}> /mo</span>
                  </span>
                </button>
              );
              })
            )}
          </div>

          {/* Confirm bar */}
          {selectedPlan && (
            <div
              className="px-5 py-4 border-t"
              style={{ borderColor: 'rgba(0,149,255,0.18)', background: 'rgba(0,149,255,0.04)' }}
            >
              <div className="flex items-start gap-2.5 mb-3">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: ACCENT_BRIGHT }} />
                <p className={`${MONO} text-[11px] text-white/70 leading-relaxed`}>
                  Resizing to <span className="text-white font-semibold">{selectedPlan.name}</span>{' '}
                  ({selectedPlan.vcpu} vCPU · {ramGb(selectedPlan.memoryMB)} GB ·{' '}
                  {selectedPlan.diskGB} GB). Your server stays powered off — start it
                  again when ready. Billing changes to{' '}
                  <span className="text-white font-semibold">${money(selectedPlan.monthlyUSD)}/mo</span>.
                  Storage can only grow, never shrink.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting}
                  className={`${MONO} inline-flex h-9 items-center gap-2 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all disabled:opacity-50`}
                  style={{ background: ACCENT, color: '#001930' }}
                  onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.background = ACCENT_BRIGHT; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = ACCENT; }}
                >
                  {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Resize server
                </button>
                <button
                  type="button"
                  onClick={() => setSelected('')}
                  disabled={submitting}
                  className={`${MONO} h-9 px-3.5 border border-white/[0.08] bg-transparent text-[11px] uppercase tracking-[0.14em] text-white/55 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors disabled:opacity-50`}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
