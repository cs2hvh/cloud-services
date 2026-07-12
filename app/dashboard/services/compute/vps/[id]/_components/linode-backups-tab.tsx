'use client';

// Backups tab (Linode-backed servers) — enable card with live pricing,
// manual snapshot, automatic backup list with restore, and cancel (danger).

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  DatabaseBackup,
  History,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { type ServerData } from './types';

const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';

interface BackupEntry {
  id: number;
  label: string | null;
  status: string;
  type: 'auto' | 'snapshot';
  created: string;
  finished: string | null;
  disks: Array<{ label: string; size: number; filesystem: string }>;
}

interface BackupsPayload {
  ok: boolean;
  enabled: boolean;
  backups: {
    automatic: BackupEntry[];
    snapshot: { current: BackupEntry | null; in_progress: BackupEntry | null };
  };
  pricing: { hourlyUSD: number | null; monthlyUSD: number | null };
  error?: string;
}

export function LinodeBackupsTab({ server }: { server: ServerData }) {
  const [data, setData] = useState<BackupsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<BackupEntry | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const fetchBackups = useCallback(async () => {
    try {
      const res = await fetch(`/api/services/compute/vms/${server.id}/backups`, {
        cache: 'no-store',
      });
      const json = (await res.json()) as BackupsPayload;
      if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to load backups');
      setData(json);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load backups');
    } finally {
      setLoading(false);
    }
  }, [server.id]);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  const act = async (action: string, extra?: Record<string, unknown>, success?: string) => {
    setActing(action);
    try {
      const res = await fetch(`/api/services/compute/vms/${server.id}/backups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(extra ?? {}) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || 'Backup operation failed');
      if (success) toast.success(success);
      await fetchBackups();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Backup operation failed');
    } finally {
      setActing(null);
      setConfirmRestore(null);
      setConfirmCancel(false);
    }
  };

  if (loading) {
    return (
      <div className="border border-white/[0.06] bg-[#111216] p-16 flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-white/30 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="border border-white/[0.06] bg-[#111216] p-16 text-center">
        <p className="text-sm text-white/40">Unable to load backups. Refresh to retry.</p>
      </div>
    );
  }

  /* ── Disabled: enable card ── */
  if (!data.enabled) {
    return (
      <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-10 flex flex-col items-center text-center">
        <div className="h-14 w-14 rounded-xl border border-white/[0.08] bg-white/[0.03] flex items-center justify-center mb-4">
          <DatabaseBackup className="h-6 w-6 text-white/30" />
        </div>
        <p className="text-[15px] font-semibold text-white">Backups are off</p>
        <p className={`${MONO} text-[11.5px] text-white/40 mt-2 mb-1 max-w-md leading-relaxed`}>
          Automatic daily, weekly, and biweekly backups plus manual snapshots —
          restore your entire server to any of them in a couple of clicks.
        </p>
        {data.pricing.monthlyUSD != null && (
          <p className={`${MONO} text-[12px] text-white/60 mb-5`}>
            ${data.pricing.monthlyUSD.toFixed(2)}/mo
            <span className="text-white/35"> · ${data.pricing.hourlyUSD?.toFixed(3)}/hr, added to your server rate</span>
          </p>
        )}
        <button
          type="button"
          disabled={acting !== null}
          onClick={() => act('enable', {}, 'Backups enabled')}
          className={`${MONO} inline-flex items-center gap-2 h-10 px-5 text-[11px] uppercase tracking-[0.14em] font-semibold rounded-[5px] text-white transition-colors disabled:opacity-50`}
          style={{ background: ACCENT }}
        >
          {acting === 'enable' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          Enable backups
        </button>
      </div>
    );
  }

  /* ── Enabled: snapshot + list + cancel ── */
  const snapshot = data.backups.snapshot;
  const entries: BackupEntry[] = [
    ...(snapshot.in_progress ? [snapshot.in_progress] : []),
    ...(snapshot.current ? [snapshot.current] : []),
    ...data.backups.automatic,
  ];

  return (
    <div className="space-y-5">
      {/* Snapshot card */}
      <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 shrink-0 flex items-center justify-center border border-white/[0.08] bg-white/[0.03] rounded-[5px]">
            <Camera className="h-4 w-4 text-white/50" />
          </div>
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-white">Manual snapshot</p>
            <p className={`${MONO} text-[11px] text-white/40 mt-0.5`}>
              One snapshot slot — taking a new one replaces the previous snapshot.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={acting !== null || !!snapshot.in_progress}
          onClick={() => act('snapshot', {}, 'Snapshot started')}
          className={`${MONO} shrink-0 inline-flex items-center gap-2 h-9 px-4 border border-white/[0.1] bg-[#0d0e11] text-[11px] uppercase tracking-[0.14em] text-white/80 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors disabled:opacity-40`}
        >
          {acting === 'snapshot' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
          {snapshot.in_progress ? 'Snapshot in progress…' : 'Take snapshot'}
        </button>
      </div>

      {/* Backup list */}
      <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-white/35" />
          <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45`}>
            Restore points
          </span>
        </div>
        {entries.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className={`${MONO} text-[11.5px] text-white/35`}>
              No backups yet — the first automatic backup lands within 24 hours.
            </p>
          </div>
        ) : (
          entries.map((b) => {
            const sizeMB = b.disks?.reduce((acc, d) => acc + (d.size || 0), 0) ?? 0;
            const pending = b.status !== 'successful';
            return (
              <div
                key={`${b.type}-${b.id}`}
                className="px-5 py-3.5 border-b border-white/[0.04] last:border-b-0 flex items-center justify-between gap-4 flex-wrap hover:bg-white/[0.015] transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] font-medium text-white truncate">
                      {b.label || (b.type === 'snapshot' ? 'Manual snapshot' : 'Automatic backup')}
                    </span>
                    <span
                      className={`${MONO} text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-[3px] border ${
                        b.type === 'snapshot'
                          ? 'text-sky-300/90 border-sky-400/25'
                          : 'text-white/45 border-white/[0.12]'
                      }`}
                    >
                      {b.type}
                    </span>
                    {pending && (
                      <span className={`${MONO} text-[9px] uppercase tracking-[0.1em] text-amber-300/90`}>
                        {b.status}
                      </span>
                    )}
                  </div>
                  <p className={`${MONO} text-[10.5px] text-white/35 mt-1`}>
                    {new Date(b.created).toLocaleString()}
                    {sizeMB > 0 && ` · ${(sizeMB / 1024).toFixed(1)} GB`}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={acting !== null || pending}
                  onClick={() => setConfirmRestore(b)}
                  className={`${MONO} shrink-0 inline-flex items-center gap-1.5 h-8 px-3 border border-white/[0.1] bg-transparent text-[10.5px] uppercase tracking-[0.12em] text-white/70 hover:text-white hover:bg-white/[0.04] rounded-[4px] transition-colors disabled:opacity-30`}
                >
                  <RotateCcw className="h-3 w-3" />
                  Restore
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Cancel (danger) */}
      <div
        className="border rounded-[6px] px-5 py-4 flex items-center justify-between gap-4 flex-wrap"
        style={{
          background: 'linear-gradient(135deg, #111216, rgba(248,113,113,0.03))',
          borderColor: 'rgba(248,113,113,0.18)',
        }}
      >
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-red-200">Cancel backups</p>
          <p className={`${MONO} text-[11px] text-white/45 mt-0.5`}>
            Stops the backup service and deletes every stored backup. Removes the add-on charge.
          </p>
        </div>
        {confirmCancel ? (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={acting !== null}
              onClick={() => act('cancel', {}, 'Backups cancelled')}
              className={`${MONO} inline-flex items-center gap-2 h-9 px-4 border border-red-500/30 bg-red-500/90 text-white text-[10.5px] uppercase tracking-[0.12em] font-semibold hover:bg-red-500 rounded-[5px] transition-colors disabled:opacity-40`}
            >
              {acting === 'cancel' ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
              Confirm cancel
            </button>
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className={`${MONO} h-9 px-3 text-[10.5px] uppercase tracking-[0.12em] text-white/50 hover:text-white/80 transition-colors`}
            >
              Keep
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            className={`${MONO} shrink-0 h-9 px-4 border border-red-500/25 bg-transparent text-[10.5px] uppercase tracking-[0.12em] text-red-300/90 hover:text-red-200 hover:bg-red-500/[0.06] rounded-[5px] transition-colors`}
          >
            Cancel backups
          </button>
        )}
      </div>

      {/* Restore confirm overlay */}
      {confirmRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70" onClick={() => setConfirmRestore(null)} />
          <div className="relative w-full max-w-[460px] border border-white/[0.1] bg-[#111216] rounded-[8px] p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="h-10 w-10 shrink-0 flex items-center justify-center border border-amber-500/25 bg-amber-500/[0.06] rounded-[5px]">
                <AlertTriangle className="h-4 w-4 text-amber-300" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-white">Restore this backup?</h3>
                <p className={`${MONO} text-[11px] text-white/45 mt-1 leading-relaxed`}>
                  Restoring OVERWRITES the server&apos;s current disks with the backup from{' '}
                  {new Date(confirmRestore.created).toLocaleString()}. Anything written since then is lost.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRestore(null)}
                className={`${MONO} h-9 px-4 text-[10.5px] uppercase tracking-[0.12em] text-white/50 hover:text-white/80 transition-colors`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={acting !== null}
                onClick={() =>
                  act('restore', { backupId: confirmRestore.id, overwrite: true }, 'Restore started')
                }
                className={`${MONO} inline-flex items-center gap-2 h-9 px-4 text-[10.5px] uppercase tracking-[0.12em] font-semibold rounded-[4px] text-white transition-colors disabled:opacity-50`}
                style={{ background: ACCENT }}
              >
                {acting === 'restore' && <Loader2 className="h-3 w-3 animate-spin" />}
                Restore backup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
