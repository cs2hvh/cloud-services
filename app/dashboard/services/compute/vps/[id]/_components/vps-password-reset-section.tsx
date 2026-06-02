'use client';

// Access-password reset. Generates a new password server-side, resets it on the
// running VM via the guest agent, and emails it to the owner. The password is
// never shown in the UI. Self-contained (own state + fetch), like the resize
// section, so the settings tab just renders it.

import { useState } from 'react';
import { KeyRound, Loader2, Mail, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { type ServerData, getAccessInfo } from './types';

const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';
const ACCENT_BRIGHT = '#33adff';

export function VpsPasswordResetSection({ server }: { server: ServerData }) {
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);

  const access = getAccessInfo(server.os);
  const proto = access.isRDP ? 'RDP' : 'SSH';
  const isRunning = server.status === 'running';

  const reset = async () => {
    setResetting(true);
    try {
      const res = await fetch(`/api/services/compute/vms/${server.id}/reset-password`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not reset the password.');
      toast.success(
        data?.emailedTo
          ? `New password emailed to ${data.emailedTo}`
          : 'New password emailed to you.',
      );
      setConfirming(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not reset the password.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-5 py-4">
      <div className="flex items-start gap-3 mb-3.5">
        <div className="h-10 w-10 shrink-0 flex items-center justify-center border border-white/[0.08] bg-white/[0.03] rounded-[5px]">
          <KeyRound className="h-4 w-4" style={{ color: ACCENT }} />
        </div>
        <p className="text-[12.5px] leading-relaxed text-white/80 min-w-0">
          Generates a new <strong className="text-white">{proto}</strong> password for{' '}
          <span className={`${MONO} text-white`}>{access.user}</span> and emails it to you. For
          security it is <strong className="text-white">never shown here and is not stored</strong> —
          and your current password stops working as soon as the reset completes.
        </p>
      </div>

      {!isRunning ? (
        <p className={`${MONO} flex items-center gap-1.5 text-[11px] text-amber-300/80`}>
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          Start the server to reset its password.
        </p>
      ) : confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={reset}
            disabled={resetting}
            className={`${MONO} inline-flex h-9 items-center gap-2 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all disabled:opacity-50`}
            style={{ background: ACCENT, color: '#001930' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = ACCENT_BRIGHT; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = ACCENT; }}
          >
            {resetting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            Reset &amp; email password
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={resetting}
            className={`${MONO} h-9 px-3.5 border border-white/[0.08] bg-transparent text-[11px] uppercase tracking-[0.14em] text-white/55 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors disabled:opacity-50`}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={`${MONO} inline-flex h-9 items-center gap-2 px-3.5 border border-white/[0.08] bg-[#0d0e11] text-[11px] uppercase tracking-[0.14em] text-white/75 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors`}
        >
          <KeyRound className="h-3 w-3" /> Reset password
        </button>
      )}
    </div>
  );
}
