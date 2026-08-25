'use client';

import { useEffect, useState } from 'react';
import { Plus, RotateCw, Tag, FileCode, ChevronDown, ChevronRight, Check, Pencil, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { INFERENCE_API_BASE } from '@/lib/inference/branding';

interface PromptVersion {
  id: string;
  version: number;
  label: string | null;
  template: Array<{ role: string; content: string }>;
  model_defaults: Record<string, unknown>;
  created_at: string;
}

interface Prompt {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  prompt_versions?: PromptVersion[];
}

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // View full template dialog
  const [viewVersion, setViewVersion] = useState<{ prompt: Prompt; version: PromptVersion } | null>(null);

  // Create prompt dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Add version dialog
  const [versionPrompt, setVersionPrompt] = useState<Prompt | null>(null);
  const [versionTemplate, setVersionTemplate] = useState('');
  const [versionTemp, setVersionTemp] = useState('');
  const [versionMaxTok, setVersionMaxTok] = useState('');
  const [savingVersion, setSavingVersion] = useState(false);

  // Assign label dialog
  const [labelVersion, setLabelVersion] = useState<{ prompt: Prompt; version: PromptVersion } | null>(null);
  const [labelText, setLabelText] = useState('production');
  const [savingLabel, setSavingLabel] = useState(false);

  // Edit description dialog
  const [editPrompt, setEditPrompt] = useState<Prompt | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete prompt confirmation
  const [deleteTarget, setDeleteTarget] = useState<Prompt | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Delete version
  const [deleteVersion, setDeleteVersion] = useState<{ prompt: Prompt; version: PromptVersion } | null>(null);
  const [deletingVersion, setDeletingVersion] = useState(false);

  // Undeploy label
  const [undeployTarget, setUndeployTarget] = useState<{ prompt: Prompt; version: PromptVersion } | null>(null);
  const [undeploying, setUndeploying] = useState(false);

  const load = async (initial = false) => {
    if (initial) setLoading(true); else setRefreshing(true);
    try {
      const r = await fetch('/api/inference/prompts', { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to load prompts');
      const data = await r.json();
      setPrompts(data.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load prompts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(true); }, []);

  const openCreateVersion = (p: Prompt) => {
    setVersionPrompt(p);
    setVersionTemplate('');
    setVersionTemp('');
    setVersionMaxTok('');
  };

  const createPrompt = async () => {
    if (!createName.trim()) { toast.error('Name is required'); return; }
    setCreating(true);
    try {
      const r = await fetch('/api/inference/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: createName.trim(), description: createDesc.trim() || null }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Failed to create');
      toast.success(`Created "${createName}"`);
      setCreateOpen(false);
      setCreateName('');
      setCreateDesc('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create prompt');
    } finally {
      setCreating(false);
    }
  };

  const saveVersion = async () => {
    if (!versionPrompt) return;
    // Parse template as a JSON array of {role, content} or as freeform system+user text
    let template: Array<{ role: string; content: string }>;
    const trimmed = versionTemplate.trim();
    if (trimmed.startsWith('[')) {
      try {
        template = JSON.parse(trimmed);
      } catch {
        toast.error('Template JSON is invalid');
        return;
      }
    } else {
      // Treat plain text as a system message
      template = [{ role: 'system', content: trimmed }];
    }
    if (template.length === 0) { toast.error('Template must have at least one message'); return; }

    const modelDefaults: Record<string, unknown> = {};
    if (versionTemp) modelDefaults.temperature = parseFloat(versionTemp);
    if (versionMaxTok) modelDefaults.max_tokens = parseInt(versionMaxTok, 10);

    setSavingVersion(true);
    try {
      const r = await fetch(`/api/inference/prompts/${versionPrompt.id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ template, model_defaults: modelDefaults }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Failed to create version');
      toast.success(`Created version ${data.data.version} for "${versionPrompt.name}"`);
      setVersionPrompt(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save version');
    } finally {
      setSavingVersion(false);
    }
  };

  const assignLabel = async () => {
    if (!labelVersion || !labelText.trim()) return;
    setSavingLabel(true);
    try {
      const r = await fetch(
        `/api/inference/prompts/${labelVersion.prompt.id}/versions/${labelVersion.version.version}/label`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ label: labelText.trim() }),
        }
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Failed to assign label');
      toast.success(`Deployed v${labelVersion.version.version} as "${labelText}" for "${labelVersion.prompt.name}"`);
      setLabelVersion(null);
      setLabelText('production');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign label');
    } finally {
      setSavingLabel(false);
    }
  };

  const removeLabel = async () => {
    if (!undeployTarget) return;
    setUndeploying(true);
    try {
      const { prompt, version } = undeployTarget;
      const r = await fetch(
        `/api/inference/prompts/${prompt.id}/versions/${version.version}/label`,
        { method: 'DELETE', credentials: 'include' }
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Failed to undeploy');
      toast.success(`Removed "${version.label}" label from v${version.version} of "${prompt.name}"`);
      setUndeployTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to undeploy');
    } finally {
      setUndeploying(false);
    }
  };

  const removeVersion = async () => {
    if (!deleteVersion) return;
    setDeletingVersion(true);
    try {
      const { prompt, version } = deleteVersion;
      const r = await fetch(
        `/api/inference/prompts/${prompt.id}/versions/${version.version}`,
        { method: 'DELETE', credentials: 'include' }
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Failed to delete version');
      toast.success(`Deleted v${version.version} of "${prompt.name}"`);
      setDeleteVersion(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete version');
    } finally {
      setDeletingVersion(false);
    }
  };

  const openEdit = (p: Prompt) => { setEditPrompt(p); setEditDesc(p.description ?? ''); };

  const saveEdit = async () => {
    if (!editPrompt) return;
    setSavingEdit(true);
    try {
      const r = await fetch(`/api/inference/prompts/${editPrompt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ description: editDesc.trim() || null }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Failed to update');
      toast.success(`Updated "${editPrompt.name}"`);
      setEditPrompt(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update prompt');
    } finally {
      setSavingEdit(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/inference/prompts/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Failed to delete');
      toast.success(`Deleted "${deleteTarget.name}"`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete prompt');
    } finally {
      setDeleting(false);
    }
  };

  const totalVersions = prompts.reduce((s, p) => s + (p.prompt_versions?.length ?? 0), 0);
  const deployed = prompts.reduce(
    (s, p) => s + (p.prompt_versions?.filter((v) => v.label).length ?? 0),
    0
  );

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: 'Inference', href: '/dashboard/services/inference' }}
        title="Prompts"
        accent="templates"
        caption="Versioned system-prompt templates with {{variable}} interpolation. Reference via X-Ahura-Prompt: name@label — the gateway injects the template before forwarding."
        size="md"
        actions={
          <>
            <GhostButton onClick={() => load()} disabled={loading || refreshing}>
              <RotateCw className={`h-3.5 w-3.5 ${loading || refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </GhostButton>
            <PrimaryButton onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New prompt
            </PrimaryButton>
          </>
        }
      />

      <StatsStrip>
        <StatCell label="Prompts" value={loading ? '—' : String(prompts.length)} hint="Named templates in this org" />
        <StatCell label="Versions" value={loading ? '—' : String(totalVersions)} hint="Immutable snapshots" accent={ACCENT} />
        <StatCell label="Deployed" value={loading ? '—' : String(deployed)} hint="Versions with a label" accent="#4ade80" />
      </StatsStrip>

      <SectionHead
        eyebrow="Inventory"
        title="Named"
        accent="prompts"
        rightMeta={prompts.length > 0 ? `${prompts.length} configured` : undefined}
      />

      {loading ? (
        <DataTable>
          {[1, 2, 3].map((i) => (
            <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto] gap-3 px-5 py-3 border-b border-white/[0.04] last:border-b-0 items-center">
              <div className="h-3.5 w-3.5 rounded bg-white/[0.06]" />
              <div className="h-3 w-40 rounded bg-white/[0.06] animate-pulse" />
              <div className="h-3 w-16 rounded bg-white/[0.04] animate-pulse" />
              <div className="h-3 w-12 rounded bg-white/[0.04] animate-pulse" />
              <div className="h-6 w-20 rounded bg-white/[0.04] animate-pulse" />
            </div>
          ))}
        </DataTable>
      ) : prompts.length > 0 ? (
        <DataTable>
          {refreshing && (
            <div className="h-0.5 w-full bg-[#0095FF]/20 overflow-hidden rounded-full">
              <div className="h-full bg-[#0095FF]/60 animate-pulse w-full" />
            </div>
          )}
          {prompts.map((p) => {
            const isExpanded = expanded === p.id;
            const versions = p.prompt_versions ?? [];
            const sortedVersions = [...versions].sort((a, b) => b.version - a.version);
            const deployedLabels = versions.filter((v) => v.label).map((v) => v.label!);

            return (
              <div key={p.id} className="border-b border-white/[0.04] last:border-b-0">
                {/* Prompt row */}
                <div
                  className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto] gap-3 px-5 py-3 hover:bg-white/[0.015] transition-colors items-center cursor-pointer"
                  onClick={() => setExpanded(isExpanded ? null : p.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-white/40" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-white/25" />
                  )}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileCode className="h-3.5 w-3.5 shrink-0 text-[#0095FF]/70" />
                    <span className={`${MONO} text-[12.5px] font-semibold text-white truncate`}>{p.name}</span>
                    {p.description && (
                      <span className={`${MONO} text-[10.5px] text-white/40 truncate hidden md:block`}>
                        — {p.description}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className={`${MONO} text-[11px] text-white/45`}>
                      {versions.length} {versions.length === 1 ? 'version' : 'versions'}
                    </span>
                    {deployedLabels.map((lbl) => (
                      <Badge
                        key={lbl}
                        variant="outline"
                        className={`${MONO} text-[9.5px] uppercase tracking-[0.1em] border-emerald-500/30 text-emerald-400/80`}
                      >
                        <Check className="h-2.5 w-2.5 mr-0.5" />
                        {lbl}
                      </Badge>
                    ))}
                  </div>
                  <span className={`${MONO} text-[11px] text-white/45`}>
                    {new Date(p.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <RowActionButton onClick={() => openCreateVersion(p)}>
                      <Plus className="h-3 w-3" />
                      Version
                    </RowActionButton>
                    <RowActionButton onClick={() => openEdit(p)}>
                      <Pencil className="h-3 w-3" />
                      Edit
                    </RowActionButton>
                    <RowActionButton onClick={() => setDeleteTarget(p)} variant="danger">
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </RowActionButton>
                  </span>
                </div>

                {/* Versions sub-table */}
                {isExpanded && versions.length > 0 && (
                  <div className="ml-8 border-l border-white/[0.06] mb-2">
                    <div className="hidden md:grid grid-cols-[minmax(0,0.3fr)_minmax(0,0.5fr)_minmax(0,2fr)_minmax(0,0.6fr)_auto] gap-3 px-5 py-2 border-b border-white/[0.04]">
                      <ColHead>Ver</ColHead>
                      <ColHead>Label</ColHead>
                      <ColHead>System prompt (preview)</ColHead>
                      <ColHead>Date</ColHead>
                      <span />
                    </div>
                    {sortedVersions.map((v) => {
                      const systemMsg = v.template.find((m) => m.role === 'system') ?? v.template[0];
                      return (
                        <div
                          key={v.id}
                          className="grid grid-cols-1 gap-2 px-5 py-2.5 border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.01] transition-colors md:grid-cols-[minmax(0,0.3fr)_minmax(0,0.5fr)_minmax(0,2fr)_minmax(0,0.6fr)_auto] md:items-center"
                        >
                          <span className={`${MONO} text-[11px] text-white/60 font-semibold`}>v{v.version}</span>
                          <div>
                            {v.label ? (
                              <Badge
                                variant="outline"
                                className={`${MONO} text-[9.5px] uppercase tracking-[0.1em] border-emerald-500/30 text-emerald-400/80`}
                              >
                                {v.label}
                              </Badge>
                            ) : (
                              <span className={`${MONO} text-[10px] text-white/25`}>—</span>
                            )}
                          </div>
                          <p className={`${MONO} text-[10.5px] text-white/55 truncate`}>
                            {systemMsg?.content?.slice(0, 120) ?? '(no system message)'}
                          </p>
                          <span className={`${MONO} text-[10.5px] text-white/40`}>
                            {new Date(v.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                          <span className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <RowActionButton onClick={() => setViewVersion({ prompt: p, version: v })}>
                              <Eye className="h-3 w-3" />
                              View
                            </RowActionButton>
                            <RowActionButton
                              onClick={() => { setLabelVersion({ prompt: p, version: v }); setLabelText(v.label ?? 'production'); }}
                            >
                              <Tag className="h-3 w-3" />
                              {v.label ? 'Redeploy' : 'Deploy'}
                            </RowActionButton>
                            {v.label && (
                              <RowActionButton onClick={() => setUndeployTarget({ prompt: p, version: v })}>
                                Undeploy
                              </RowActionButton>
                            )}
                            {!v.label && (
                              <RowActionButton onClick={() => setDeleteVersion({ prompt: p, version: v })} variant="danger">
                                <Trash2 className="h-3 w-3" />
                              </RowActionButton>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {isExpanded && versions.length === 0 && (
                  <div className="ml-8 border-l border-white/[0.06] px-5 py-4 mb-2">
                    <p className={`${MONO} text-[10.5px] text-white/35`}>
                      No versions yet.{' '}
                      <button
                        className="text-[#0095FF]/70 hover:text-[#0095FF] underline"
                        onClick={() => openCreateVersion(p)}
                      >
                        Add the first version
                      </button>
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </DataTable>
      ) : (
        <EmptyState
          title="No prompts yet"
          description="Create a named prompt template, add versions, then deploy a label. Reference via X-Ahura-Prompt: my-prompt@production on any request."
          action={
            <PrimaryButton onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Create your first prompt
            </PrimaryButton>
          }
        />
      )}

      {/* How-to */}
      <section className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5">
          <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45 mb-2`}>
            Reference a prompt
          </p>
          <h4 className="text-[14.5px] font-semibold tracking-[-0.01em] text-white mb-2">One header</h4>
          <pre className={`${MONO} text-[10.5px] text-white/65 leading-relaxed bg-black/40 border border-white/[0.06] rounded p-2.5 overflow-x-auto`}>
{`curl -X POST ${INFERENCE_API_BASE}/chat/completions \\
  -H "Authorization: Bearer ahu_live_..." \\
  -H "X-Ahura-Prompt: support-agent@production" \\
  -H "X-Ahura-Prompt-Vars: {\\"tier\\":\\"pro\\"}" \\
  -d '{"model":"...","messages":[...]}'`}
          </pre>
        </div>
        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5">
          <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45 mb-2`}>
            Variable interpolation
          </p>
          <h4 className="text-[14.5px] font-semibold tracking-[-0.01em] text-white mb-2">{"{{var}} syntax"}</h4>
          <p className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>
            Use <CodeChip>{"{{variable}}"}</CodeChip> in your template. Pass values via{' '}
            <CodeChip>X-Ahura-Prompt-Vars</CodeChip> as JSON. The gateway substitutes values
            before prepending messages. Caller messages are appended after the template.
          </p>
          <p className={`${MONO} mt-2 text-[10px] text-white/35`}>
            The resolved version number is returned as <CodeChip>X-Ahura-Prompt-Version</CodeChip>.
          </p>
        </div>
      </section>

      {/* ── Create prompt dialog ──────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md border-white/[0.08] bg-[#111216] flex flex-col max-h-[88vh] p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/[0.06] shrink-0">
            <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80`}>
              New prompt
            </DialogTitle>
            <DialogDescription className={`${MONO} text-[11px] text-white/45 leading-relaxed`}>
              The name is used in X-Ahura-Prompt: name@label. Add versions after creating.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
            <Field label="Name">
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="support-agent"
                className="bg-white/[0.02] border-white/[0.08]"
              />
            </Field>
            <Field label="Description (optional)">
              <Input
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                placeholder="Customer support system prompt"
                className="bg-white/[0.02] border-white/[0.08]"
              />
            </Field>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-white/[0.06] shrink-0 gap-2">
            <GhostButton onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</GhostButton>
            <PrimaryButton onClick={createPrompt} disabled={creating || !createName.trim()}>
              {creating ? 'Creating…' : 'Create prompt'}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add version dialog ────────────────────────────────── */}
      <Dialog open={!!versionPrompt} onOpenChange={(o) => { if (!o) setVersionPrompt(null); }}>
        <DialogContent className="max-w-xl border-white/[0.08] bg-[#111216] flex flex-col max-h-[88vh] p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/[0.06] shrink-0">
            <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80`}>
              New version — {versionPrompt?.name}
            </DialogTitle>
            <DialogDescription className={`${MONO} text-[11px] text-white/45 leading-relaxed`}>
              JSON array of messages or plain text (treated as system message). Use {"{{variable}}"} for interpolation.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
            <Field label="Template">
              <Textarea
                value={versionTemplate}
                onChange={(e) => setVersionTemplate(e.target.value)}
                placeholder={`[{"role":"system","content":"You are a helpful assistant for {{tier}} plan users."},{"role":"user","content":"{{question}}"}]`}
                rows={6}
                className="bg-white/[0.02] border-white/[0.08] font-mono text-[10.5px] resize-y min-h-[120px]"
              />
            </Field>
            <div className="space-y-3">
              <p className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/40`}>
                Model defaults (optional — caller always wins)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Temperature">
                  <Input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={versionTemp}
                    onChange={(e) => setVersionTemp(e.target.value)}
                    placeholder="0.7"
                    className="bg-white/[0.02] border-white/[0.08] text-[11px]"
                  />
                </Field>
                <Field label="Max tokens">
                  <Input
                    type="number"
                    min="1"
                    value={versionMaxTok}
                    onChange={(e) => setVersionMaxTok(e.target.value)}
                    placeholder="1024"
                    className="bg-white/[0.02] border-white/[0.08] text-[11px]"
                  />
                </Field>
              </div>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-white/[0.06] shrink-0 gap-2">
            <GhostButton onClick={() => setVersionPrompt(null)} disabled={savingVersion}>Cancel</GhostButton>
            <PrimaryButton onClick={saveVersion} disabled={savingVersion || !versionTemplate.trim()}>
              {savingVersion ? 'Saving…' : 'Create version'}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assign label dialog ───────────────────────────────── */}
      <Dialog open={!!labelVersion} onOpenChange={(o) => { if (!o) setLabelVersion(null); }}>
        <DialogContent className="max-w-sm border-white/[0.08] bg-[#111216] flex flex-col max-h-[88vh] p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/[0.06] shrink-0">
            <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80`}>
              Deploy label
            </DialogTitle>
            <DialogDescription className={`${MONO} text-[11px] text-white/45 leading-relaxed`}>
              Assign a label to{' '}
              <span className="text-white/70">{labelVersion?.prompt.name}</span> v{labelVersion?.version.version}.
              Any existing holder of this label is undeployed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-3">
            <Field label="Label">
              <Input
                value={labelText}
                onChange={(e) => setLabelText(e.target.value)}
                placeholder="production"
                className="bg-white/[0.02] border-white/[0.08]"
              />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {['production', 'staging', 'canary', 'latest'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setLabelText(preset)}
                  className={`${MONO} text-[9.5px] uppercase tracking-[0.1em] px-2 py-0.5 rounded border transition-colors ${
                    labelText === preset
                      ? 'bg-[#0095FF]/20 border-[#0095FF]/40 text-[#0095FF]'
                      : 'border-white/[0.08] text-white/40 hover:text-white/60'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-white/[0.06] shrink-0 gap-2">
            <GhostButton onClick={() => setLabelVersion(null)} disabled={savingLabel}>Cancel</GhostButton>
            <PrimaryButton onClick={assignLabel} disabled={savingLabel || !labelText.trim()}>
              {savingLabel ? 'Deploying…' : 'Deploy'}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View full template dialog ─────────────────────────── */}
      <Dialog open={!!viewVersion} onOpenChange={(o) => { if (!o) setViewVersion(null); }}>
        <DialogContent className="max-w-2xl border-white/[0.08] bg-[#111216] flex flex-col max-h-[88vh] p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/[0.06] shrink-0">
            <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80`}>
              {viewVersion?.prompt.name}
              <span className="ml-2 text-white/35">v{viewVersion?.version.version}</span>
              {viewVersion?.version.label && (
                <Badge variant="outline" className={`${MONO} ml-2 text-[9px] uppercase tracking-[0.1em] border-emerald-500/30 text-emerald-400/80`}>
                  {viewVersion.version.label}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className={`${MONO} text-[11px] text-white/40`}>
              Full template — read-only snapshot
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
            {viewVersion?.version.template.map((msg, i) => (
              <div key={i} className="space-y-1.5">
                <span className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] font-semibold ${
                  msg.role === 'system' ? 'text-[#0095FF]/70' : msg.role === 'assistant' ? 'text-purple-400/70' : 'text-emerald-400/70'
                }`}>
                  {msg.role}
                </span>
                <pre className={`${MONO} text-[11px] text-white/70 leading-relaxed whitespace-pre-wrap break-words bg-black/30 border border-white/[0.06] rounded px-3 py-2.5`}>
                  {msg.content}
                </pre>
              </div>
            ))}
            {viewVersion?.version.model_defaults && Object.keys(viewVersion.version.model_defaults).length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
                <span className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] font-semibold text-white/40`}>
                  Model defaults
                </span>
                <pre className={`${MONO} text-[11px] text-white/60 leading-relaxed bg-black/30 border border-white/[0.06] rounded px-3 py-2.5`}>
                  {JSON.stringify(viewVersion.version.model_defaults, null, 2)}
                </pre>
              </div>
            )}
          </div>
          <DialogFooter className="px-6 py-4 border-t border-white/[0.06] shrink-0">
            <GhostButton onClick={() => setViewVersion(null)}>Close</GhostButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit description dialog ───────────────────────────── */}
      <Dialog open={!!editPrompt} onOpenChange={(o) => { if (!o) setEditPrompt(null); }}>
        <DialogContent className="max-w-md border-white/[0.08] bg-[#111216] flex flex-col max-h-[88vh] p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/[0.06] shrink-0">
            <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80`}>
              Edit — {editPrompt?.name}
            </DialogTitle>
            <DialogDescription className={`${MONO} text-[11px] text-white/45 leading-relaxed`}>
              Name is immutable (used in X-Ahura-Prompt headers). Only description can be changed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
            <Field label="Description">
              <Input
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Customer support system prompt"
                className="bg-white/[0.02] border-white/[0.08]"
                autoFocus
              />
            </Field>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-white/[0.06] shrink-0 gap-2">
            <GhostButton onClick={() => setEditPrompt(null)} disabled={savingEdit}>Cancel</GhostButton>
            <PrimaryButton onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? 'Saving…' : 'Save'}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Undeploy label confirmation ───────────────────────── */}
      <AlertDialog open={!!undeployTarget} onOpenChange={() => setUndeployTarget(null)}>
        <AlertDialogContent className="border-white/[0.08] bg-[#111216]">
          <AlertDialogHeader>
            <AlertDialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80`}>
              Remove label
            </AlertDialogTitle>
            <AlertDialogDescription className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>
              Removing the &quot;{undeployTarget?.version.label}&quot; label from v{undeployTarget?.version.version}{' '}
              of &quot;{undeployTarget?.prompt.name}&quot; will purge the gateway KV entry immediately.
              Requests using <code>X-Ahura-Prompt: {undeployTarget?.prompt.name}@{undeployTarget?.version.label}</code> will get a 400.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              disabled={undeploying}
              className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] border-white/[0.08] bg-white/[0.02] text-white/75 hover:bg-white/[0.06]`}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={removeLabel}
              disabled={undeploying}
              className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] font-semibold bg-amber-600 hover:bg-amber-700`}
            >
              {undeploying ? 'Removing…' : 'Remove label'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete version confirmation ───────────────────────── */}
      <AlertDialog open={!!deleteVersion} onOpenChange={() => setDeleteVersion(null)}>
        <AlertDialogContent className="border-white/[0.08] bg-[#111216]">
          <AlertDialogHeader>
            <AlertDialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-red-300`}>
              Delete version
            </AlertDialogTitle>
            <AlertDialogDescription className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>
              Permanently delete v{deleteVersion?.version.version} of &quot;{deleteVersion?.prompt.name}&quot;.
              This cannot be undone. Only unlabeled versions can be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              disabled={deletingVersion}
              className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] border-white/[0.08] bg-white/[0.02] text-white/75 hover:bg-white/[0.06]`}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={removeVersion}
              disabled={deletingVersion}
              className={`${MONO} h-10 text-[11px] uppercase tracking-[0.12em] font-semibold bg-red-600 hover:bg-red-700`}
            >
              {deletingVersion ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete prompt confirmation ───────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="border-white/[0.08] bg-[#111216]">
          <AlertDialogHeader>
            <AlertDialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-red-300`}>
              Delete prompt
            </AlertDialogTitle>
            <AlertDialogDescription className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>
              Deleting &quot;{deleteTarget?.name}&quot; removes all its versions and immediately purges the gateway KV cache.
              Any live requests using this prompt will get a 400 prompt_not_found.
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
