'use client';

// Rebuild section (Linode-backed servers) — redeploy a fresh image onto the
// server. Destructive: wipes every disk. Image list + saved SSH keys come from
// the deploy options endpoint; confirmation requires typing the server name.

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Eye, EyeOff, Loader2, RefreshCcwDot, X } from 'lucide-react';
import { toast } from 'sonner';
import { type ServerData } from './types';

const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';

interface ImageOption {
  id: string;
  label: string;
  vendor: string | null;
  deprecated: boolean;
}

interface SshKeyOption {
  id: string;
  label: string;
  fingerprint: string;
}

export function LinodeRebuildSection({
  server,
  onRefresh,
}: {
  server: ServerData;
  onRefresh?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-3 min-w-0">
        <div className="h-10 w-10 shrink-0 flex items-center justify-center border border-white/[0.08] bg-white/[0.03] rounded-[5px]">
          <RefreshCcwDot className="h-4 w-4 text-white/50" />
        </div>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-white">Rebuild from image</p>
          <p className={`${MONO} text-[11px] text-white/40 mt-0.5 leading-relaxed`}>
            Redeploy a fresh OS onto this server. All disks are erased — the IP address is kept.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${MONO} shrink-0 inline-flex items-center gap-2 h-9 px-4 border border-white/[0.1] bg-[#0d0e11] text-[11px] uppercase tracking-[0.14em] text-white/80 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
      >
        <RefreshCcwDot className="h-3 w-3" />
        Rebuild
      </button>

      {open && (
        <RebuildDialog
          server={server}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
}

function RebuildDialog({
  server,
  onClose,
  onDone,
}: {
  server: ServerData;
  onClose: () => void;
  onDone: () => void;
}) {
  const [images, setImages] = useState<ImageOption[]>([]);
  const [sshKeys, setSshKeys] = useState<SshKeyOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [imageId, setImageId] = useState('');
  const [selectedKeyIds, setSelectedKeyIds] = useState<string[]>([]);
  const [rootPass, setRootPass] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/services/compute/options', { cache: 'no-store' });
        const json = await res.json();
        if (json.ok && json.data?.provider === 'linode') {
          setImages((json.data.images as ImageOption[]).filter((i) => !i.deprecated));
          setSshKeys(json.data.sshKeys as SshKeyOption[]);
        }
      } catch {
        /* dialog still usable with password only */
      } finally {
        setLoadingOptions(false);
      }
    })();
  }, []);

  const passValid =
    rootPass.length >= 11 &&
    rootPass.length <= 128 &&
    [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(rootPass)).length >= 3;
  const canSubmit = !!imageId && passValid && confirmName === server.name && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/services/compute/vms/${server.id}/rebuild`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageId,
          root_pass: rootPass,
          ssh_key_ids: selectedKeyIds,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || 'Failed to start the rebuild');
      toast.success('Rebuild started — watch progress on the overview tab');
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start the rebuild');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = `${MONO} h-10 w-full px-3 border border-white/[0.1] bg-[#0d0e12] text-[12.5px] text-white placeholder:text-white/25 outline-none focus:border-white/25 rounded-[5px]`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Rebuild server">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-[560px] max-h-[90vh] overflow-y-auto border border-white/[0.1] bg-[#111216] rounded-[8px] p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 flex items-center justify-center border border-red-500/25 bg-red-500/[0.06] rounded-[5px]">
              <AlertTriangle className="h-4 w-4 text-red-300" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-white">Rebuild {server.name}</h3>
              <p className={`${MONO} text-[10.5px] text-white/40 mt-1 leading-relaxed`}>
                Erases every disk and deploys the image below. This cannot be undone.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loadingOptions ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="h-5 w-5 text-white/30 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Image */}
            <div>
              <label className={`${MONO} block mb-1.5 text-[10px] uppercase tracking-[0.12em] text-white/45`}>
                New image
              </label>
              <select
                value={imageId}
                onChange={(e) => setImageId(e.target.value)}
                className={`${inputCls} appearance-none cursor-pointer`}
              >
                <option value="" disabled>
                  Select an image…
                </option>
                {images.map((img) => (
                  <option key={img.id} value={img.id}>
                    {img.label}
                  </option>
                ))}
              </select>
            </div>

            {/* SSH keys */}
            {sshKeys.length > 0 && (
              <div>
                <label className={`${MONO} block mb-1.5 text-[10px] uppercase tracking-[0.12em] text-white/45`}>
                  SSH keys ({selectedKeyIds.length} selected)
                </label>
                <div className="border border-white/[0.08] rounded-[5px] overflow-hidden max-h-[140px] overflow-y-auto">
                  {sshKeys.map((k) => {
                    const checked = selectedKeyIds.includes(k.id);
                    return (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() =>
                          setSelectedKeyIds((prev) =>
                            checked ? prev.filter((id) => id !== k.id) : [...prev, k.id]
                          )
                        }
                        className="w-full flex items-center gap-2.5 px-3 py-2 border-b border-white/[0.05] last:border-b-0 hover:bg-white/[0.03] transition-colors text-left"
                      >
                        <span
                          className="h-3.5 w-3.5 rounded-[3px] border shrink-0 inline-flex items-center justify-center"
                          style={{
                            borderColor: checked ? ACCENT : 'rgba(255,255,255,0.25)',
                            background: checked ? ACCENT : 'transparent',
                          }}
                        >
                          {checked && <Check className="h-2.5 w-2.5 text-white" />}
                        </span>
                        <span className="text-[12px] text-white truncate">{k.label}</span>
                        <span className={`${MONO} text-[9.5px] text-white/30 truncate ml-auto`}>{k.fingerprint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Root password */}
            <div>
              <label className={`${MONO} block mb-1.5 text-[10px] uppercase tracking-[0.12em] text-white/45`}>
                New root password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={rootPass}
                  onChange={(e) => setRootPass(e.target.value)}
                  placeholder="••••••••••••"
                  className={`${inputCls} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/70 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className={`${MONO} mt-1.5 text-[10px] ${passValid ? 'text-emerald-300/80' : 'text-white/30'}`}>
                11+ characters with upper, lower, and a number or symbol
              </p>
            </div>

            {/* Confirm */}
            <div>
              <label className={`${MONO} block mb-1.5 text-[10px] uppercase tracking-[0.12em] text-white/45`}>
                Type <span className="text-red-300 normal-case tracking-normal">{server.name}</span> to confirm
              </label>
              <input
                type="text"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={server.name}
                className={`${inputCls} border-red-500/15 focus:border-red-400/40`}
              />
            </div>

            {error && (
              <p className="text-[11.5px] text-red-400/90 border border-red-500/20 bg-red-500/[0.05] rounded-[4px] px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className={`${MONO} h-9 px-4 text-[10.5px] uppercase tracking-[0.12em] text-white/50 hover:text-white/80 transition-colors`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={submit}
                className={`${MONO} inline-flex items-center gap-2 h-9 px-4 border border-red-500/30 bg-red-500/90 text-white text-[10.5px] uppercase tracking-[0.12em] font-semibold hover:bg-red-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-[4px] transition-colors`}
              >
                {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
                Rebuild server
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
