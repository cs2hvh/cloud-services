'use client';

/**
 * Agent detail — Overview / Runs / Settings (S2.4 "richer management screens").
 *
 * Overview: config at a glance. Runs: history table, each row expands to a
 * per-step trace timeline (tokens / cost / latency / status). Settings: edit + delete.
 */
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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
  formatCost, relativeTime, statusKind, finalText, detailRows, delegateRunLink,
  buildToolsPayload, fileSearchCollectionOf,
  buildFunctionTools, functionToolsOf, type FnDef,
  buildMcpTools, mcpToolsOf, type McpDef,
  mcpSlugsOf, buildMcpSlugTools,
  buildAgentDelegateTools, agentDelegateToolsOf, type AgentDelegateDef,
} from '../_constants';
import { KnowledgeBasePicker } from '../_kb-picker';
import { FunctionToolsEditor, FUNCTION_TOOLS_DESCRIPTION } from '../_function-tools-editor';
import { McpServersEditor, MCP_SERVERS_DESCRIPTION } from '../_mcp-servers-editor';
import { AgentDelegatePicker } from '../_agent-delegate-picker';
import { AgentKeysTab } from '../_agent-keys-tab';

const AGENTS = '/api/agents';

/** Distinguishes tool chips of the same type (an agent can bind several MCP
 *  servers or custom functions — the whole point of the registry, doc 14 §4)
 *  so the Overview tab doesn't just show a wall of identical "mcp" chips. */
function toolChipLabel(t: { type: string; server_slug?: string; server_url?: string; name?: string; label?: string }): string {
  if (t.type === 'mcp') {
    if (t.server_slug) return `mcp: ${t.server_slug}`;
    if (t.server_url) { try { return `mcp: ${new URL(t.server_url).host}`; } catch { /* fall through */ } }
  }
  if (t.type === 'function' && t.name) return `function: ${t.name}`;
  if (t.type === 'agent' && t.label) return `agent: ${t.label}`;
  return t.type;
}

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

/** Which credential started a run — doc 15. Absent (both null) means the
 *  dashboard itself (session-authed playground/run button), not a key at
 *  all. Lets an agent bound to both a private backend key and a public
 *  widget key tell "my own testing" apart from "real external traffic". */
function RunSourceTag({ keyName, tier }: { keyName: string | null; tier: 'private' | 'public' | null }) {
  if (!keyName) {
    return <span className={`${MONO} text-[9.5px] uppercase tracking-[0.08em] text-white/25 shrink-0`}>dashboard</span>;
  }
  return (
    <span
      className={`${MONO} inline-flex items-center gap-1 text-[9.5px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded shrink-0 truncate max-w-[140px] ${
        tier === 'public' ? 'bg-[#33adff]/10 text-[#66c2ff]' : 'bg-white/[0.06] text-white/45'
      }`}
      title={`${tier} key: ${keyName}`}
    >
      {tier}: {keyName}
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
      {detail.steps.map((s: RunStep) => {
        const rows = detailRows(s.detail);
        const header = (
          <div className="grid grid-cols-[auto_auto_1fr_auto] gap-3 px-5 py-2 items-center">
            <span className={`${MONO} text-[10px] text-white/25 tabular-nums w-4`}>{s.step_index}</span>
            <StepIcon type={s.step_type} />
            <div className="flex items-center gap-2 min-w-0">
              <span className={`${MONO} text-[10px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-white/[0.05] text-white/60`}>
                {s.step_type}{s.tool_name ? `·${s.tool_name}` : ''}
              </span>
              {s.status !== 'success' && <span className="text-[10px] text-red-400">error</span>}
              {s.unit_label && s.units != null && <span className={`${MONO} text-[10px] text-white/35`}>{s.units} {s.unit_label}</span>}
              {rows.length > 0 && <span className="text-[10px] text-white/25 group-open:hidden">▸ details</span>}
            </div>
            <span className={`${MONO} text-[10px] text-white/40 tabular-nums text-right`}>
              {s.input_tokens != null ? `${s.input_tokens}→${s.output_tokens ?? 0} tok · ` : ''}
              {s.latency_ms != null ? `${s.latency_ms}ms · ` : ''}{formatCost(s.cost_cents)}
            </span>
          </div>
        );
        return rows.length === 0 ? (
          <div key={s.step_index} className="border-b border-white/[0.03]">{header}</div>
        ) : (
          <details key={s.step_index} className="group border-b border-white/[0.03]">
            <summary className="cursor-pointer list-none hover:bg-white/[0.02]">{header}</summary>
            <div className="px-5 pb-3 pl-14 space-y-1.5">
              {rows.map(([label, text]) => {
                const link = delegateRunLink(s.step_type, label, s.detail);
                return (
                  <div key={label}>
                    <div className={`${MONO} text-[9px] uppercase tracking-[0.14em] text-white/30 mb-0.5`}>{label}</div>
                    {link ? (
                      <Link
                        href={link}
                        className={`${MONO} text-[11px] text-[#33adff] hover:underline bg-black/30 rounded px-2 py-1.5 block break-words`}
                      >
                        {text} → view sub-run trace
                      </Link>
                    ) : (
                      <pre className={`${MONO} text-[11px] text-white/70 whitespace-pre-wrap break-words bg-black/30 rounded px-2 py-1.5 max-h-52 overflow-auto`}>{text}</pre>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}
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
  return (
    <Suspense fallback={<PageCanvas><div className="py-24 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div></PageCanvas>}>
      <AgentDetailInner />
    </Suspense>
  );
}

const TABS = ['overview', 'runs', 'keys', 'settings'] as const;

function AgentDetailInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  // Deep-link support (added for agent-delegation traces, doc 18): a
  // delegation step's `sub_run_id` links to `?tab=runs&run={id}` on the
  // TARGET agent's own page — this is the only consumer of `run`.
  const deepLinkTab = searchParams.get('tab');
  const deepLinkRun = searchParams.get('run');

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'runs' | 'keys' | 'settings'>(
    (TABS as readonly string[]).includes(deepLinkTab ?? '') ? (deepLinkTab as typeof TABS[number]) : 'overview'
  );

  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(deepLinkRun);
  // Found missing during the "whole agent UI" gap review (2026-07-08): once
  // an agent has real public/private key traffic mixed with dashboard
  // testing, a flat unfilterable list gets unscannable fast.
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [runsRefreshNonce, setRunsRefreshNonce] = useState(0);

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
      // Bumps TraceTimeline's key below so an already-expanded run's trace
      // panel actually remounts and refetches too — found showing stale
      // status after Cancel (the collapsed row's StatusPill updated from
      // this same refresh, but the expanded panel below it fetches once on
      // mount and never again, so it kept showing "running" after a cancel
      // until manually collapsed and reopened).
      setRunsRefreshNonce((n) => n + 1);
    } finally { setRunsLoading(false); }
  }, [id]);

  useEffect(() => { void loadAgent(); }, [loadAgent]);
  useEffect(() => { if (tab === 'runs') void loadRuns(); }, [tab, loadRuns]);

  const cancelRun = useCallback(async (runId: string) => {
    setCancellingId(runId);
    try {
      const r = await fetch(`${AGENTS}/runs/${runId}/cancel`, { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed to cancel');
      toast.success(j.status === 'cancelled' ? 'Run cancelled' : `Run already ${j.status}`);
      await loadRuns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel run');
    } finally {
      setCancellingId(null);
    }
  }, [loadRuns]);

  const NON_TERMINAL = new Set(['queued', 'running', 'requires_action']);
  const filteredRuns = runs.filter((run) => {
    if (statusFilter !== 'all' && run.status !== statusFilter) return false;
    if (sourceFilter === 'dashboard' && run.key_name) return false;
    if (sourceFilter === 'private' && run.key_tier !== 'private') return false;
    if (sourceFilter === 'public' && run.key_tier !== 'public') return false;
    return true;
  });

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
        {(['overview', 'runs', 'keys', 'settings'] as const).map((t) => (
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
                {agent.tools.map((t, i) => (
                  // Index in the key: an agent can bind several tools of the
                  // SAME type (e.g. two mcp servers — the whole point of the
                  // registry, doc 14 §4), so `t.type` alone collides (found
                  // live: "two children with the same key, mcp").
                  <span key={`${t.type}-${i}`} className={`${MONO} inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded bg-[#0095FF]/10 text-[#66c2ff]`}>
                    <Wrench className="h-3 w-3" /> {toolChipLabel(t)}
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
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] gap-3 flex-wrap">
            <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40 shrink-0`}>Run history</span>
            <div className="flex items-center gap-2 ml-auto">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`${MONO} h-7 rounded-md bg-white/[0.03] border border-white/[0.08] px-2 text-[10.5px] text-white/70`}
              >
                <option value="all">All statuses</option>
                {['queued', 'running', 'requires_action', 'completed', 'failed', 'cancelled', 'expired'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className={`${MONO} h-7 rounded-md bg-white/[0.03] border border-white/[0.08] px-2 text-[10.5px] text-white/70`}
              >
                <option value="all">All sources</option>
                <option value="dashboard">Dashboard only</option>
                <option value="private">Private keys</option>
                <option value="public">Public keys</option>
              </select>
              <button onClick={loadRuns} className="text-white/40 hover:text-white/70 shrink-0"><RotateCw className={`h-3.5 w-3.5 ${runsLoading ? 'animate-spin' : ''}`} /></button>
            </div>
          </div>
          {runsLoading && runs.length === 0 ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-white/30" /></div>
          ) : runs.length === 0 ? (
            <div className="py-12 text-center text-white/35 text-sm">No runs yet — <Link href={`/dashboard/services/agents/playground?agent=${agent.id}`} className="text-[#33adff]">run it in the playground</Link>.</div>
          ) : filteredRuns.length === 0 ? (
            <div className="py-12 text-center text-white/35 text-sm">No runs match this filter.</div>
          ) : (
            filteredRuns.map((run) => (
              <div key={run.id} className="border-b border-white/[0.04]">
                <div
                  onClick={() => setExpanded(expanded === run.id ? null : run.id)}
                  role="button"
                  tabIndex={0}
                  className="w-full grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 px-4 py-3 items-center hover:bg-white/[0.02] text-left cursor-pointer"
                >
                  {expanded === run.id ? <ChevronDown className="h-3.5 w-3.5 text-white/40" /> : <ChevronRight className="h-3.5 w-3.5 text-white/40" />}
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusPill status={run.status} />
                    <RunSourceTag keyName={run.key_name} tier={run.key_tier} />
                  </div>
                  <span className={`${MONO} text-[11px] text-white/50 tabular-nums`}>{run.step_count} steps</span>
                  <span className={`${MONO} text-[11px] text-white/70 tabular-nums`}>{formatCost(run.cost_cents)}</span>
                  <span className={`${MONO} text-[11px] text-white/35`}>{relativeTime(run.created_at)}</span>
                  {NON_TERMINAL.has(run.status) ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); void cancelRun(run.id); }}
                      disabled={cancellingId === run.id}
                      className={`${MONO} text-[10px] uppercase tracking-[0.08em] text-red-300/70 hover:text-red-300 px-2 py-1 rounded border border-red-400/20 hover:border-red-400/40 disabled:opacity-50`}
                    >
                      {cancellingId === run.id ? '…' : 'Cancel'}
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
                {expanded === run.id && <TraceTimeline key={`${run.id}-${runsRefreshNonce}`} runId={run.id} />}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'keys' && <AgentKeysTab agentId={agent.id} />}

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
function PurgeMemoriesBox({ agentId }: { agentId: string }) {
  const [open, setOpen] = useState(false);
  const [purging, setPurging] = useState(false);

  const purge = async () => {
    setPurging(true);
    try {
      const r = await fetch(`${AGENTS}/${agentId}/memories`, { method: 'DELETE' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed to purge memories');
      toast.success(j.purged > 0 ? `Purged ${j.purged} memor${j.purged === 1 ? 'y' : 'ies'}` : 'No memories to purge');
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to purge memories');
    } finally {
      setPurging(false);
    }
  };

  return (
    <>
      <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/[0.03] p-4 flex items-center justify-between">
        <div>
          <div className="text-sm text-white/80">Purge stored memories</div>
          {/* No browse view exists (by design — memory is written/read by the
             agent itself via the `memory` tool, not meant to be a customer-
             facing data store) — this is a right-to-erasure control, not a
             viewer. Found missing entirely from the dashboard during a UI-
             completeness review (2026-07-18): the purge API has existed
             since S5, with no button anywhere to reach it. */}
          <div className="text-[11px] text-white/40">Erases every fact this agent has written to its own long-term memory. Cannot be undone or viewed beforehand.</div>
        </div>
        <GhostButton onClick={() => setOpen(true)}><Trash2 className="h-3.5 w-3.5" /> Purge</GhostButton>
      </div>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Purge this agent&rsquo;s memories?</AlertDialogTitle>
            <AlertDialogDescription>Deletes every stored memory for this agent. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purging}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={purging} onClick={(e) => { e.preventDefault(); void purge(); }}>
              {purging ? 'Purging…' : 'Purge'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SettingsTab({ agent, onSaved, onDelete }: { agent: Agent; onSaved: () => void; onDelete: () => void }) {
  const [name, setName] = useState(agent.name);
  const [model, setModel] = useState(agent.model);
  const [prompt, setPrompt] = useState(agent.system_prompt ?? '');
  const [guardrail, setGuardrail] = useState(agent.guardrail);
  const [maxSteps, setMaxSteps] = useState(agent.max_steps);
  const [maxCost, setMaxCost] = useState(agent.max_cost_cents);
  // Only seed the checkbox-toggle types from HOSTED_TOOLS — 'mcp'/'function'
  // rows are managed by their own editors below (mcpServers/mcpSlugs/functions)
  // and rebuilt from those on save. Including them here would re-emit them a
  // SECOND time as content-free `{type:"mcp"}`/`{type:"function"}` stubs via
  // buildToolsPayload (found by simulating repeated saves: each Settings save
  // permanently doubled the dead-entry count, since agent.tools on next load
  // already contains the previous save's dead stubs too — real, unbounded
  // tools-array bloat, not just a cosmetic issue).
  const hostedToolTypes = new Set(HOSTED_TOOLS.map((t) => t.type));
  const [tools, setTools] = useState<string[]>(agent.tools.map((t) => t.type).filter((t) => hostedToolTypes.has(t)));
  const [fileSearchCollectionId, setFileSearchCollectionId] = useState(fileSearchCollectionOf(agent.tools));
  const [functions, setFunctions] = useState<FnDef[]>(functionToolsOf(agent.tools as unknown as Record<string, unknown>[]));
  const [mcpServers, setMcpServers] = useState<McpDef[]>(mcpToolsOf(agent.tools as unknown as Record<string, unknown>[]));
  const [mcpSlugs, setMcpSlugs] = useState<string[]>(mcpSlugsOf(agent.tools as unknown as Record<string, unknown>[]));
  const [delegates, setDelegates] = useState<AgentDelegateDef[]>(agentDelegateToolsOf(agent.tools as unknown as Record<string, unknown>[]));
  const [saving, setSaving] = useState(false);

  const toggle = (type: string) => setTools((ts) => ts.includes(type) ? ts.filter((t) => t !== type) : [...ts, type]);

  async function save() {
    if (tools.includes('file_search') && !fileSearchCollectionId) {
      toast.error('Pick a knowledge base for File search');
      return;
    }
    const fn = buildFunctionTools(functions);
    if (fn.error) { toast.error(fn.error); return; }
    const mcp = buildMcpTools(mcpServers);
    if (mcp.error) { toast.error(mcp.error); return; }
    const delegate = buildAgentDelegateTools(delegates);
    if (delegate.error) { toast.error(delegate.error); return; }
    setSaving(true);
    try {
      const r = await fetch(`${AGENTS}/${agent.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, model, system_prompt: prompt.trim() || null, guardrail, max_steps: maxSteps, max_cost_cents: maxCost,
          tools: [
            ...buildToolsPayload(tools, fileSearchCollectionId),
            ...(fn.tools ?? []),
            ...(mcp.tools ?? []),
            ...buildMcpSlugTools(mcpSlugs),
            ...(delegate.tools ?? []),
          ],
        }),
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

          <div className="space-y-2">
            <span className={fieldLabel}>Custom functions</span>
            <div className="text-[11px] text-white/40">{FUNCTION_TOOLS_DESCRIPTION}</div>
            <FunctionToolsEditor value={functions} onChange={setFunctions} />
          </div>

          <div className="space-y-2">
            <span className={fieldLabel}>MCP servers</span>
            <div className="text-[11px] text-white/40">{MCP_SERVERS_DESCRIPTION}</div>
            <McpServersEditor slugs={mcpSlugs} onSlugsChange={setMcpSlugs} rows={mcpServers} onRowsChange={setMcpServers} />
          </div>

          <div className="space-y-2">
            <span className={fieldLabel}>Agent delegation</span>
            <div className="text-[11px] text-white/40">Let this agent call another of your agents as a tool — internal-only, not cross-org.</div>
            <AgentDelegatePicker value={delegates} onChange={setDelegates} currentAgentId={agent.id} />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-white/[0.06] flex justify-end">
          <PrimaryButton onClick={save} disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save changes</PrimaryButton>
        </div>
      </div>
      <PurgeMemoriesBox agentId={agent.id} />
      <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-4 flex items-center justify-between">
        <div><div className="text-sm text-white/80">Delete this agent</div><div className="text-[11px] text-white/40">Run history is preserved.</div></div>
        <GhostButton onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /> Delete</GhostButton>
      </div>
    </div>
  );
}
