'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, RotateCw, Trash2, Play, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, Clock, Loader2, FlaskConical, Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DataTable, EmptyState, GhostButton, Hero,
  MONO, PageCanvas, PrimaryButton, RowActionButton, SectionHead,
  StatCell, StatsStrip, ColHead,
} from '@/components/dashboard/inference/chrome';

const BASE = '/api/inference/evals';

const MODEL_OPTIONS = [
  {
    provider: 'OpenAI',
    color: 'text-emerald-400',
    models: [
      { id: 'openai/gpt-4o',      label: 'GPT-4o' },
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'openai/gpt-4.1',     label: 'GPT-4.1' },
      { id: 'openai/o3',          label: 'o3' },
    ],
  },
  {
    provider: 'Anthropic',
    color: 'text-orange-400',
    models: [
      { id: 'anthropic/claude-opus-4-8',   label: 'Opus 4.8' },
      { id: 'anthropic/claude-sonnet-4-6', label: 'Sonnet 4.6' },
      { id: 'anthropic/claude-haiku-4-5',  label: 'Haiku 4.5' },
    ],
  },
  {
    provider: 'Google',
    color: 'text-blue-400',
    models: [
      { id: 'google/gemini-2.5-pro',   label: 'Gemini 2.5 Pro' },
      { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    ],
  },
  {
    provider: 'DeepSeek',
    color: 'text-violet-400',
    models: [
      { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1' },
    ],
  },
  {
    provider: 'Meta',
    color: 'text-cyan-400',
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
    ],
  },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface EvalCase {
  id: string;
  input: Array<{ role: string; content: string }>;
  expected: string | null;
  tags: string[];
  created_at: string;
}

interface EvalDataset {
  id: string;
  name: string;
  description: string | null;
  case_count: number;
  created_at: string;
  updated_at: string;
  cases?: EvalCase[];
}

interface EvalRun {
  id: string;
  name: string;
  model_id: string;
  scorer_type: 'llm_judge' | 'exact' | 'contains' | 'regex' | 'json_schema';
  scorer_config: Record<string, unknown>;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  total_cases: number;
  completed_cases: number;
  failed_cases: number;
  avg_score: number | null;
  cost_cents: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  eval_datasets?: { id: string; name: string };
  results?: EvalResult[];
}

interface EvalResult {
  id: string;
  case_id: string;
  output: string | null;
  score: number | null;
  passed: boolean | null;
  scorer_reasoning: string | null;
  status: string;
  latency_ms: number | null;
  cost_cents: number;
  error: string | null;
  created_at: string;
  eval_cases?: { input: Array<{ role: string; content: string }>; expected: string | null; tags: string[] };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, string> = {
    queued: 'bg-yellow-500/15 text-yellow-400',
    running: 'bg-blue-500/15 text-blue-400',
    completed: 'bg-green-500/15 text-green-400',
    failed: 'bg-red-500/15 text-red-400',
    cancelled: 'bg-zinc-500/15 text-zinc-400',
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${MONO} uppercase tracking-wide ${map[status] ?? 'bg-zinc-500/15 text-zinc-400'}`}>
      {status}
    </span>
  );
}

function ScoreBar({ score }: { score: number | null }) {
  if (score == null) return <span className="text-white/30 text-sm">—</span>;
  const pct = Math.round(score * 100);
  const color = score >= 0.8 ? 'bg-green-500' : score >= 0.5 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[11px] tabular-nums ${MONO} text-white/70`}>{pct}%</span>
    </div>
  );
}

function ResultSummary({ results }: { results: EvalResult[] }) {
  const passed  = results.filter((r) => r.status === 'completed' && r.score != null && r.score >= 0.5).length;
  const failed  = results.filter((r) => r.status === 'completed' && r.score != null && r.score < 0.5).length;
  const errored = results.filter((r) => r.status === 'failed').length;
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/35`}>
        {results.length} result{results.length !== 1 ? 's' : ''}
      </span>
      {passed  > 0 && <span className={`${MONO} text-[10px] text-green-400`}>{passed} passed</span>}
      {failed  > 0 && <span className={`${MONO} text-[10px] text-red-400`}>{failed} failed</span>}
      {errored > 0 && <span className={`${MONO} text-[10px] text-orange-400`}>{errored} errored</span>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EvalsPage() {
  const [datasets, setDatasets] = useState<EvalDataset[]>([]);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Dataset expand / detail
  const [expandedDs, setExpandedDs] = useState<string | null>(null);
  const [dsDetail, setDsDetail] = useState<Record<string, EvalDataset>>({});
  const [loadingDs, setLoadingDs] = useState<string | null>(null);

  // Create dataset
  const [createDsOpen, setCreateDsOpen] = useState(false);
  const [dsName, setDsName] = useState('');
  const [dsDesc, setDsDesc] = useState('');
  const [creatingDs, setCreatingDs] = useState(false);

  // Add cases
  const [addCasesDs, setAddCasesDs] = useState<EvalDataset | null>(null);
  const [casesJson, setCasesJson] = useState('');
  const [addingCases, setAddingCases] = useState(false);

  // Delete dataset
  const [deleteDsTarget, setDeleteDsTarget] = useState<EvalDataset | null>(null);
  const [deletingDs, setDeletingDs] = useState(false);

  // Runs expand
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<Record<string, EvalRun>>({});
  const [loadingRun, setLoadingRun] = useState<string | null>(null);

  // Create run
  const [createRunDs, setCreateRunDs] = useState<EvalDataset | null>(null);
  const [runName, setRunName] = useState('');
  const [runModel, setRunModel] = useState('');
  const [runScorer, setRunScorer] = useState<'llm_judge' | 'exact' | 'contains' | 'regex' | 'json_schema'>('llm_judge');
  const [runJudgeModel, setRunJudgeModel] = useState('openai/gpt-4o-mini');
  const [runJudgePrompt, setRunJudgePrompt] = useState('');
  const [runRegexPattern, setRunRegexPattern] = useState('');
  const [runJsonSchema, setRunJsonSchema] = useState('');
  const [creatingRun, setCreatingRun] = useState(false);

  // Cancel run
  const [cancelRunTarget, setCancelRunTarget] = useState<EvalRun | null>(null);
  const [cancellingRun, setCancellingRun] = useState(false);

  // Delete case
  const [deletingCaseId, setDeletingCaseId] = useState<string | null>(null);

  // ── Data loading ─────────────────────────────────────────────────────────────

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [dsRes, runsRes] = await Promise.all([
        fetch(`${BASE}/datasets`),
        fetch(`${BASE}/runs`),
      ]);
      const [dsData, runsData] = await Promise.all([dsRes.json(), runsRes.json()]);
      if (dsData.success) setDatasets(dsData.data);
      if (runsData.success) {
        setRuns(runsData.data);
        // Invalidate cached detail for any run that is still active so re-expand re-fetches
        setRunDetail((prev) => {
          const next = { ...prev };
          for (const r of (runsData.data as EvalRun[])) {
            if (r.status === 'queued' || r.status === 'running') delete next[r.id];
          }
          return next;
        });
      }
    } catch {
      toast.error('Failed to load — check your connection');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-poll while any run is queued or running
  useEffect(() => {
    const hasActive = runs.some((r) => r.status === 'queued' || r.status === 'running');
    if (!hasActive) return;
    const id = setInterval(() => load(true), 8000);
    return () => clearInterval(id);
  }, [runs, load]);

  const loadDatasetDetail = useCallback(async (ds: EvalDataset) => {
    if (dsDetail[ds.id]) return;
    setLoadingDs(ds.id);
    try {
      const res = await fetch(`${BASE}/datasets/${ds.id}`);
      const d = await res.json();
      if (d.success) setDsDetail((prev) => ({ ...prev, [ds.id]: d.data }));
      else toast.error('Failed to load dataset cases');
    } catch {
      toast.error('Failed to load dataset cases');
    } finally {
      setLoadingDs(null);
    }
  }, [dsDetail]);

  const loadRunDetail = useCallback(async (run: EvalRun) => {
    if (runDetail[run.id]) return;
    setLoadingRun(run.id);
    try {
      const res = await fetch(`${BASE}/runs/${run.id}`);
      const d = await res.json();
      if (d.success) setRunDetail((prev) => ({ ...prev, [run.id]: d.data }));
      else toast.error('Failed to load run results');
    } catch {
      toast.error('Failed to load run results');
    } finally {
      setLoadingRun(null);
    }
  }, [runDetail]);

  function toggleDs(ds: EvalDataset) {
    if (expandedDs === ds.id) {
      setExpandedDs(null);
    } else {
      setExpandedDs(ds.id);
      loadDatasetDetail(ds);
    }
  }

  function toggleRun(run: EvalRun) {
    if (expandedRun === run.id) {
      setExpandedRun(null);
    } else {
      setExpandedRun(run.id);
      loadRunDetail(run);
    }
  }

  // ── Create dataset ────────────────────────────────────────────────────────────

  async function createDataset() {
    if (!dsName.trim()) return;
    setCreatingDs(true);
    try {
      const res = await fetch(`${BASE}/datasets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: dsName.trim(), description: dsDesc.trim() || null }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? 'Failed to create dataset'); return; }
      toast.success('Dataset created');
      setCreateDsOpen(false);
      setDsName('');
      setDsDesc('');
      load(true);
    } finally {
      setCreatingDs(false);
    }
  }

  // ── Add cases ─────────────────────────────────────────────────────────────────

  async function addCases() {
    if (!addCasesDs || !casesJson.trim()) return;
    setAddingCases(true);
    try {
      let cases: unknown[];
      try {
        const parsed = JSON.parse(casesJson);
        cases = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        toast.error('Invalid JSON — paste an array of case objects');
        return;
      }
      const res = await fetch(`${BASE}/datasets/${addCasesDs.id}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cases }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? 'Failed to add cases'); return; }
      toast.success(`Added ${d.inserted ?? cases.length} case${cases.length !== 1 ? 's' : ''}`);
      setAddCasesDs(null);
      setCasesJson('');
      setDsDetail((prev) => { const next = { ...prev }; delete next[addCasesDs.id]; return next; });
      load(true);
    } finally {
      setAddingCases(false);
    }
  }

  // ── Delete dataset ────────────────────────────────────────────────────────────

  async function deleteDataset() {
    if (!deleteDsTarget) return;
    setDeletingDs(true);
    try {
      const res = await fetch(`${BASE}/datasets/${deleteDsTarget.id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? 'Failed to delete dataset'); return; }
      toast.success('Dataset deleted');
      setDeleteDsTarget(null);
      setDsDetail((prev) => { const next = { ...prev }; delete next[deleteDsTarget.id]; return next; });
      if (expandedDs === deleteDsTarget.id) setExpandedDs(null);
      load(true);
    } finally {
      setDeletingDs(false);
    }
  }

  // ── Delete case ───────────────────────────────────────────────────────────────

  async function deleteCase(ds: EvalDataset, caseId: string) {
    setDeletingCaseId(caseId);
    try {
      const res = await fetch(`${BASE}/datasets/${ds.id}/cases?caseId=${caseId}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? 'Failed to delete case'); return; }
      toast.success('Case deleted');
      setDsDetail((prev) => {
        const existing = prev[ds.id];
        if (!existing) return prev;
        return { ...prev, [ds.id]: { ...existing, cases: existing.cases?.filter((c) => c.id !== caseId) } };
      });
      load(true);
    } finally {
      setDeletingCaseId(null);
    }
  }

  // ── Create run ────────────────────────────────────────────────────────────────

  function resetRunDialog() {
    setCreateRunDs(null);
    setRunName('');
    setRunModel('');
    setRunScorer('llm_judge');
    setRunJudgeModel('openai/gpt-4o-mini');
    setRunJudgePrompt('');
    setRunRegexPattern('');
    setRunJsonSchema('');
  }

  async function createRun() {
    if (!createRunDs || !runName.trim() || !runModel.trim()) return;
    if (runScorer === 'regex' && !runRegexPattern.trim()) {
      toast.error('Enter a regex pattern for the regex scorer');
      return;
    }
    if (runScorer === 'json_schema' && !runJsonSchema.trim()) {
      toast.error('Enter a JSON schema for the json_schema scorer');
      return;
    }
    if (runScorer === 'json_schema') {
      try { JSON.parse(runJsonSchema); } catch {
        toast.error('JSON schema is not valid JSON');
        return;
      }
    }
    setCreatingRun(true);
    try {
      const scorerConfig =
        runScorer === 'llm_judge'   ? { judge_model: runJudgeModel || 'openai/gpt-4o-mini', ...(runJudgePrompt.trim() ? { judge_prompt: runJudgePrompt.trim() } : {}) } :
        runScorer === 'regex'       ? { pattern: runRegexPattern.trim() } :
        runScorer === 'json_schema' ? { schema: JSON.parse(runJsonSchema) } :
        {};
      const payload: Record<string, unknown> = {
        name: runName.trim(),
        dataset_id: createRunDs.id,
        model_id: runModel.trim(),
        scorer_type: runScorer,
        scorer_config: scorerConfig,
      };
      const res = await fetch(`${BASE}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? 'Failed to create run'); return; }
      toast.success('Eval run queued');
      resetRunDialog();
      load(true);
    } finally {
      setCreatingRun(false);
    }
  }

  // ── Cancel run ────────────────────────────────────────────────────────────────

  async function cancelRun() {
    if (!cancelRunTarget) return;
    setCancellingRun(true);
    try {
      const res = await fetch(`${BASE}/runs/${cancelRunTarget.id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? 'Failed to cancel run'); return; }
      toast.success('Run cancelled');
      const cancelledId = cancelRunTarget.id;
      setCancelRunTarget(null);
      setRunDetail((prev) => { const n = { ...prev }; delete n[cancelledId]; return n; });
      load(true);
    } finally {
      setCancellingRun(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const completedRuns = runs.filter((r) => r.status === 'completed');
  const scoredRuns = completedRuns.filter((r) => r.avg_score != null);
  const avgScore = scoredRuns.length > 0
    ? scoredRuns.reduce((acc, r) => acc + r.avg_score!, 0) / scoredRuns.length
    : null;

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: 'Inference', href: '/dashboard/services/inference' }}
        title="Evals"
        accent="testing"
        caption="Run your models against curated datasets. Score outputs with LLM judge, exact match, or regex assertions."
        size="md"
        actions={
          <>
            <GhostButton onClick={() => load(true)} disabled={refreshing}>
              <RotateCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </GhostButton>
            <PrimaryButton onClick={() => setCreateDsOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New Dataset
            </PrimaryButton>
          </>
        }
      />

      <StatsStrip>
        <StatCell label="Datasets" value={String(datasets.length)} hint="Test-case collections in this org" />
        <StatCell label="Runs" value={String(runs.length)} hint="Evaluations run so far" />
        <StatCell label="Completed" value={String(completedRuns.length)} hint="Runs with all cases scored" accent="#4ade80" />
        <StatCell
          label="Avg Score"
          value={avgScore != null ? `${(avgScore * 100).toFixed(0)}%` : '—'}
          hint="Mean score across completed runs"
          accent={avgScore != null ? (avgScore >= 0.8 ? '#4ade80' : avgScore >= 0.5 ? '#fbbf24' : '#f87171') : undefined}
        />
      </StatsStrip>

      {/* ── Datasets ─────────────────────────────────────────────────────────── */}
      <SectionHead
        eyebrow="Eval Datasets"
        title="Test"
        accent="cases"
        rightMeta={datasets.length > 0 ? `${datasets.length} dataset${datasets.length !== 1 ? 's' : ''}` : undefined}
      />

      {loading ? (
        <DataTable>
          {[1, 2, 3].map((i) => (
            <div key={i} className="grid grid-cols-[28px_minmax(0,1fr)_100px_100px_80px] gap-3 px-5 py-3 border-b border-white/[0.04] last:border-b-0 items-center">
              <div className="h-3.5 w-3.5 rounded bg-white/[0.06]" />
              <div className="h-3 w-48 rounded bg-white/[0.06] animate-pulse" />
              <div className="h-3 w-12 rounded bg-white/[0.04] animate-pulse" />
              <div className="h-3 w-16 rounded bg-white/[0.04] animate-pulse" />
              <div className="h-6 w-16 rounded bg-white/[0.04] animate-pulse" />
            </div>
          ))}
        </DataTable>
      ) : datasets.length === 0 ? (
        <EmptyState
          title="No datasets yet"
          description="Create a dataset and add test cases to start evaluating your models."
          action={
            <PrimaryButton onClick={() => setCreateDsOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New Dataset
            </PrimaryButton>
          }
        />
      ) : (
        <DataTable>
          {/* Header */}
          <div className="grid grid-cols-[28px_minmax(0,1fr)_90px_100px_80px] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
            <div />
            <ColHead>Name</ColHead>
            <ColHead>Cases</ColHead>
            <ColHead>Updated</ColHead>
            <div />
          </div>
          {datasets.map((ds) => {
            const isOpen = expandedDs === ds.id;
            const detail = dsDetail[ds.id];
            return (
              <div key={ds.id}>
                <div className="grid grid-cols-[28px_minmax(0,1fr)_90px_100px_80px] gap-3 px-5 py-3 border-b border-white/[0.04] last:border-b-0 items-center hover:bg-white/[0.02] transition-colors">
                  <button
                    onClick={() => toggleDs(ds)}
                    className="flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
                  >
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => toggleDs(ds)} className="text-left min-w-0">
                    <div className="text-sm font-medium text-white truncate">{ds.name}</div>
                    {ds.description && (
                      <div className={`${MONO} text-[10.5px] text-white/40 mt-0.5 truncate`}>{ds.description}</div>
                    )}
                  </button>
                  <div className={`${MONO} text-[11px] text-white/60 tabular-nums`}>
                    {ds.case_count} {ds.case_count === 1 ? 'case' : 'cases'}
                  </div>
                  <div className={`${MONO} text-[11px] text-white/40`}>
                    {new Date(ds.updated_at).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-1 justify-end">
                    <RowActionButton onClick={() => { setAddCasesDs(ds); setCasesJson(''); }}>
                      <Upload className="h-3.5 w-3.5" />
                    </RowActionButton>
                    {ds.case_count > 0 && (
                      <RowActionButton onClick={() => { resetRunDialog(); setCreateRunDs(ds); setRunName(`${ds.name} eval`); }}>
                        <Play className="h-3.5 w-3.5" />
                      </RowActionButton>
                    )}
                    <RowActionButton onClick={() => setDeleteDsTarget(ds)} variant="danger">
                      <Trash2 className="h-3.5 w-3.5" />
                    </RowActionButton>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-b border-white/[0.04] bg-[#0c0d10] px-8 py-4">
                    {loadingDs === ds.id ? (
                      <div className="flex items-center gap-2 text-white/40 text-sm">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading cases…
                      </div>
                    ) : detail?.cases && detail.cases.length > 0 ? (
                      <div>
                        <div className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/35 mb-3`}>
                          {detail.cases.length} test {detail.cases.length === 1 ? 'case' : 'cases'}
                        </div>
                        <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                          {detail.cases.map((c, i) => (
                            <div key={c.id} className="rounded-[4px] border border-white/[0.06] bg-[#111216] p-3">
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                  <div className={`${MONO} text-[10px] text-white/35 mb-1`}>
                                    #{i + 1} — {c.input.map((m) => m.role).join(' → ')}
                                  </div>
                                  <div className={`${MONO} text-[11px] text-white/70 truncate`}>
                                    {c.input[c.input.length - 1]?.content?.slice(0, 120) ?? ''}
                                  </div>
                                  {c.expected && (
                                    <div className={`${MONO} text-[10.5px] mt-1`}>
                                      <span className="text-white/30">expected: </span>
                                      <span className="text-white/55">{c.expected.slice(0, 80)}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                  {c.tags.length > 0 && (
                                    <div className="flex gap-1 flex-wrap justify-end">
                                      {c.tags.map((t) => (
                                        <Badge key={t} variant="outline" className="text-[10px] border-white/[0.08] text-white/40">{t}</Badge>
                                      ))}
                                    </div>
                                  )}
                                  <button
                                    onClick={() => deleteCase(ds, c.id)}
                                    disabled={deletingCaseId === c.id}
                                    className="text-white/20 hover:text-red-400 transition-colors disabled:opacity-40"
                                    title="Delete case"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-white/40 flex items-center gap-2">
                        <FlaskConical className="h-4 w-4" />
                        No cases yet — click the upload icon to add test cases.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </DataTable>
      )}

      {/* ── Runs ─────────────────────────────────────────────────────────────── */}
      <div className="mt-16">
        <SectionHead
          eyebrow="Eval Runs"
          title="Scored"
          accent="results"
          rightMeta={runs.length > 0 ? `${runs.length} run${runs.length !== 1 ? 's' : ''}` : undefined}
        />
      </div>

      {!loading && runs.length === 0 ? (
        <EmptyState
          title="No runs yet"
          description="Click the run button next to a dataset to queue an evaluation."
        />
      ) : !loading && (
        <DataTable>
          {/* Header */}
          <div className="grid grid-cols-[28px_minmax(0,1fr)_120px_120px_80px_100px_80px_80px_40px] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
            <div />
            <ColHead>Name / Dataset</ColHead>
            <ColHead>Model</ColHead>
            <ColHead>Scorer</ColHead>
            <ColHead>Progress</ColHead>
            <ColHead>Score</ColHead>
            <ColHead>Status</ColHead>
            <ColHead>Date</ColHead>
            <div />
          </div>
          {runs.map((run) => {
            const isOpen = expandedRun === run.id;
            const detail = runDetail[run.id];
            const progress = run.total_cases > 0
              ? Math.round(((run.completed_cases + run.failed_cases) / run.total_cases) * 100)
              : 0;

            return (
              <div key={run.id}>
                <div className="grid grid-cols-[28px_minmax(0,1fr)_120px_120px_80px_100px_80px_80px_40px] gap-3 px-5 py-3 border-b border-white/[0.04] last:border-b-0 items-center hover:bg-white/[0.02] transition-colors">
                  <button
                    onClick={() => toggleRun(run)}
                    className="flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
                  >
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => toggleRun(run)} className="text-left min-w-0">
                    <div className="text-sm font-medium text-white truncate">{run.name}</div>
                    {run.eval_datasets?.name && (
                      <div className={`${MONO} text-[10.5px] text-white/40 mt-0.5 truncate`}>{run.eval_datasets.name}</div>
                    )}
                  </button>
                  <div className={`${MONO} text-[11px] text-white/60 truncate`}>{run.model_id}</div>
                  <div>
                    <div className={`${MONO} text-[11px] text-white/50`}>{run.scorer_type}</div>
                    {run.scorer_type === 'llm_judge' && typeof run.scorer_config.judge_model === 'string' && (
                      <div className={`${MONO} text-[10px] text-white/30 truncate`}>{run.scorer_config.judge_model}</div>
                    )}
                    {run.scorer_type === 'regex' && typeof run.scorer_config.pattern === 'string' && (
                      <div className={`${MONO} text-[10px] text-white/30 truncate`}>/{run.scorer_config.pattern}/</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-12 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-400 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className={`${MONO} text-[10px] text-white/40 tabular-nums`}>
                      {run.completed_cases}/{run.total_cases}
                    </span>
                    {run.failed_cases > 0 && (
                      <span className={`${MONO} text-[10px] text-red-400 tabular-nums`}>{run.failed_cases}✗</span>
                    )}
                  </div>
                  <ScoreBar score={run.avg_score} />
                  {statusBadge(run.status)}
                  <div className={`${MONO} text-[11px] text-white/40`}>
                    {new Date(run.created_at).toLocaleDateString()}
                  </div>
                  <div>
                    {(run.status === 'queued' || run.status === 'running') && (
                      <RowActionButton onClick={() => setCancelRunTarget(run)} variant="danger">
                        <XCircle className="h-3.5 w-3.5" />
                      </RowActionButton>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="border-b border-white/[0.04] bg-[#0c0d10] px-8 py-4">
                    {loadingRun === run.id ? (
                      <div className="flex items-center gap-2 text-white/40 text-sm">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading results…
                      </div>
                    ) : detail?.results && detail.results.length > 0 ? (
                      <div>
                        <ResultSummary results={detail.results} />
                        <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                          {detail.results.map((r) => (
                            <div key={r.id} className="rounded-[4px] border border-white/[0.06] bg-[#111216] p-3">
                              <div className="flex items-start justify-between gap-4 mb-1">
                                <div className="flex items-center gap-2">
                                  {r.status === 'completed' && r.score != null
                                    ? r.score >= 0.5
                                      ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
                                      : <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                                    : r.status === 'failed'
                                      ? <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                                      : <Clock className="h-3.5 w-3.5 text-white/30 flex-shrink-0" />
                                  }
                                  <ScoreBar score={r.score} />
                                </div>
                                {r.latency_ms != null && (
                                  <span className={`${MONO} text-[10px] text-white/30 tabular-nums`}>{r.latency_ms}ms</span>
                                )}
                              </div>
                              {r.eval_cases?.input && (
                                <div className={`${MONO} text-[10.5px] mb-1 truncate`}>
                                  <span className="text-white/30">input: </span>
                                  <span className="text-white/55">{r.eval_cases.input[r.eval_cases.input.length - 1]?.content?.slice(0, 100)}</span>
                                </div>
                              )}
                              {r.eval_cases?.expected && (
                                <div className={`${MONO} text-[10.5px] mb-1 truncate`}>
                                  <span className="text-white/30">expected: </span>
                                  <span className="text-white/55">{r.eval_cases.expected.slice(0, 100)}</span>
                                </div>
                              )}
                              {r.output && (
                                <div className={`${MONO} text-[10.5px] mb-1 truncate`}>
                                  <span className="text-white/30">output: </span>
                                  <span className="text-white/55">{r.output.slice(0, 120)}</span>
                                </div>
                              )}
                              {r.scorer_reasoning && (
                                <div className={`${MONO} text-[10px] text-white/40 mt-1 border-t border-white/[0.04] pt-1`}>
                                  <span className="text-white/25">reason: </span>{r.scorer_reasoning}
                                </div>
                              )}
                              {r.error && (
                                <div className={`${MONO} text-[10.5px] text-red-400 mt-1`}>{r.error}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : run.status === 'queued' || run.status === 'running' ? (
                      <div className="flex items-center gap-2 text-white/40 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Run is {run.status} — results appear here as cases complete.
                      </div>
                    ) : (
                      <div className="text-sm text-white/40">No results yet.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </DataTable>
      )}

      {/* ── Dialogs ───────────────────────────────────────────────────────────── */}

      {/* Create Dataset */}
      <Dialog open={createDsOpen} onOpenChange={setCreateDsOpen}>
        <DialogContent className="sm:max-w-md bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle>New Eval Dataset</DialogTitle>
            <DialogDescription>Name the dataset — add test cases after creation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ds-name">Name</Label>
              <Input
                id="ds-name"
                placeholder="e.g. customer-support-v1"
                value={dsName}
                onChange={(e) => setDsName(e.target.value)}
                className="bg-zinc-800 border-zinc-700"
                onKeyDown={(e) => { if (e.key === 'Enter') createDataset(); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ds-desc">Description (optional)</Label>
              <Input
                id="ds-desc"
                placeholder="What is this dataset testing?"
                value={dsDesc}
                onChange={(e) => setDsDesc(e.target.value)}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
          </div>
          <DialogFooter>
            <GhostButton onClick={() => setCreateDsOpen(false)}>Cancel</GhostButton>
            <PrimaryButton onClick={createDataset} disabled={!dsName.trim() || creatingDs}>
              {creatingDs ? 'Creating…' : 'Create Dataset'}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Cases */}
      <Dialog open={!!addCasesDs} onOpenChange={(o) => !o && setAddCasesDs(null)}>
        <DialogContent className="sm:max-w-2xl bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle>Add Test Cases — {addCasesDs?.name}</DialogTitle>
            <DialogDescription>
              Paste a JSON array of case objects. Each case needs an{' '}
              <code className={`${MONO} text-xs bg-zinc-800 px-1 rounded`}>input</code>{' '}
              messages array and an optional{' '}
              <code className={`${MONO} text-xs bg-zinc-800 px-1 rounded`}>expected</code> string.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-[4px] border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400">
              <pre className={MONO}>{`[
  {
    "input": [{"role": "user", "content": "What is 2+2?"}],
    "expected": "4",
    "tags": ["math"]
  }
]`}</pre>
            </div>
            <Textarea
              placeholder="Paste JSON array here…"
              value={casesJson}
              onChange={(e) => setCasesJson(e.target.value)}
              rows={8}
              className={`${MONO} bg-zinc-800 border-zinc-700 text-sm`}
            />
            {casesJson.trim() && (() => {
              try {
                const parsed = JSON.parse(casesJson);
                const count = Array.isArray(parsed) ? parsed.length : 1;
                return <p className={`${MONO} text-[11px] text-green-400`}>{count} case{count !== 1 ? 's' : ''} detected</p>;
              } catch {
                return <p className={`${MONO} text-[11px] text-red-400`}>Invalid JSON</p>;
              }
            })()}
          </div>
          <DialogFooter>
            <GhostButton onClick={() => setAddCasesDs(null)}>Cancel</GhostButton>
            <PrimaryButton onClick={addCases} disabled={!casesJson.trim() || addingCases}>
              {addingCases ? 'Adding…' : 'Add Cases'}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Run */}
      <Dialog open={!!createRunDs} onOpenChange={(o) => !o && setCreateRunDs(null)}>
        <DialogContent className="sm:max-w-2xl bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle>New Eval Run — {createRunDs?.name}</DialogTitle>
            <DialogDescription>
              Configure a target model and scorer. The eval-runner processes all{' '}
              {createRunDs?.case_count ?? 0} cases asynchronously.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[65vh] overflow-y-auto pr-1 space-y-5 py-1">
            {/* Run name */}
            <div className="space-y-1.5">
              <Label>Run Name</Label>
              <Input
                placeholder="e.g. gpt-4o baseline"
                value={runName}
                onChange={(e) => setRunName(e.target.value)}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>

            {/* Target model picker */}
            <div className="space-y-1.5">
              <Label>Target Model</Label>
              <div className="rounded-md border border-zinc-700 bg-zinc-800/40 p-3 space-y-3">
                {MODEL_OPTIONS.map((group) => (
                  <div key={group.provider}>
                    <p className={`${MONO} text-[10px] uppercase tracking-widest mb-2 ${group.color}`}>
                      {group.provider}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.models.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setRunModel(m.id)}
                          className={`px-2.5 py-1 rounded-[4px] border text-xs transition-colors ${MONO} ${
                            runModel === m.id
                              ? 'border-[#0095FF] bg-[#0095FF]/15 text-[#0095FF]'
                              : 'border-zinc-600 bg-zinc-800 text-zinc-300 hover:border-zinc-500 hover:text-white'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <Input
                placeholder="or type any model ID…  e.g. openai/o4-mini"
                value={runModel}
                onChange={(e) => setRunModel(e.target.value)}
                className={`bg-zinc-800 border-zinc-700 ${MONO} text-sm`}
              />
            </div>

            {/* Scorer */}
            <div className="space-y-1.5">
              <Label>Scorer</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['llm_judge', 'exact', 'contains', 'regex', 'json_schema'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setRunScorer(s)}
                    className={`px-3 py-2 rounded-[4px] border text-left transition-colors ${
                      runScorer === s
                        ? 'border-[#0095FF] bg-[#0095FF]/10 text-[#0095FF]'
                        : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    <div className={`font-medium ${MONO} text-xs uppercase tracking-wide`}>{s}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      {s === 'llm_judge'   ? 'LLM scores 0–1' :
                       s === 'exact'       ? 'Exact string match' :
                       s === 'contains'    ? 'Substring match' :
                       s === 'json_schema' ? 'Schema validation' :
                       'Regex pattern'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* LLM judge config */}
            {runScorer === 'llm_judge' && (
              <div className="space-y-3 rounded-md border border-zinc-700/60 bg-zinc-800/30 p-3">
                <div className="space-y-1.5">
                  <Label className="text-zinc-300">Judge Model</Label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(['openai/gpt-4o-mini', 'openai/gpt-4o', 'anthropic/claude-haiku-4-5', 'anthropic/claude-sonnet-4-6'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setRunJudgeModel(m)}
                        className={`px-2.5 py-1 rounded-[4px] border text-xs transition-colors ${MONO} ${
                          (runJudgeModel || 'openai/gpt-4o-mini') === m
                            ? 'border-[#0095FF] bg-[#0095FF]/15 text-[#0095FF]'
                            : 'border-zinc-600 bg-zinc-800 text-zinc-300 hover:border-zinc-500 hover:text-white'
                        }`}
                      >
                        {m.split('/')[1]}
                      </button>
                    ))}
                  </div>
                  <Input
                    placeholder="or custom judge model ID"
                    value={runJudgeModel}
                    onChange={(e) => setRunJudgeModel(e.target.value)}
                    className={`bg-zinc-800 border-zinc-700 ${MONO} text-sm`}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-300">
                    Judge Prompt{' '}
                    <span className="text-zinc-500 font-normal text-xs">(optional — overrides default rubric)</span>
                  </Label>
                  <Textarea
                    placeholder={'Score the response 0–1 based on accuracy and completeness.\nRespond with JSON: {"score": <0-1>, "reasoning": "<one sentence>"}'}
                    value={runJudgePrompt}
                    onChange={(e) => setRunJudgePrompt(e.target.value)}
                    className={`bg-zinc-800 border-zinc-700 ${MONO} text-xs min-h-[80px]`}
                  />
                </div>
              </div>
            )}

            {/* Regex config */}
            {runScorer === 'regex' && (
              <div className="space-y-1.5">
                <Label>Regex Pattern</Label>
                <Input
                  placeholder="e.g. ^\d{4}$"
                  value={runRegexPattern}
                  onChange={(e) => setRunRegexPattern(e.target.value)}
                  className={`bg-zinc-800 border-zinc-700 ${MONO} text-sm`}
                />
              </div>
            )}

            {/* JSON schema config */}
            {runScorer === 'json_schema' && (
              <div className="space-y-1.5">
                <Label>JSON Schema</Label>
                <Textarea
                  placeholder={'{\n  "required": ["name", "score"],\n  "properties": {\n    "score": { "type": "number" }\n  }\n}'}
                  value={runJsonSchema}
                  onChange={(e) => setRunJsonSchema(e.target.value)}
                  className={`bg-zinc-800 border-zinc-700 ${MONO} text-xs min-h-[120px]`}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <GhostButton onClick={resetRunDialog}>Cancel</GhostButton>
            <PrimaryButton
              onClick={createRun}
              disabled={
                !runName.trim() || !runModel.trim() || creatingRun ||
                (runScorer === 'regex' && !runRegexPattern.trim()) ||
                (runScorer === 'json_schema' && !runJsonSchema.trim())
              }
            >
              {creatingRun ? 'Queueing…' : 'Start Run'}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dataset */}
      <AlertDialog open={!!deleteDsTarget} onOpenChange={(o) => !o && setDeleteDsTarget(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete dataset &ldquo;{deleteDsTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently deletes all {deleteDsTarget?.case_count ?? 0} test cases and all eval runs for this dataset.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteDataset} disabled={deletingDs} className="bg-red-600 hover:bg-red-700">
              {deletingDs ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Run */}
      <AlertDialog open={!!cancelRunTarget} onOpenChange={(o) => !o && setCancelRunTarget(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel run &ldquo;{cancelRunTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              The runner will stop processing remaining cases. Completed results are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700">Keep Running</AlertDialogCancel>
            <AlertDialogAction onClick={cancelRun} disabled={cancellingRun} className="bg-red-600 hover:bg-red-700">
              {cancellingRun ? 'Cancelling…' : 'Cancel Run'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageCanvas>
  );
}
