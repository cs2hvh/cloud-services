'use client';

/**
 * New agent — a proper builder page: grouped sections on the left, a live
 * summary + primary actions on a sticky panel on the right.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Plus, Bot, Cpu, Layers, DollarSign, Shield, Wrench, Sparkles, Webhook, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PageCanvas, Hero, PrimaryButton, MONO } from '@/components/dashboard/inference/chrome';
import {
  MODEL_OPTIONS, DEFAULT_MODEL, HOSTED_TOOLS, formatCost,
  buildToolsPayload, buildFunctionTools, emptyFn, type FnDef,
} from '../_constants';
import { KnowledgeBasePicker } from '../_kb-picker';

const LABEL = `${MONO} text-[10px] uppercase tracking-[0.14em] text-white/40`;
const SEL = `w-full h-9 rounded-xl bg-[#0c0d10] border border-white/[0.1] px-3 text-sm text-white/90 ${MONO}`;

function Section({ icon: Icon, title, desc, children }: {
  icon: React.ComponentType<{ className?: string }>; title: string; desc: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#111216] overflow-hidden">
      <div className="flex items-start gap-3 px-5 py-4 border-b border-white/[0.06]">
        <div className="mt-0.5 grid place-items-center h-7 w-7 rounded-lg bg-[#0095FF]/10 shrink-0">
          <Icon className="h-3.5 w-3.5 text-[#33adff]" />
        </div>
        <div>
          <div className="text-sm font-medium text-white/90">{title}</div>
          <div className="text-[11px] text-white/40 mt-0.5">{desc}</div>
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function modelLabel(id: string): string {
  for (const g of MODEL_OPTIONS) for (const m of g.models) if (m.id === id) return m.label;
  return id;
}

export default function NewAgentPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [prompt, setPrompt] = useState('');
  const [guardrail, setGuardrail] = useState('warn');
  const [maxSteps, setMaxSteps] = useState(12);
  const [maxCost, setMaxCost] = useState(100);
  const [tools, setTools] = useState<string[]>([]);
  const [fileSearchCollectionId, setFileSearchCollectionId] = useState('');
  const [functions, setFunctions] = useState<FnDef[]>([]);
  const [saving, setSaving] = useState(false);

  const toggle = (t: string) => setTools((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));
  const addFn = () => setFunctions((f) => [...f, emptyFn()]);
  const updateFn = (i: number, k: keyof FnDef, v: string) => setFunctions((f) => f.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const removeFn = (i: number) => setFunctions((f) => f.filter((_, j) => j !== i));

  async function create() {
    if (!name.trim()) { toast.error('Give your agent a name'); return; }
    if (tools.includes('file_search') && !fileSearchCollectionId) {
      toast.error('Pick a knowledge base for File search');
      return;
    }
    const fn = buildFunctionTools(functions);
    if (fn.error) { toast.error(fn.error); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/agents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), model, system_prompt: prompt.trim() || null,
          guardrail, max_steps: maxSteps, max_cost_cents: maxCost,
          tools: [...buildToolsPayload(tools, fileSearchCollectionId), ...(fn.tools ?? [])],
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Create failed');
      toast.success('Agent created');
      router.push(`/dashboard/services/agents/${j.data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
      setSaving(false);
    }
  }

  function SummaryRow({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
    return (
      <div className="flex items-center justify-between gap-3 py-2.5 border-b border-white/[0.04] last:border-0">
        <span className="inline-flex items-center gap-2 text-[11px] text-white/45"><Icon className="h-3.5 w-3.5 text-white/30" />{label}</span>
        <span className="text-[12px] text-white/85 text-right truncate max-w-[170px]">{children}</span>
      </div>
    );
  }

  return (
    <PageCanvas>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <Hero
          breadcrumb={{ label: 'Agents', href: '/dashboard/services/agents' }}
          title="New agent"
          size="md"
          caption="Configure a reusable agent. It runs durably on the model you pick, bounded by your budgets."
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
          {/* ── Left: grouped sections ─────────────────────────────── */}
          <div className="space-y-4">
            <Section icon={Bot} title="Basics" desc="A name for you, and the model every step runs on.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5"><span className={LABEL}>Name</span>
                  <Input value={name} placeholder="Research assistant" onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5"><span className={LABEL}>Model</span>
                  <select value={model} onChange={(e) => setModel(e.target.value)} className={SEL}>
                    {MODEL_OPTIONS.map((g) => <optgroup key={g.provider} label={g.provider}>{g.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>)}
                  </select>
                </div>
              </div>
            </Section>

            <Section icon={Sparkles} title="Instructions" desc="The system prompt that shapes how the agent behaves.">
              <Textarea rows={6} value={prompt} placeholder="You are a helpful research assistant. Be concise and cite sources." onChange={(e) => setPrompt(e.target.value)} />
            </Section>

            <Section icon={Shield} title="Limits & safety" desc="Hard ceilings that keep every run bounded — the agent stops when it hits them.">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5"><span className={LABEL}>Max steps</span>
                  <Input type="number" min={1} max={100} value={maxSteps} onChange={(e) => setMaxSteps(Number(e.target.value))} />
                </div>
                <div className="space-y-1.5"><span className={LABEL}>Max cost (cents)</span>
                  <Input type="number" min={1} value={maxCost} onChange={(e) => setMaxCost(Number(e.target.value))} />
                </div>
                <div className="space-y-1.5"><span className={LABEL}>Guardrail</span>
                  <select value={guardrail} onChange={(e) => setGuardrail(e.target.value)} className={SEL}>
                    <option value="off">Off</option><option value="warn">Warn</option><option value="block">Block</option>
                  </select>
                </div>
              </div>
            </Section>

            <Section icon={Wrench} title="Tools" desc="Hosted capabilities the agent can call during a run.">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {HOSTED_TOOLS.map((t) => {
                  const on = tools.includes(t.type);
                  return (
                    <button
                      key={t.type} type="button" disabled={!t.enabled}
                      onClick={() => t.enabled && toggle(t.type)}
                      className={`text-left rounded-xl border px-3.5 py-3 transition-colors ${
                        !t.enabled ? 'border-white/[0.05] cursor-not-allowed opacity-50'
                          : on ? 'border-[#0095FF]/50 bg-[#0095FF]/10 cursor-pointer'
                          : 'border-white/[0.08] hover:border-white/[0.18] cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`grid place-items-center h-4 w-4 rounded border ${on ? 'bg-[#0095FF] border-[#0095FF]' : 'border-white/25'}`}>
                          {on && <span className="text-[9px] text-white leading-none">✓</span>}
                        </span>
                        <span className="text-[12.5px] text-white/85">{t.label}</span>
                      </div>
                      {t.note && <div className="text-[10px] text-white/35 mt-1 pl-6">{t.note}</div>}
                    </button>
                  );
                })}
              </div>
              {tools.includes('file_search') && (
                <div className="pt-1">
                  <KnowledgeBasePicker value={fileSearchCollectionId} onChange={setFileSearchCollectionId} />
                </div>
              )}
            </Section>

            <Section icon={Webhook} title="Custom functions" desc="Call your own APIs. When the agent invokes one, we POST the args to your webhook (SSRF-guarded, HMAC-signed if you set a secret) and feed the response back.">
              {functions.length === 0 && (
                <div className="text-[11px] text-white/35">None yet. Add a function to let the agent call your own API endpoint.</div>
              )}
              {functions.map((f, i) => (
                <div key={i} className="rounded-xl border border-white/[0.08] bg-[#0c0d10] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className={LABEL}>Function {i + 1}</span>
                    <button type="button" onClick={() => removeFn(i)} className="text-white/30 hover:text-red-400" aria-label="Remove function">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input value={f.name} placeholder="get_weather" onChange={(e) => updateFn(i, 'name', e.target.value)} />
                    <Input value={f.webhook_url} placeholder="https://api.yoursite.com/hook" onChange={(e) => updateFn(i, 'webhook_url', e.target.value)} />
                  </div>
                  <Input value={f.description} placeholder="What this function does (shown to the model)" onChange={(e) => updateFn(i, 'description', e.target.value)} />
                  <Input value={f.secret} placeholder="Signing secret (optional — HMAC-signs each call)" onChange={(e) => updateFn(i, 'secret', e.target.value)} />
                  <Textarea rows={2} value={f.parameters} placeholder={'Parameters JSON Schema (optional), e.g. {"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}'} onChange={(e) => updateFn(i, 'parameters', e.target.value)} />
                </div>
              ))}
              <button type="button" onClick={addFn} className="inline-flex items-center gap-1.5 text-[12px] text-[#33adff] hover:text-[#5cb8ff]">
                <Plus className="h-3.5 w-3.5" /> Add function
              </button>
            </Section>
          </div>

          {/* ── Right: live summary + actions (sticky) ─────────────── */}
          <aside className="lg:sticky lg:top-6 space-y-3">
            <div className="rounded-xl border border-white/[0.07] bg-[#111216] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06] text-[10px] uppercase tracking-[0.14em] text-white/40" style={{ fontFamily: 'var(--font-geist-mono),monospace' }}>Summary</div>
              <div className="px-4 py-1">
                <SummaryRow icon={Bot} label="Name">{name.trim() || <span className="text-white/30">Untitled</span>}</SummaryRow>
                <SummaryRow icon={Cpu} label="Model">{modelLabel(model)}</SummaryRow>
                <SummaryRow icon={Layers} label="Max steps">{maxSteps}</SummaryRow>
                <SummaryRow icon={DollarSign} label="Cost cap">{formatCost(maxCost)}</SummaryRow>
                <SummaryRow icon={Shield} label="Guardrail">{guardrail}</SummaryRow>
                <SummaryRow icon={Wrench} label="Tools">{tools.length ? tools.join(', ') : <span className="text-white/30">None</span>}</SummaryRow>
                <SummaryRow icon={Webhook} label="Functions">{functions.length ? String(functions.length) : <span className="text-white/30">None</span>}</SummaryRow>
              </div>
            </div>
            <PrimaryButton onClick={create} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create agent
            </PrimaryButton>
            <Link href="/dashboard/services/agents" className={`block text-center ${MONO} text-[11px] uppercase tracking-[0.12em] text-white/45 hover:text-white/70 py-2`}>Cancel</Link>
          </aside>
        </div>
      </div>
    </PageCanvas>
  );
}
