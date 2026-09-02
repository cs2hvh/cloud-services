'use client';

// Custom OS images — list, import (by URL), and delete. Editorial dark canvas
// matching the VPS list/detail design language. Images appear in the VPS deploy
// OS picker automatically and build lazily per-host on first use.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowLeft, Check, HardDrive, Loader2, Plus, RefreshCw, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { OsImg } from '@/components/dashboard/compute/vps/os-icons';
import { useConfirm } from "@/components/ui/confirm";

const SERIF_STYLE: React.CSSProperties = { fontFamily: 'var(--font-nunito), system-ui, sans-serif' };
const MONO = 'font-[var(--font-geist-mono),ui-monospace,monospace]';
const ACCENT = '#0095FF';
const ACCENT_BRIGHT = '#33adff';

const OS_FAMILIES = ['ubuntu', 'debian', 'almalinux', 'rocky', 'centos', 'windows', 'custom'];

interface CustomImage {
  id: string;
  name: string;
  description: string | null;
  source_type: string;
  os_family: string;
  default_user: string;
  size_gb: number;
  cloud_init: boolean;
  status: string;
  error: string | null;
  created_at: string;
}

const STATUS_META: Record<string, { color: string; label: string; pulse?: boolean }> = {
  available: { color: '#4ade80', label: 'Available' },
  importing: { color: ACCENT, label: 'Importing', pulse: true },
  pending: { color: ACCENT, label: 'Pending', pulse: true },
  failed: { color: '#f87171', label: 'Failed' },
  deleting: { color: '#fbbf24', label: 'Deleting', pulse: true },
};

export default function CustomImagesPage() {
  const confirm = useConfirm();
  const [images, setImages] = useState<CustomImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/services/compute/images');
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || 'Failed');
      setImages(json.images ?? []);
    } catch {
      toast.error('Unable to load your images. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalGb = images.reduce((s, i) => s + (i.size_gb || 0), 0);
  const monthly = (totalGb * 0.05).toFixed(2);
  const available = images.filter((i) => i.status === 'available').length;

  const onDelete = async (img: CustomImage) => {
    if (!(await confirm({
      title: `Delete image "${img.name}"?`,
      description: "The image and its prepared templates are removed. Servers already created from it keep running.",
      confirmText: "Delete image",
      danger: true,
    }))) {
      return;
    }
    try {
      const res = await fetch(`/api/services/compute/images/${img.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || 'Delete failed');
      toast.success('Image deleted');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
          style={{ background: 'radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)' }} />
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }} />
      </div>

      <div className="relative z-10 px-6 py-7 sm:px-10 sm:py-9">
        {/* Back */}
        <Link href="/dashboard/services/compute/vps"
          className={`${MONO} inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/40 hover:text-white/75 transition-colors mb-5`}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to servers
        </Link>

        {/* Hero */}
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between mb-9">
          <div className="max-w-3xl">
            <h1 className="text-[34px] sm:text-[42px] leading-[1.05] tracking-[-0.025em] text-white font-semibold">
              Your{' '}
              <span style={SERIF_STYLE} className="text-white/55 font-normal">images</span>.
            </h1>
            <p className={`${MONO} mt-3 max-w-xl text-[11.5px] text-white/45 leading-relaxed`}>
              Bring your own OS image by URL. Images appear in the deploy picker and
              are prepared on first use in each region. Stored images bill at $0.05/GB‑mo.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={load} disabled={loading}
              className={`${MONO} inline-flex h-10 items-center gap-2 px-3.5 border border-white/[0.08] bg-[#111216] text-[11px] uppercase tracking-[0.14em] text-white/65 hover:text-white hover:bg-white/[0.04] rounded-[5px] transition-colors disabled:opacity-50`}>
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button type="button" onClick={() => setShowImport((v) => !v)}
              className={`${MONO} inline-flex h-10 items-center gap-2 px-4 text-[11.5px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all`}
              style={{ background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`, color: '#fff', boxShadow: '0 8px 20px rgba(0,149,255,0.20)' }}>
              <Plus className="h-3.5 w-3.5" /> Import image
            </button>
          </div>
        </header>

        {/* Stats */}
        {images.length > 0 && (
          <section className="mb-7 grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatTile label="Images" value={String(images.length)} hint={`${available} ready`} />
            <StatTile label="Storage" value={totalGb.toFixed(totalGb % 1 === 0 ? 0 : 1)} suffix="GB" hint="Across all images" tone="blue" />
            <StatTile label="Est. monthly" value={`$${monthly}`} hint="$0.05/GB · stored images" tone="green" />
          </section>
        )}

        {showImport && <ImportPanel onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); load(); }} />}

        {/* List */}
        <section className="mt-2">
          {loading && images.length === 0 ? (
            <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
              {[1, 2].map((i) => (
                <div key={i} className="h-[64px] border-b border-white/[0.04] last:border-b-0 animate-pulse bg-white/[0.015]" />
              ))}
            </div>
          ) : images.length === 0 ? (
            <EmptyState onImport={() => setShowImport(true)} />
          ) : (
            <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
              <div className="hidden md:grid grid-cols-[minmax(0,1.6fr)_minmax(80px,1fr)_minmax(90px,0.8fr)_minmax(110px,0.9fr)_72px] gap-3 px-5 py-2.5 border-b border-white/[0.06] bg-white/[0.015]">
                <ColHead>Image</ColHead>
                <ColHead>Source</ColHead>
                <ColHead align="right">Size</ColHead>
                <ColHead>Status</ColHead>
                <ColHead align="right">Actions</ColHead>
              </div>
              {images.map((img) => {
                const st = STATUS_META[img.status] ?? { color: 'rgba(255,255,255,0.4)', label: img.status };
                return (
                  <div key={img.id}
                    className="grid grid-cols-1 md:grid-cols-[minmax(0,1.6fr)_minmax(80px,1fr)_minmax(90px,0.8fr)_minmax(110px,0.9fr)_72px] gap-3 px-5 py-3 border-b border-white/[0.04] last:border-b-0 items-center hover:bg-white/[0.015] transition-colors">
                    {/* Name */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 shrink-0 inline-flex items-center justify-center border border-white/[0.08] bg-[#0d0e11] rounded-[6px] text-white/70">
                        <OsImg name={img.os_family} size={18} className="h-[18px] w-[18px]" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-semibold text-white truncate">{img.name}</div>
                        <div className={`${MONO} mt-0.5 text-[10.5px] text-white/40 truncate`}>
                          user: {img.default_user}
                          {!img.cloud_init && <span className="text-amber-300/80"> · no cloud-init</span>}
                        </div>
                      </div>
                    </div>
                    {/* Source */}
                    <span className={`${MONO} hidden md:block text-[11px] text-white/55 uppercase tracking-[0.08em]`}>
                      {img.source_type === 'snapshot' ? 'Snapshot' : img.source_type === 'upload' ? 'Upload' : 'URL'}
                    </span>
                    {/* Size */}
                    <span className={`${MONO} hidden md:block text-right text-[11.5px] text-white/65 tabular-nums`}>
                      {img.size_gb > 0 ? `${img.size_gb} GB` : '—'}
                    </span>
                    {/* Status */}
                    <span className={`${MONO} hidden md:inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] font-semibold`} style={{ color: st.color }}>
                      <span className={`h-1.5 w-1.5 rounded-full ${st.pulse ? 'animate-pulse' : ''}`} style={{ background: st.color }} />
                      {st.label}
                    </span>
                    {/* Actions */}
                    <div className="flex items-center justify-end">
                      <button type="button" onClick={() => onDelete(img)} disabled={img.status === 'deleting'}
                        title="Delete image"
                        className="h-7 w-7 inline-flex items-center justify-center text-white/35 hover:text-red-400 hover:bg-red-500/10 rounded-[4px] transition-colors disabled:opacity-40">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {img.status === 'failed' && img.error && (
                      <p className={`${MONO} md:col-span-5 text-[10px] text-red-400/85 inline-flex items-center gap-1`}>
                        <AlertTriangle className="h-2.5 w-2.5" /> {img.error}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ImportPanel({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [osFamily, setOsFamily] = useState('ubuntu');
  const [defaultUser, setDefaultUser] = useState('root');
  const [cloudInit, setCloudInit] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const inputCls = `${MONO} h-10 w-full px-3 border border-white/[0.08] bg-[#0d0e11] text-[12.5px] text-white placeholder:text-white/25 outline-none focus:border-white/25 rounded-[5px]`;
  const valid = name.trim().length > 0 && /^https:\/\//.test(url.trim());

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/services/compute/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), sourceUrl: url.trim(), osFamily, defaultUser: defaultUser.trim(), cloudInit }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || 'Import failed');
      toast.success(`Image "${name.trim()}" added — it'll appear in the deploy picker.`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mb-6 border border-white/[0.08] bg-[#111216] rounded-[8px] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[14px] font-semibold text-white">Import a custom image</h3>
        <button type="button" onClick={onClose} className={`${MONO} text-[10.5px] uppercase tracking-[0.12em] text-white/45 hover:text-white`}>Close</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. my-hardened-ubuntu" />
        </Field>
        <Field label="OS family">
          <select className={inputCls} value={osFamily} onChange={(e) => { setOsFamily(e.target.value); }}>
            {OS_FAMILIES.map((f) => <option key={f} value={f} className="bg-[#111216]">{f}</option>)}
          </select>
        </Field>
        <Field label="Image URL (https · qcow2/raw)" full>
          <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/image.qcow2" />
        </Field>
        <Field label="Default login user">
          <input className={inputCls} value={defaultUser} onChange={(e) => setDefaultUser(e.target.value)} placeholder="root" />
        </Field>
        <Field label="Cloud-init">
          <label className={`${MONO} flex items-center gap-2 h-10 text-[12px] text-white/70 cursor-pointer`}>
            <input type="checkbox" checked={cloudInit} onChange={(e) => setCloudInit(e.target.checked)} className="accent-[#0095FF]" />
            Image has cloud-init + guest agent
          </label>
        </Field>
      </div>
      <p className={`${MONO} mt-3 flex items-start gap-2 text-[10.5px] text-white/45 leading-relaxed`}>
        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" style={{ color: ACCENT_BRIGHT }} />
        Networking is auto-configured only for cloud-init images (every mainstream
        cloud qcow2 qualifies). The image is prepared on a host the first time you
        deploy it in a region — that first deploy can take a few minutes.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <button type="button" onClick={submit} disabled={!valid || submitting}
          className={`${MONO} inline-flex h-9 items-center gap-2 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold rounded-[5px] transition-all disabled:opacity-50`}
          style={{ background: ACCENT, color: '#001930' }}
          onMouseEnter={(e) => { if (valid && !submitting) e.currentTarget.style.background = ACCENT_BRIGHT; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = ACCENT; }}>
          {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Import image
        </button>
      </div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className={`${MONO} block mb-1.5 text-[10px] uppercase tracking-[0.12em] text-white/45`}>{label}</label>
      {children}
    </div>
  );
}

function StatTile({ label, value, suffix, hint, tone }: { label: string; value: string; suffix?: string; hint?: string; tone?: 'blue' | 'green' }) {
  const dot = tone === 'blue' ? ACCENT : tone === 'green' ? '#4ade80' : 'rgba(255,255,255,0.55)';
  return (
    <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] px-5 py-4 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="h-1 w-1 rounded-full shrink-0" style={{ background: dot, boxShadow: dot.startsWith('rgba') ? 'none' : `0 0 5px ${dot}` }} />
        <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45`}>{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span style={SERIF_STYLE} className="text-[32px] leading-none font-bold tabular-nums tracking-[-0.035em] text-white">{value}</span>
        {suffix && <span style={SERIF_STYLE} className="text-[14px] text-white/40 font-medium">{suffix}</span>}
      </div>
      {hint && <p className={`${MONO} text-[10.5px] text-white/40 mt-auto`}>{hint}</p>}
    </div>
  );
}

function ColHead({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/40 ${align === 'right' ? 'text-right' : ''}`}>
      {children}
    </span>
  );
}

function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="relative border border-white/[0.06] bg-[#111216] rounded-[6px] px-8 py-12 text-center overflow-hidden">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 30% 20%, rgba(0,149,255,0.04), transparent 50%)' }} />
      <div className="relative z-10 h-12 w-12 mb-5 mx-auto inline-flex items-center justify-center border border-white/[0.14] bg-[#16181d] rounded-[8px]" style={{ color: ACCENT }}>
        <HardDrive className="h-5 w-5" />
      </div>
      <h3 className="relative z-10 text-[18px] font-semibold tracking-[-0.015em] text-white">No custom images yet</h3>
      <p className={`${MONO} relative z-10 mt-2 max-w-sm mx-auto text-[11.5px] text-white/45 leading-relaxed`}>
        Import a cloud image by URL to deploy your own OS. It shows up in the deploy
        picker right away.
      </p>
      <div className="relative z-10 mt-5">
        <button type="button" onClick={onImport}
          className={`${MONO} inline-flex items-center gap-2 h-9 px-4 text-[11px] uppercase tracking-[0.14em] font-semibold rounded-[5px]`}
          style={{ background: `linear-gradient(135deg, ${ACCENT}, #0066B3)`, color: '#fff', boxShadow: '0 8px 20px rgba(0,149,255,0.20)' }}>
          <Plus className="h-3.5 w-3.5" /> Import your first image
        </button>
      </div>
    </div>
  );
}
