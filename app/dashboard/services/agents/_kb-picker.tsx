'use client';

/**
 * Knowledge-base picker for the file_search tool — used by the agent builder and
 * the Settings tab. Lets a user either select an existing vector collection OR
 * create a new one and seed it with pasted text, hosted URLs, and/or uploaded
 * documents, inline, without leaving the agent flow (mirrors how production
 * agent builders attach files).
 *
 * Seeding sources: pasted text; URLs (server fetches + extracts readable
 * paragraphs via /ingest-url — see lib/inference/url-ingest.ts); and files —
 * PDF/DOCX/TXT/MD, extracted server-side via /ingest-file — see
 * lib/inference/doc-ingest.ts.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PrimaryButton, MONO } from '@/components/dashboard/inference/chrome';
import { fetchCollections, type VectorCollection } from './_constants';

const DEFAULT_EMBED = 'openai/text-embedding-3-small';
const SEL = `w-full h-9 rounded-xl bg-[#0c0d10] border border-white/[0.1] px-3 text-sm text-white/90 ${MONO}`;
const LABEL = `${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40`;

export function KnowledgeBasePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [collections, setCollections] = useState<VectorCollection[]>([]);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [urls, setUrls] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void fetchCollections().then((c) => {
      setCollections(c);
      if (c.length === 0) setMode('new');
    });
  }, []);

  async function createKb() {
    if (!name.trim()) { toast.error('Name the knowledge base'); return; }
    setCreating(true);
    try {
      const cr = await fetch('/api/inference/vector/collections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ name: name.trim(), embedding_model_id: DEFAULT_EMBED, distance_metric: 'cosine' }),
      });
      const cj = await cr.json();
      if (!cr.ok) throw new Error(cj.error || 'Failed to create knowledge base');
      const id: string | undefined = cj.data?.id ?? cj.collection?.id ?? cj.id;
      if (!id) throw new Error('Create returned no id');

      // Seed with pasted text (one row per paragraph) if provided.
      const body = text.trim();
      let seeded = false;
      if (body) {
        const parts = body.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean).slice(0, 100);
        const rows = parts.map((content, i) => ({ external_id: `doc-${Date.now()}-${i + 1}`, content }));
        const ur = await fetch(`/api/inference/vector/collections/${id}/upsert`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ rows }),
        });
        if (!ur.ok) { const uj = await ur.json().catch(() => ({})); throw new Error(uj.error || 'Created, but seeding text failed'); }
        seeded = true;
      }

      // Seed from hosted URLs (one per line) if provided — server fetches
      // + extracts readable text, so this can pull in existing docs/FAQ
      // pages without copy-pasting.
      const urlList = urls.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 5);
      if (urlList.length > 0) {
        const ir = await fetch(`/api/inference/vector/collections/${id}/ingest-url`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ urls: urlList }),
        });
        const ij = await ir.json().catch(() => ({}));
        if (!ir.ok) throw new Error(ij.error || 'Created, but URL ingest failed');
        seeded = true;
      }

      // Seed from uploaded documents (PDF/DOCX/TXT/MD) if provided — server
      // extracts text per file type and chunks it the same way as pasted
      // text / URL ingest.
      if (files.length > 0) {
        const fd = new FormData();
        for (const f of files) fd.append('files', f);
        const fr = await fetch(`/api/inference/vector/collections/${id}/ingest-file`, {
          method: 'POST', credentials: 'include', body: fd,
        });
        const fj = await fr.json().catch(() => ({}));
        if (!fr.ok) throw new Error(fj.error || 'Created, but file ingest failed');
        seeded = true;
      }

      toast.success(seeded ? 'Knowledge base created + seeded' : 'Knowledge base created');
      setCollections(await fetchCollections());
      onChange(id);
      setMode('existing');
      setName(''); setText(''); setUrls(''); setFiles([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create knowledge base');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className={LABEL}>Knowledge base</span>
        <div className="ml-auto flex gap-1 text-[10px]">
          <button type="button" onClick={() => setMode('existing')}
            className={`px-2 py-0.5 rounded ${mode === 'existing' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}>Existing</button>
          <button type="button" onClick={() => setMode('new')}
            className={`px-2 py-0.5 rounded ${mode === 'new' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}>+ New</button>
        </div>
      </div>

      {mode === 'existing' ? (
        collections.length === 0 ? (
          <div className="text-[11px] text-white/40">
            No knowledge bases yet — <button type="button" className="text-[#33adff]" onClick={() => setMode('new')}>create one</button>.
          </div>
        ) : (
          <select value={value} onChange={(e) => onChange(e.target.value)} className={SEL}>
            <option value="">Select a knowledge base…</option>
            {collections.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.row_count} rows</option>)}
          </select>
        )
      ) : (
        <div className="space-y-2 rounded-xl border border-white/[0.08] bg-[#0c0d10] p-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name — e.g. product-docs" />
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Paste text to seed this knowledge base (optional — one row per paragraph)." />
          <Textarea rows={2} value={urls} onChange={(e) => setUrls(e.target.value)}
            placeholder="Or add hosted URLs to fetch + ingest, one per line (optional, max 5) — e.g. https://docs.example.com/shipping" />
          <div>
            <input
              type="file" multiple accept=".pdf,.docx,.txt,.md"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))}
              className={`w-full text-[11px] text-white/55 ${MONO} file:mr-2 file:rounded-lg file:border-0 file:bg-white/10 file:px-2.5 file:py-1 file:text-[11px] file:text-white/80 hover:file:bg-white/15`}
            />
            {files.length > 0 && (
              <div className="mt-1 text-[10px] text-white/40">{files.length} file{files.length > 1 ? 's' : ''} selected — {files.map((f) => f.name).join(', ')}</div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-white/35">Embedded with text-embedding-3-small. PDF, DOCX, TXT, MD — max 5 files, 10MB each.</span>
            <PrimaryButton onClick={createKb} disabled={creating}>{creating ? 'Creating…' : 'Create & attach'}</PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}
