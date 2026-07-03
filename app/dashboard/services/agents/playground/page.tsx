'use client';

/**
 * Agents v2 playground + trace viewer (S1.5 d/e).
 *
 * Pick an agent, send input, and watch the durable run execute: the page enqueues
 * via POST /api/agents/runs (session-authed), then polls GET /api/agents/runs/:id/trace
 * until terminal, rendering the step waterfall + final output. Also lists recent runs.
 */
import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Play, Loader2, RotateCw, CheckCircle2, XCircle, Clock, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  PageCanvas, Hero, PrimaryButton, MONO, StatusLabel,
} from '@/components/dashboard/inference/chrome';
import { formatCost } from '../_constants';

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'expired']);

interface Agent { id: string; name: string; model: string }
interface Step {
  step_index: number; step_type: string; tool_name: string | null;
  input_tokens: number | null; output_tokens: number | null;
  cost_cents: number; latency_ms: number | null; status: string;
}
interface RunDetail {
  id: string; status: string; cost_cents: number; step_count: number;
  error: string | null; output: { output?: { content?: { text?: string }[] }[] } | null;
  steps: Step[];
}
interface RunListItem { id: string; agent_id: string | null; status: string; cost_cents: number; created_at: string }

function statusIcon(status: string) {
  switch (status) {
    case 'completed': return <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />;
    case 'failed': case 'expired': return <XCircle className="h-3.5 w-3.5 text-red-400" />;
    case 'cancelled': return <Ban className="h-3.5 w-3.5 text-white/40" />;
    default: return <Clock className="h-3.5 w-3.5 text-yellow-400" />;
  }
}
function statusKind(status: string): 'ok' | 'warn' | 'error' | 'neutral' | 'info' {
  if (status === 'completed') return 'ok';
  if (status === 'failed' || status === 'expired') return 'error';
  if (status === 'cancelled') return 'neutral';
  if (status === 'running') return 'info';
  return 'warn';
}
function finalText(run: RunDetail | null): string | null {
  return run?.output?.output?.[0]?.content?.[0]?.text ?? null;
}

function PlaygroundInner() {
  const searchParams = useSearchParams();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState('');
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [recent, setRecent] = useState<RunListItem[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load agents (for the picker) + recent runs.
  useEffect(() => {
    void (async () => {
      try {
        const [a, r] = await Promise.all([fetch('/api/agents'), fetch('/api/agents/runs')]);
        const aj = await a.json(); const rj = await r.json();
        if (a.ok) {
          setAgents(aj.data ?? []);
          const pre = searchParams.get('agent');
          setAgentId(pre && (aj.data ?? []).some((x: Agent) => x.id === pre) ? pre : (aj.data?.[0]?.id ?? ''));
        }
        if (r.ok) setRecent(rj.data ?? []);
      } catch { /* toast on action instead */ }
    })();
  }, [searchParams]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const loadTrace = useCallback(async (id: string) => {
    const res = await fetch(`/api/agents/runs/${id}/trace`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load run');
    setDetail(json.data as RunDetail);
    return json.data as RunDetail;
  }, []);

  // Poll the active run until terminal.
  useEffect(() => {
    if (!runId) return;
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const d = await loadTrace(runId);
        if (TERMINAL.has(d.status)) {
          stopPolling();
          setRunning(false);
          void fetch('/api/agents/runs').then((r) => r.json()).then((j) => setRecent(j.data ?? []));
        }
      } catch { stopPolling(); setRunning(false); }
    }, 1500);
    return stopPolling;
  }, [runId, loadTrace, stopPolling]);

  async function run() {
    if (!agentId) { toast.error('Create and select an agent first'); return; }
    if (!input.trim()) { toast.error('Enter some input'); return; }
    setRunning(true);
    setDetail(null);
    setRunId(null);
    try {
      const res = await fetch('/api/agents/runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, input: input.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to start run');
      setRunId(json.id);
      void loadTrace(json.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start run');
      setRunning(false);
    }
  }

  const output = finalText(detail);

  return (
    <PageCanvas>
      <div className="mx-auto w-full max-w-5xl space-y-5">
      <Hero
        breadcrumb={{ label: 'Agents', href: '/dashboard/services/agents' }}
        title="Playground"
        size="md"
        caption="Run an agent and watch the durable execution — step trace, tokens, cost."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Left: run + result */}
        <div className="space-y-4">
          <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-4 space-y-3">
            <div className="space-y-1.5">
              <Label>Agent</Label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className={`w-full h-9 rounded-[6px] bg-[#0c0d10] border border-white/[0.1] px-3 text-sm text-white/90 ${MONO}`}
              >
                {agents.length === 0 && <option value="">No agents — create one first</option>}
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.model}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pg-input">Input</Label>
              <Textarea id="pg-input" rows={4} value={input}
                placeholder="Ask the agent to do something…"
                onChange={(e) => setInput(e.target.value)} />
            </div>
            <div className="flex justify-end">
              <PrimaryButton onClick={run} disabled={running || !agentId}>
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {running ? 'Running…' : 'Run'}
              </PrimaryButton>
            </div>
          </div>

          {detail && (
            <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  {statusIcon(detail.status)}
                  <StatusLabel status={statusKind(detail.status)}>{detail.status}</StatusLabel>
                </div>
                <span className={`${MONO} text-[10.5px] text-white/45`}>
                  {detail.step_count} steps · {formatCost(detail.cost_cents)}
                </span>
              </div>

              {/* Step waterfall */}
              <div className="divide-y divide-white/[0.04]">
                {detail.steps.map((s) => (
                  <div key={s.step_index} className="grid grid-cols-[auto_1fr_auto] gap-3 px-4 py-2 items-center">
                    <span className={`${MONO} text-[10px] text-white/30 tabular-nums w-6`}>{s.step_index}</span>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`${MONO} text-[10px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-white/[0.05] text-white/60`}>
                        {s.step_type}{s.tool_name ? `·${s.tool_name}` : ''}
                      </span>
                      {s.status !== 'success' && <span className="text-[10px] text-red-400">error</span>}
                    </div>
                    <span className={`${MONO} text-[10px] text-white/40 tabular-nums`}>
                      {s.input_tokens != null ? `${s.input_tokens}→${s.output_tokens ?? 0} tok` : ''}
                      {s.latency_ms != null ? ` · ${s.latency_ms}ms` : ''}
                    </span>
                  </div>
                ))}
                {detail.steps.length === 0 && (
                  <div className="px-4 py-6 text-center text-white/30 text-xs">Waiting for the runner to pick up this run…</div>
                )}
              </div>

              {/* Final output / error */}
              {output && (
                <div className="border-t border-white/[0.06] p-4">
                  <div className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/35 mb-2`}>Output</div>
                  <div className="text-sm text-white/85 whitespace-pre-wrap">{output}</div>
                </div>
              )}
              {detail.error && (
                <div className="border-t border-white/[0.06] p-4">
                  <div className="text-sm text-red-400 whitespace-pre-wrap">{detail.error}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: recent runs */}
        <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] overflow-hidden h-fit">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
            <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40`}>Recent runs</span>
            <RotateCw className="h-3 w-3 text-white/30 cursor-pointer"
              onClick={() => fetch('/api/agents/runs').then((r) => r.json()).then((j) => setRecent(j.data ?? []))} />
          </div>
          {recent.length === 0 ? (
            <div className="px-3 py-6 text-center text-white/30 text-xs">No runs yet</div>
          ) : (
            <div className="divide-y divide-white/[0.04] max-h-[420px] overflow-auto">
              {recent.map((r) => (
                <button key={r.id} onClick={() => { setRunId(null); void loadTrace(r.id); }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] text-left">
                  {statusIcon(r.status)}
                  <span className={`${MONO} text-[10px] text-white/55 truncate flex-1`}>{r.id.slice(0, 8)}</span>
                  <span className={`${MONO} text-[10px] text-white/30`}>
                    {formatCost(r.cost_cents)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </PageCanvas>
  );
}

export default function PlaygroundPage() {
  return (
    <Suspense fallback={<PageCanvas><div className="py-24 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div></PageCanvas>}>
      <PlaygroundInner />
    </Suspense>
  );
}
