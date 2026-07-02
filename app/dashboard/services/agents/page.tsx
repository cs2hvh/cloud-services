'use client';

/**
 * Agents v2 (agentcore) dashboard — list / create / edit / delete.
 *
 * S1.5 (Track C). Positioned as a sibling of the v1 ai-agents product: v1 =
 * hosted chatbot; v2 = autonomous multi-step agents (durable runs, tools, traces).
 *
 * Talks to the session-authed control plane at /api/agents. The run trace viewer
 * + playground (S1.5d/e) are separate — they read the durable run.
 */
import { useEffect, useState, useCallback } from 'react';
import { Plus, RotateCw, Trash2, Pencil, Bot, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DataTable, EmptyState, Hero, MONO, PageCanvas, PrimaryButton,
  RowActionButton, StatCell, StatsStrip, ColHead, ACCENT,
} from '@/components/dashboard/inference/chrome';

const BASE = '/api/agents';

// Curated model choices for the picker. The gateway accepts any catalog model id;
// these are the common defaults surfaced in the UI.
// NOTE: these ids must exist in the catalog (inference.models, is_active). A
// proper follow-up is to fetch the catalog dynamically so this never drifts.
const MODEL_OPTIONS: { provider: string; models: { id: string; label: string }[] }[] = [
  { provider: 'OpenAI', models: [
    { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini' },
    { id: 'openai/gpt-4o',      label: 'GPT-4o' },
    { id: 'openai/gpt-4.1',     label: 'GPT-4.1' },
    { id: 'openai/gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  ]},
  { provider: 'Anthropic', models: [
    { id: 'anthropic/claude-opus-4.7',   label: 'Claude Opus 4.7' },
    { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
    { id: 'anthropic/claude-haiku-4.5',  label: 'Claude Haiku 4.5' },
  ]},
  { provider: 'Google', models: [
    { id: 'google/gemini-3-pro',   label: 'Gemini 3 Pro' },
    { id: 'google/gemini-3-flash', label: 'Gemini 3 Flash' },
  ]},
];
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

// S1 is model-only; hosted tools arrive in S2, so the toggles are shown disabled.
const HOSTED_TOOLS: { type: string; label: string }[] = [
  { type: 'web_search',  label: 'Web search' },
  { type: 'file_search', label: 'File search (RAG)' },
  { type: 'code',        label: 'Code interpreter' },
];

interface Agent {
  id: string;
  name: string;
  model: string;
  system_prompt: string | null;
  tools: { type: string }[];
  guardrail: string;
  max_steps: number;
  max_cost_cents: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface FormState {
  name: string;
  model: string;
  system_prompt: string;
  guardrail: 'off' | 'warn' | 'block';
  max_steps: number;
  max_cost_cents: number;
}

const emptyForm: FormState = {
  name: '',
  model: DEFAULT_MODEL,
  system_prompt: '',
  guardrail: 'warn',
  max_steps: 12,
  max_cost_cents: 100,
};

function ModelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full h-9 rounded-[6px] bg-[#0c0d10] border border-white/[0.1] px-3 text-sm text-white/90 ${MONO}`}
    >
      {MODEL_OPTIONS.map((g) => (
        <optgroup key={g.provider} label={g.provider}>
          {g.models.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Create / edit dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAgents = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch(BASE);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load agents');
      setAgents(json.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void fetchAgents(); }, [fetchAgents]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(a: Agent) {
    setEditing(a);
    setForm({
      name: a.name,
      model: a.model,
      system_prompt: a.system_prompt ?? '',
      guardrail: (a.guardrail as FormState['guardrail']) ?? 'warn',
      max_steps: a.max_steps,
      max_cost_cents: a.max_cost_cents,
    });
    setFormOpen(true);
  }

  async function submitForm() {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        model: form.model,
        system_prompt: form.system_prompt.trim() || null,
        guardrail: form.guardrail,
        max_steps: form.max_steps,
        max_cost_cents: form.max_cost_cents,
      };
      const res = editing
        ? await fetch(`${BASE}/${editing.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch(BASE, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      toast.success(editing ? 'Agent updated' : 'Agent created');
      setFormOpen(false);
      void fetchAgents();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${BASE}/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      toast.success('Agent deleted');
      setDeleteTarget(null);
      void fetchAgents();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  const activeCount = agents.filter((a) => a.is_active).length;

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: 'Inference', href: '/dashboard/services/inference' }}
        title="Agents"
        accent={ACCENT}
        caption="Autonomous multi-step agents — durable runs, hosted tools, per-step traces. (v2)"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchAgents(true)}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-[11px] text-white/60 hover:text-white/90"
              aria-label="Refresh"
            >
              <RotateCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <PrimaryButton onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> New agent
            </PrimaryButton>
          </div>
        }
      />

      <StatsStrip>
        <StatCell label="Agents" value={String(agents.length)} hint="Defined in this org" accent={ACCENT} />
        <StatCell label="Active" value={String(activeCount)} hint="Currently enabled" />
      </StatsStrip>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-white/40">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : agents.length === 0 ? (
        <EmptyState
          title="No agents yet"
          description="Create an agent — pick a model, write a system prompt, set step and cost ceilings — then run it."
          action={<PrimaryButton onClick={openCreate}><Plus className="h-3.5 w-3.5" /> New agent</PrimaryButton>}
        />
      ) : (
        <DataTable>
          <div className="grid grid-cols-[1.6fr_1.4fr_0.8fr_0.8fr_1fr] gap-3 px-4 py-2.5 border-b border-white/[0.06]">
            <ColHead>Name</ColHead>
            <ColHead>Model</ColHead>
            <ColHead align="right">Max steps</ColHead>
            <ColHead align="right">Max cost</ColHead>
            <ColHead align="right">Actions</ColHead>
          </div>
          {agents.map((a) => (
            <div
              key={a.id}
              className="grid grid-cols-[1.6fr_1.4fr_0.8fr_0.8fr_1fr] gap-3 px-4 py-3 border-b border-white/[0.04] items-center"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Bot className="h-4 w-4 text-white/30 shrink-0" />
                <span className="truncate text-sm text-white/90">{a.name}</span>
                {!a.is_active && <Badge variant="outline" className="text-[9px]">paused</Badge>}
              </div>
              <span className={`${MONO} text-[11px] text-white/55 truncate`}>{a.model}</span>
              <span className={`${MONO} text-[11px] text-white/70 text-right tabular-nums`}>{a.max_steps}</span>
              <span className={`${MONO} text-[11px] text-white/70 text-right tabular-nums`}>
                {(a.max_cost_cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
              </span>
              <div className="flex items-center justify-end gap-1.5">
                <RowActionButton href={`/dashboard/services/agents/playground?agent=${a.id}`}><Play className="h-3 w-3" /> Run</RowActionButton>
                <RowActionButton onClick={() => openEdit(a)}><Pencil className="h-3 w-3" /> Edit</RowActionButton>
                <RowActionButton variant="danger" onClick={() => setDeleteTarget(a)}><Trash2 className="h-3 w-3" /></RowActionButton>
              </div>
            </div>
          ))}
        </DataTable>
      )}

      {/* Create / edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit agent' : 'New agent'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update this agent’s configuration.' : 'Define a reusable agent. It runs durably on the model you pick.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="agent-name">Name</Label>
              <Input id="agent-name" value={form.name} placeholder="Research assistant"
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <Label>Model</Label>
              <ModelSelect value={form.model} onChange={(v) => setForm({ ...form, model: v })} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="agent-prompt">System prompt</Label>
              <Textarea id="agent-prompt" rows={4} value={form.system_prompt}
                placeholder="You are a helpful research assistant…"
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="agent-steps">Max steps</Label>
                <Input id="agent-steps" type="number" min={1} max={100} value={form.max_steps}
                  onChange={(e) => setForm({ ...form, max_steps: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agent-cost">Max cost (cents)</Label>
                <Input id="agent-cost" type="number" min={1} value={form.max_cost_cents}
                  onChange={(e) => setForm({ ...form, max_cost_cents: Number(e.target.value) })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="agent-guardrail">Guardrail</Label>
              <select id="agent-guardrail" value={form.guardrail}
                onChange={(e) => setForm({ ...form, guardrail: e.target.value as FormState['guardrail'] })}
                className={`w-full h-9 rounded-[6px] bg-[#0c0d10] border border-white/[0.1] px-3 text-sm text-white/90 ${MONO}`}>
                <option value="off">Off</option>
                <option value="warn">Warn</option>
                <option value="block">Block</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Tools</Label>
              <div className="flex flex-wrap gap-2">
                {HOSTED_TOOLS.map((t) => (
                  <label key={t.type} className="inline-flex items-center gap-1.5 text-[11px] text-white/35 cursor-not-allowed">
                    <input type="checkbox" disabled className="accent-white/20" />
                    {t.label}
                  </label>
                ))}
              </div>
              <p className="text-[10.5px] text-white/30">Hosted tools land in S2 — this agent runs model-only for now.</p>
            </div>
          </div>

          <DialogFooter>
            <PrimaryButton onClick={submitForm} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {editing ? 'Save changes' : 'Create agent'}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the agent definition. Past run history is preserved (runs detach from the agent).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmDelete(); }} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageCanvas>
  );
}
