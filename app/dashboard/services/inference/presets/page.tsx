'use client';

import { useEffect, useState } from 'react';
import { Plus, RotateCw, Trash2, Pencil, Layers } from 'lucide-react';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  ACCENT,
  CodeChip,
  ColHead,
  DataTable,
  EmptyState,
  GhostButton,
  Hero,
  MONO,
  PageCanvas,
  PrimaryButton,
  RowActionButton,
  SectionHead,
  StatCell,
  StatsStrip,
} from '@/components/dashboard/inference/chrome';

interface PresetConfig {
  models: string[];
  provider_sort?: 'price' | 'throughput' | 'latency' | null;
  max_latency_ms?: number | null;
  allow_fallbacks?: boolean;
  preferred_max_price_per_mtok?: number | null;
}

interface Preset {
  id: string;
  name: string;
  description: string | null;
  config: PresetConfig;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

interface FormState {
  id: string | null;
  name: string;
  description: string;
  modelsText: string;
  provider_sort: 'none' | 'price' | 'throughput' | 'latency';
  max_latency_ms: string;
  allow_fallbacks: boolean;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  description: '',
  modelsText: '',
  provider_sort: 'none',
  max_latency_ms: '',
  allow_fallbacks: true,
};

export default function PresetsPage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Preset | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/inference/presets', { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to load presets');
      const data = await r.json();
      setPresets(data.data || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load presets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditOpen(true);
  };

  const openEdit = (p: Preset) => {
    setForm({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      modelsText: p.config.models.join('\n'),
      provider_sort: p.config.provider_sort ?? 'none',
      max_latency_ms: p.config.max_latency_ms ? String(p.config.max_latency_ms) : '',
      allow_fallbacks: p.config.allow_fallbacks ?? true,
    });
    setEditOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    const models = form.modelsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (models.length === 0) {
      toast.error('At least one model id is required');
      return;
    }

    const config: PresetConfig = {
      models,
      provider_sort: form.provider_sort === 'none' ? null : form.provider_sort,
      max_latency_ms: form.max_latency_ms ? Number(form.max_latency_ms) : null,
      allow_fallbacks: form.allow_fallbacks,
    };

    setSaving(true);
    try {
      const url = form.id
        ? `/api/inference/presets/${form.id}`
        : '/api/inference/presets';
      const method = form.id ? 'PATCH' : 'POST';
      const body = form.id
        ? { name: form.name.trim(), description: form.description.trim() || null, config }
        : { name: form.name.trim(), description: form.description.trim() || null, config };

      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Failed to save preset');
      toast.success(form.id ? `Updated "${form.name}"` : `Created "${form.name}"`);
      setEditOpen(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save preset');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/inference/presets/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Failed to delete');
      toast.success(`Deleted "${deleteTarget.name}"`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  // Stats
  const sortedBySort = presets.reduce<Record<string, number>>((acc, p) => {
    const k = p.config.provider_sort ?? 'unsorted';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: 'Inference', href: '/dashboard/services/inference' }}
        title="Routing"
        accent="presets"
        caption="Named fallback chains + provider preferences. Reference a preset via the X-Ahura-Preset header — the gateway compiles its config into OpenRouter routing on every request."
        size="md"
        actions={
          <>
            <GhostButton onClick={load} disabled={loading}>
              <RotateCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </GhostButton>
            <PrimaryButton onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" />
              New preset
            </PrimaryButton>
          </>
        }
      />

      <StatsStrip>
        <StatCell label="Presets" value={String(presets.length)} hint="Active in this org" />
        <StatCell
          label="Sort by price"
          value={String(sortedBySort.price ?? 0)}
          hint="Cheapest-first routing"
          accent="#4ade80"
        />
        <StatCell
          label="Sort by throughput"
          value={String(sortedBySort.throughput ?? 0)}
          hint="Fastest provider first"
          accent={ACCENT}
        />
        <StatCell
          label="Sort by latency"
          value={String(sortedBySort.latency ?? 0)}
          hint="Lowest TTFT first"
          accent="#fbbf24"
        />
      </StatsStrip>

      <SectionHead
        eyebrow="Inventory"
        title="Saved"
        accent="presets"
        rightMeta={presets.length > 0 ? `${presets.length} configured` : undefined}
      />

      {loading ? (
        <DataTable>
          <div className={`${MONO} px-5 py-12 text-center text-[11.5px] uppercase tracking-[0.14em] text-white/35`}>
            Loading…
          </div>
        </DataTable>
      ) : presets.length > 0 ? (
        <DataTable>
          <div className="hidden md:grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.7fr)] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
            <ColHead>Name</ColHead>
            <ColHead>Fallback chain</ColHead>
            <ColHead>Routing</ColHead>
            <ColHead>Updated</ColHead>
            <ColHead align="right">Actions</ColHead>
          </div>
          {presets.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-1 gap-2 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.7fr)] md:items-center"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 shrink-0 text-[#0095FF]/70" />
                  <span className={`${MONO} text-[12.5px] font-semibold text-white truncate`}>
                    {p.name}
                  </span>
                </div>
                {p.description && (
                  <span className={`${MONO} block text-[10.5px] text-white/40 mt-0.5 truncate`}>
                    {p.description}
                  </span>
                )}
              </div>
              <div className="space-y-0.5 min-w-0">
                {p.config.models.slice(0, 3).map((m, i) => (
                  <code
                    key={m}
                    className={`${MONO} block text-[11px] truncate ${
                      i === 0 ? 'text-white/80' : 'text-white/45'
                    }`}
                  >
                    {i + 1}. {m}
                  </code>
                ))}
                {p.config.models.length > 3 && (
                  <span className={`${MONO} block text-[10px] text-white/35`}>
                    +{p.config.models.length - 3} more
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                {p.config.provider_sort && (
                  <span
                    className={`${MONO} inline-flex items-center text-[10.5px] uppercase tracking-[0.12em] font-semibold`}
                    style={{
                      color:
                        p.config.provider_sort === 'price'
                          ? '#4ade80'
                          : p.config.provider_sort === 'throughput'
                            ? ACCENT
                            : '#fbbf24',
                    }}
                  >
                    sort: {p.config.provider_sort}
                  </span>
                )}
                {p.config.max_latency_ms && (
                  <span className={`${MONO} block text-[10px] text-white/45`}>
                    max {p.config.max_latency_ms}ms
                  </span>
                )}
                {p.config.allow_fallbacks === false && (
                  <span className={`${MONO} block text-[10px] text-amber-300/80`}>
                    no-fallback
                  </span>
                )}
              </div>
              <span className={`${MONO} text-[11px] text-white/55`}>
                {new Date(p.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
              <div className="flex flex-wrap justify-end gap-1.5">
                <RowActionButton onClick={() => openEdit(p)}>
                  <Pencil className="h-3 w-3" />
                  Edit
                </RowActionButton>
                <RowActionButton onClick={() => setDeleteTarget(p)} variant="danger">
                  <Trash2 className="h-3 w-3" />
                  Delete
                </RowActionButton>
              </div>
            </div>
          ))}
        </DataTable>
      ) : (
        <EmptyState
          title="No routing presets yet"
          description="Save a model fallback chain and provider preferences. Reference by name from any /v1/chat/completions request."
          action={
            <PrimaryButton onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" />
              Create your first preset
            </PrimaryButton>
          }
        />
      )}

      {/* How to use */}
      <section className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5">
          <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45 mb-2`}>
            Reference in requests
          </p>
          <h4 className="text-[14.5px] font-semibold tracking-[-0.01em] text-white mb-2">
            One header swap
          </h4>
          <pre className={`${MONO} text-[10.5px] text-white/65 leading-relaxed bg-black/40 border border-white/[0.06] rounded p-2.5 overflow-x-auto`}>
{`curl -X POST https://api.cs2hvh.com/v1/chat/completions \\
  -H "Authorization: Bearer ahu_live_..." \\
  -H "Content-Type: application/json" \\
  -H "X-Ahura-Preset: production-cheap-first" \\
  -d '{"messages":[{"role":"user","content":"Hi"}]}'`}
          </pre>
        </div>
        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5">
          <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45 mb-2`}>
            How it compiles
          </p>
          <h4 className="text-[14.5px] font-semibold tracking-[-0.01em] text-white mb-2">
            Caller wins
          </h4>
          <p className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>
            Models from the preset become the fallback chain (caller&apos;s{' '}
            <CodeChip>model</CodeChip> field is tried first). Provider preferences
            ({' '}<CodeChip>sort</CodeChip>, <CodeChip>max_latency</CodeChip>,{' '}
            <CodeChip>max_price</CodeChip>) only apply when the caller didn&apos;t set them.
          </p>
        </div>
      </section>

      {/* Create / edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg border-white/[0.08] bg-[#111216]">
          <DialogHeader>
            <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80`}>
              {form.id ? 'Edit preset' : 'New preset'}
            </DialogTitle>
            <DialogDescription className={`${MONO} text-[11px] text-white/45 leading-relaxed`}>
              The name becomes the value passed in the X-Ahura-Preset header. Lowercase letters, digits, hyphens.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="cheap-first"
                className="bg-white/[0.02] border-white/[0.08]"
                disabled={!!form.id}
              />
            </Field>
            <Field label="Description (optional)">
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Try Haiku, fall back to Llama Scout"
                className="bg-white/[0.02] border-white/[0.08]"
              />
            </Field>
            <Field label="Fallback model chain (one model_id per line, top tried first)">
              <Textarea
                value={form.modelsText}
                onChange={(e) => setForm({ ...form, modelsText: e.target.value })}
                placeholder={'anthropic/claude-haiku-4.5\nmeta-llama/llama-4-scout\nqwen/qwen-3-32b-instruct'}
                rows={5}
                className="bg-white/[0.02] border-white/[0.08] font-mono text-[11.5px]"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Provider sort">
                <Select
                  value={form.provider_sort}
                  onValueChange={(v) =>
                    setForm({ ...form, provider_sort: v as FormState['provider_sort'] })
                  }
                >
                  <SelectTrigger className="bg-white/[0.02] border-white/[0.08]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (default)</SelectItem>
                    <SelectItem value="price">Price (cheapest)</SelectItem>
                    <SelectItem value="throughput">Throughput (fastest)</SelectItem>
                    <SelectItem value="latency">Latency (lowest TTFT)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Max latency (ms)">
                <Input
                  type="number"
                  min="0"
                  value={form.max_latency_ms}
                  onChange={(e) => setForm({ ...form, max_latency_ms: e.target.value })}
                  placeholder="—"
                  className="bg-white/[0.02] border-white/[0.08]"
                />
              </Field>
            </div>
            <div className="flex items-center justify-between rounded-[5px] border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
              <div>
                <Label className={`${MONO} text-[11px] uppercase tracking-[0.12em] text-white/80`}>
                  Allow cross-model fallbacks
                </Label>
                <p className={`${MONO} mt-0.5 text-[10.5px] text-white/40`}>
                  Off = error if the first model fails. On = walk the fallback chain.
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.allow_fallbacks}
                onChange={(e) => setForm({ ...form, allow_fallbacks: e.target.checked })}
                className="h-4 w-4 accent-[#0095FF]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <GhostButton onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </GhostButton>
            <PrimaryButton onClick={save} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving…' : form.id ? 'Save changes' : 'Create preset'}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="border-white/[0.08] bg-[#111216]">
          <AlertDialogHeader>
            <AlertDialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-red-300`}>
              Delete preset
            </AlertDialogTitle>
            <AlertDialogDescription className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>
              Deleting &quot;{deleteTarget?.name}&quot; immediately removes it. Any requests
              referencing it via X-Ahura-Preset will return 400 until updated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              disabled={deleting}
              className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] border-white/[0.08] bg-white/[0.02] text-white/75 hover:bg-white/[0.06]`}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              disabled={deleting}
              className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] font-semibold bg-red-600 hover:bg-red-700`}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageCanvas>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className={`${MONO} block mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>
        {label}
      </Label>
      {children}
    </div>
  );
}
