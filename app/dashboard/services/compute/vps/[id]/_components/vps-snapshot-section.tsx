'use client';

// Create a reusable custom image from this server (snapshot). Requires the
// server to be powered off for a consistent disk export. The image is staged
// to R2 in the background and then appears under Custom Images / the deploy
// picker, usable in any region.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { type ServerData } from './types';

const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';
const ACCENT_BRIGHT = '#33adff';

export function VpsSnapshotSection({ server }: { server: ServerData }) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [supabase] = useState(() => createClient());
  const router = useRouter();

  const stopped = server.status === 'stopped';

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch(`/api/services/compute/vms/${server.id}/snapshot-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || 'Could not create image');
      toast.success('Creating image — it will appear under Custom Images shortly.');
      setName('');
      router.push('/dashboard/services/compute/images');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create image');
    } finally {
      setSubmitting(false);
    }
  };

  if (!stopped) {
    return (
      <div className={`${MONO} border border-white/[0.06] bg-[#111216] rounded-[6px] px-5 py-6 text-[12px] text-white/55`}>
        Power off the server to capture it as a reusable image (a consistent
        export needs the disk at rest).
      </div>
    );
  }

  const valid = /^[a-zA-Z0-9]([a-zA-Z0-9 ._-]{0,61}[a-zA-Z0-9])?$/.test(name.trim());

  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-5 py-4">
      <div className="flex items-start gap-3 mb-4">
        <div className="h-9 w-9 shrink-0 flex items-center justify-center border border-white/[0.08] bg-[#0d0e11] rounded-[6px]" style={{ color: ACCENT }}>
          <Camera className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-white">Capture as a custom image</p>
          <p className={`${MONO} mt-1 text-[11px] text-white/55 leading-relaxed`}>
            Exports the disk to a reusable image you can launch in any region.
            Billed as stored-image storage ($0.05/GB‑mo) once ready.
          </p>
        </div>
      </div>
      <label className={`${MONO} block mb-1.5 text-[10px] uppercase tracking-[0.12em] text-white/45`}>Image name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. web-golden-image"
        className={`${MONO} h-9 w-full max-w-md px-3 border border-white/[0.08] bg-[#0d0e11] text-[12.5px] text-white placeholder:text-white/25 outline-none focus:border-white/25 rounded-[5px]`}
      />
      <div className="mt-3">
        <button
          type="button"
          onClick={submit}
          disabled={!valid || submitting}
          className={`${MONO} inline-flex h-9 items-center gap-2 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all disabled:opacity-50`}
          style={{ background: ACCENT, color: '#001930' }}
          onMouseEnter={(e) => { if (valid && !submitting) e.currentTarget.style.background = ACCENT_BRIGHT; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = ACCENT; }}
        >
          {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Create image
        </button>
      </div>
    </div>
  );
}
