'use client';

/**
 * Knowledge-base picker for the file_search tool — used by the agent builder and
 * the Settings tab. Lets a user either select an existing vector collection OR
 * create a new one and seed it with pasted text, inline, without leaving the
 * agent flow (mirrors how production agent builders attach files).
 *
 * Text-only for now (create → auto-embed via text-embedding-3-small). PDF/DOCX
 * file upload needs the parsing pipeline (RAG data platform) — tracked separately.
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
      if (body) {
        const parts = body.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean).slice(0, 100);
        const rows = parts.map((content, i) => ({ external_id: `doc-${Date.now()}-${i + 1}`, content }));
        const ur = await fetch(`/api/inference/vector/collections/${id}/upsert`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ rows }),
        });
        if (!ur.ok) { const uj = await ur.json().catch(() => ({})); throw new Error(uj.error || 'Created, but seeding text failed'); }
      }

      toast.success(body ? 'Knowledge base created + seeded' : 'Knowledge base created');
      setCollections(await fetchCollections());
      onChange(id);
      setMode('existing');
      setName(''); setText('');
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
            placeholder="Paste text to seed this knowledge base (optional — one row per paragraph). File/PDF upload coming soon." />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-white/35">Embedded with text-embedding-3-small</span>
            <PrimaryButton onClick={createKb} disabled={creating}>{creating ? 'Creating…' : 'Create & attach'}</PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}
