'use client';

/**
 * Agent detail — Overview / Runs / Settings (S2.4 "richer management screens").
 *
 * Overview: config at a glance. Runs: history table, each row expands to a
 * per-step trace timeline (tokens / cost / latency / status). Settings: edit + delete.
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronRight, ChevronDown, RotateCw, Trash2, Loader2, Play,
  CheckCircle2, XCircle, Clock, Ban, Cpu, Search, Wrench, Layers, DollarSign, Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  PageCanvas, Hero, PrimaryButton, GhostButton, MONO, StatusLabel, EmptyState,
} from '@/components/dashboard/inference/chrome';
import {
  MODEL_OPTIONS, HOSTED_TOOLS, type Agent, type RunListItem, type RunDetail, type RunStep,
  formatCost, relativeTime, statusKind, finalText,
  buildToolsPayload, fileSearchCollectionOf,
} from '../_constants';
import { KnowledgeBasePicker } from '../_kb-picker';

const AGENTS = '/api/agents';

function StatusPill({ status }: { status: string }) {
  const kind = statusKind(status);
  const Icon = kind === 'ok' ? CheckCircle2 : kind === 'error' ? XCircle : kind === 'neutral' ? Ban : Clock;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className={`h-3.5 w-3.5 ${kind === 'ok' ? 'text-green-400' : kind === 'error' ? 'text-red-400' : kind === 'info' ? 'text-[#33adff]' : 'text-white/40'} ${status === 'running' ? 'animate-pulse' : ''}`} />
      <StatusLabel status={kind}>{status}</StatusLabel>
    </span>
  );
}

function MetricCard({
  icon: Icon, label, value, sub, accent,
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#111216] p-4 hover:border-white/[0.14] transition-colors">
      <div className="flex items-center gap-2 mb-2.5">
        <Icon className={`h-3.5 w-3.5 ${accent ? 'text-[#33adff]' : 'text-white/40'}`} />
        <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40`}>{label}</span>
      </div>
      <div className="text-[22px] leading-none font-semibold text-white truncate" title={value}>{value}</div>
      {sub && <div className="text-[11px] text-white/35 mt-1.5 truncate">{sub}</div>}
    </div>
  );
}

function StepIcon({ type }: { type: string }) {
  const cls = 'h-3.5 w-3.5';
  if (type === 'web_search') return <Search className={`${cls} text-[#33adff]`} />;
  if (type === 'model') return <Cpu className={`${cls} text-white/45`} />;
  return <Wrench className={`${cls} text-white/45`} />;
}

// ── Trace timeline (expanded run) ─────────────────────────────────────────────
function TraceTimeline({ runId }: { runId: string }) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await fetch(`${AGENTS}/runs/${runId}/trace`);
        const j = await r.json();
        if (live) setDetail(r.ok ? j.data : null);
      } finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [runId]);

  if (loading) return <div className="py-4 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-white/30" /></div>;
  if (!detail) return <div className="py-3 px-4 text-white/40 text-xs">Failed to load trace.</div>;

  const out = finalText(detail);
  return (
    <div className="bg-[#0c0d10] border-t border-white/[0.05]">
      {detail.steps.length === 0 && <div className="px-5 py-3 text-white/35 text-xs">No steps recorded.</div>}
      {detail.steps.map((s: RunStep) => (
        <div key={s.step_index} className="grid grid-cols-[auto_auto_1fr_auto] gap-3 px-5 py-2 items-center border-b border-white/[0.03]">
          <span className={`${MONO} text-[10px] text-white/25 tabular-nums w-4`}>{s.step_index}</span>
          <StepIcon type={s.step_type} />
          <div className="flex items-center gap-2 min-w-0">
            <span className={`${MONO} text-[10px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-white/[0.05] text-white/60`}>
              {s.step_type}{s.tool_name ? `·${s.tool_name}` : ''}
            </span>
            {s.status !== 'success' && <span className="text-[10px] text-red-400">error</span>}
            {s.unit_label && s.units != null && <span className={`${MONO} text-[10px] text-white/35`}>{s.units} {s.unit_label}</span>}
          </div>
          <span className={`${MONO} text-[10px] text-white/40 tabular-nums text-right`}>
            {s.input_tokens != null ? `${s.input_tokens}→${s.output_tokens ?? 0} tok · ` : ''}
            {s.latency_ms != null ? `${s.latency_ms}ms · ` : ''}{formatCost(s.cost_cents)}
          </span>
        </div>
      ))}
      {out && (
        <div className="px-5 py-3 border-t border-white/[0.05]">
          <div className={`${MONO} text-[9.5px] uppercase tracking-[0.14em] text-white/30 mb-1`}>Output</div>
          <div className="text-[12.5px] text-white/80 whitespace-pre-wrap line-clamp-6">{out}</div>
        </div>
      )}
      {detail.error && <div className="px-5 py-3 border-t border-white/[0.05] text-[12.5px] text-red-400">{detail.error}</div>}
    </div>
  );
}

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'runs' | 'settings'>('overview');

  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadAgent = useCallback(async () => {
    try {
      const r = await fetch(`${AGENTS}/${id}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed to load agent');
      setAgent(j.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load');
    } finally { setLoading(false); }
  }, [id]);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const r = await fetch(`${AGENTS}/runs?agent_id=${id}`);
      const j = await r.json();
      if (r.ok) setRuns(j.data ?? []);
    } finally { setRunsLoading(false); }
  }, [id]);

  useEffect(() => { void loadAgent(); }, [loadAgent]);
  useEffect(() => { if (tab === 'runs') void loadRuns(); }, [tab, loadRuns]);

  if (loading) return <PageCanvas><div className="py-24 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div></PageCanvas>;
  if (!agent) return <PageCanvas><EmptyState title="Agent not found" description="It may have been deleted." action={<Link href="/dashboard/services/agents" className="text-[#33adff] text-sm">← Back to agents</Link>} /></PageCanvas>;

  return (
    <PageCanvas>
      <div className="mx-auto w-full max-w-5xl space-y-5">
      <Hero
        breadcrumb={{ label: 'Agents', href: '/dashboard/services/agents' }}
        title={agent.name}
        size="md"
        caption={`${agent.model} · ${agent.tools.length} tool${agent.tools.length === 1 ? '' : 's'} · updated ${relativeTime(agent.updated_at)}`}
        actions={
          <Link href={`/dashboard/services/agents/playground?agent=${agent.id}`}>
            <PrimaryButton><Play className="h-3.5 w-3.5" /> Run</PrimaryButton>
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard icon={Cpu} label="Model" value={agent.model.split('/').pop() || agent.model} sub={agent.model} accent />
        <MetricCard icon={Layers} label="Max steps" value={String(agent.max_steps)} sub="Loop ceiling" />
        <MetricCard icon={DollarSign} label="Cost cap" value={formatCost(agent.max_cost_cents)} sub="Per run" />
        <MetricCard icon={Shield} label="Guardrail" value={agent.guardrail} sub="Policy" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] mb-4">
        {(['overview', 'runs', 'settings'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`${MONO} text-[11px] uppercase tracking-[0.12em] px-3 py-2.5 border-b-2 -mb-px transition-colors ${tab === t ? 'text-white border-[#0095FF]' : 'text-white/45 border-transparent hover:text-white/70'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-white/[0.06] bg-[#111216] rounded-xl p-4">
            <div className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/35 mb-3`}>System prompt</div>
            <div className="text-[13px] text-white/80 whitespace-pre-wrap">{agent.system_prompt || <span className="text-white/30">— none —</span>}</div>
          </div>
          <div className="border border-white/[0.06] bg-[#111216] rounded-xl p-4 space-y-3">
            <div className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/35`}>Tools</div>
            {agent.tools.length === 0 ? (
              <div className="text-white/30 text-sm">No tools — model-only.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {agent.tools.map((t) => (
                  <span key={t.type} className={`${MONO} inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded bg-[#0095FF]/10 text-[#66c2ff]`}>
                    <Wrench className="h-3 w-3" /> {t.type}
                  </span>
                ))}
              </div>
            )}
            <div className="pt-2 border-t border-white/[0.05] text-[11px] text-white/40 space-y-1">
              <div>Created {relativeTime(agent.created_at)}</div>
              <div>Updated {relativeTime(agent.updated_at)}</div>
              <div className={MONO}>{agent.id}</div>
            </div>
          </div>
        </div>
      )}

      {tab === 'runs' && (
        <div className="border border-white/[0.06] bg-[#111216] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
            <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40`}>Run history</span>
            <button onClick={loadRuns} className="text-white/40 hover:text-white/70"><RotateCw className={`h-3.5 w-3.5 ${runsLoading ? 'animate-spin' : ''}`} /></button>
          </div>
          {runsLoading && runs.length === 0 ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-white/30" /></div>
          ) : runs.length === 0 ? (
            <div className="py-12 text-center text-white/35 text-sm">No runs yet — <Link href={`/dashboard/services/agents/playground?agent=${agent.id}`} className="text-[#33adff]">run it in the playground</Link>.</div>
          ) : (
            runs.map((run) => (
              <div key={run.id} className="border-b border-white/[0.04]">
                <button
                  onClick={() => setExpanded(expanded === run.id ? null : run.id)}
                  className="w-full grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-4 py-3 items-center hover:bg-white/[0.02] text-left"
                >
                  {expanded === run.id ? <ChevronDown className="h-3.5 w-3.5 text-white/40" /> : <ChevronRight className="h-3.5 w-3.5 text-white/40" />}
                  <StatusPill status={run.status} />
                  <span className={`${MONO} text-[11px] text-white/50 tabular-nums`}>{run.step_count} steps</span>
                  <span className={`${MONO} text-[11px] text-white/70 tabular-nums`}>{formatCost(run.cost_cents)}</span>
                  <span className={`${MONO} text-[11px] text-white/35`}>{relativeTime(run.created_at)}</span>
                </button>
                {expanded === run.id && <TraceTimeline runId={run.id} />}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'settings' && (
        <SettingsTab agent={agent} onSaved={loadAgent} onDelete={() => setDeleteOpen(true)} />
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{agent.name}”?</AlertDialogTitle>
            <AlertDialogDescription>Removes the agent definition; past run history is preserved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={async (e) => {
                e.preventDefault(); setDeleting(true);
                try {
                  const r = await fetch(`${AGENTS}/${agent.id}`, { method: 'DELETE' });
                  if (!r.ok) throw new Error('Delete failed');
                  toast.success('Agent deleted');
                  router.push('/dashboard/services/agents');
                } catch (err) { toast.error(err instanceof Error ? err.message : 'Delete failed'); setDeleting(false); }
              }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </PageCanvas>
  );
}

// ── Settings tab (edit form) ──────────────────────────────────────────────────
function SettingsTab({ agent, onSaved, onDelete }: { agent: Agent; onSaved: () => void; onDelete: () => void }) {
  const [name, setName] = useState(agent.name);
  const [model, setModel] = useState(agent.model);
  const [prompt, setPrompt] = useState(agent.system_prompt ?? '');
  const [guardrail, setGuardrail] = useState(agent.guardrail);
  const [maxSteps, setMaxSteps] = useState(agent.max_steps);
  const [maxCost, setMaxCost] = useState(agent.max_cost_cents);
  const [tools, setTools] = useState<string[]>(agent.tools.map((t) => t.type));
  const [fileSearchCollectionId, setFileSearchCollectionId] = useState(fileSearchCollectionOf(agent.tools));
  const [saving, setSaving] = useState(false);

  const toggle = (type: string) => setTools((ts) => ts.includes(type) ? ts.filter((t) => t !== type) : [...ts, type]);

  async function save() {
    if (tools.includes('file_search') && !fileSearchCollectionId) {
      toast.error('Pick a knowledge base for File search');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`${AGENTS}/${agent.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, model, system_prompt: prompt.trim() || null, guardrail, max_steps: maxSteps, max_cost_cents: maxCost, tools: buildToolsPayload(tools, fileSearchCollectionId) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Save failed');
      toast.success('Saved'); onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  const selCls = `w-full h-9 rounded-xl bg-[#0c0d10] border border-white/[0.1] px-3 text-sm text-white/90 ${MONO}`;
  const fieldLabel = `${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40`;
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-white/[0.07] bg-[#111216] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <div className="text-sm font-medium text-white/90">Configuration</div>
          <div className="text-[11px] text-white/40 mt-0.5">Changes apply to this agent’s future runs.</div>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5"><span className={fieldLabel}>Name</span><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><span className={fieldLabel}>Model</span>
              <select value={model} onChange={(e) => setModel(e.target.value)} className={selCls}>
                {MODEL_OPTIONS.map((g) => <optgroup key={g.provider} label={g.provider}>{g.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5"><span className={fieldLabel}>System prompt</span><Textarea rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-1.5"><span className={fieldLabel}>Max steps</span><Input type="number" min={1} max={100} value={maxSteps} onChange={(e) => setMaxSteps(Number(e.target.value))} /></div>
            <div className="space-y-1.5"><span className={fieldLabel}>Max cost (cents)</span><Input type="number" min={1} value={maxCost} onChange={(e) => setMaxCost(Number(e.target.value))} /></div>
            <div className="space-y-1.5"><span className={fieldLabel}>Guardrail</span>
              <select value={guardrail} onChange={(e) => setGuardrail(e.target.value)} className={selCls}>
                <option value="off">Off</option><option value="warn">Warn</option><option value="block">Block</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <span className={fieldLabel}>Tools</span>
            <div className="flex flex-wrap gap-2">
              {HOSTED_TOOLS.map((t) => {
                const on = tools.includes(t.type);
                return (
                  <label
                    key={t.type}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] transition-colors ${
                      !t.enabled ? 'border-white/[0.05] text-white/25 cursor-not-allowed'
                        : on ? 'border-[#0095FF]/50 bg-[#0095FF]/10 text-white cursor-pointer'
                        : 'border-white/[0.08] text-white/60 hover:border-white/[0.16] cursor-pointer'
                    }`}
                  >
                    <input type="checkbox" disabled={!t.enabled} checked={on} onChange={() => t.enabled && toggle(t.type)} className="accent-[#0095FF]" />
                    {t.label}{t.note ? ` · ${t.note}` : ''}
                  </label>
                );
              })}
            </div>
            {tools.includes('file_search') && (
              <div className="pt-2">
                <KnowledgeBasePicker value={fileSearchCollectionId} onChange={setFileSearchCollectionId} />
              </div>
            )}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-white/[0.06] flex justify-end">
          <PrimaryButton onClick={save} disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save changes</PrimaryButton>
        </div>
      </div>
      <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-4 flex items-center justify-between">
        <div><div className="text-sm text-white/80">Delete this agent</div><div className="text-[11px] text-white/40">Run history is preserved.</div></div>
        <GhostButton onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /> Delete</GhostButton>
      </div>
    </div>
  );
}
