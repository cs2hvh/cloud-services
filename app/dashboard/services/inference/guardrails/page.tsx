'use client';

import { useEffect, useState } from 'react';
import { Plus, RotateCw, Trash2, Pencil, Shield, Play } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
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
import { PII_CATEGORY_LIST, type PiiCategory } from '@/lib/guardrail-eval';
import { type PolicyMode } from '@/lib/inference/guardrail-rules';

interface PolicyRule {
  type: 'jailbreak' | 'pii' | 'regex';
  categories?: PiiCategory[];
  pattern?: string;
  flags?: string;
  severity?: 'critical' | 'soft';
  id?: string;
}

interface Policy {
  id: string;
  name: string;
  mode: PolicyMode;
  rules: PolicyRule[];
  created_at: string;
  updated_at: string;
}

const MODE_COLORS: Record<PolicyMode, string> = {
  off: 'text-white/35',
  warn: 'text-amber-300/80',
  block: 'text-red-400/90',
  redact: '#0095FF',
};

const MODE_LABEL: Record<PolicyMode, string> = {
  off: 'Off',
  warn: 'Warn',
  block: 'Block',
  redact: 'Redact',
};

const PII_CATEGORIES = PII_CATEGORY_LIST;

interface FormState {
  id: string | null;
  name: string;
  mode: PolicyMode;
  hasJailbreak: boolean;
  hasPii: boolean;
  piiCategories: PiiCategory[];
  hasRegex: boolean;
  regexPattern: string;
  regexFlags: string;
  regexSeverity: 'critical' | 'soft';
  regexId: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  mode: 'warn',
  hasJailbreak: true,
  hasPii: false,
  piiCategories: ['email', 'phone', 'api_key'],
  hasRegex: false,
  regexPattern: '',
  regexFlags: 'gi',
  regexSeverity: 'critical',
  regexId: '',
};

function formToRules(f: FormState): PolicyRule[] {
  const rules: PolicyRule[] = [];
  if (f.hasJailbreak) rules.push({ type: 'jailbreak' });
  if (f.hasPii) rules.push({ type: 'pii', categories: f.piiCategories });
  if (f.hasRegex && f.regexPattern) {
    rules.push({
      type: 'regex',
      pattern: f.regexPattern,
      flags: f.regexFlags || undefined,
      severity: f.regexSeverity,
      id: f.regexId || undefined,
    });
  }
  return rules;
}

function policyToForm(p: Policy): FormState {
  const jailbreak = p.rules.find((r) => r.type === 'jailbreak');
  const pii = p.rules.find((r) => r.type === 'pii');
  const regex = p.rules.find((r) => r.type === 'regex');
  return {
    id: p.id,
    name: p.name,
    mode: p.mode,
    hasJailbreak: !!jailbreak,
    hasPii: !!pii,
    piiCategories: pii?.categories ?? ['email', 'phone', 'api_key'],
    hasRegex: !!regex,
    regexPattern: regex?.pattern ?? '',
    regexFlags: regex?.flags ?? 'gi',
    regexSeverity: regex?.severity ?? 'critical',
    regexId: regex?.id ?? '',
  };
}

interface TestResult {
  action: string;
  hits: Array<{ pattern_id: string; severity: string; excerpt: string }>;
  redacted_text?: string;
}

export default function GuardrailsPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Policy | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Test panel
  const [testText, setTestText] = useState('');
  const [testPolicyId, setTestPolicyId] = useState<string>('__default__');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/inference/guardrails/policies', { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to load policies');
      const data = await r.json();
      setPolicies(data.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load policies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(EMPTY_FORM); setEditOpen(true); };
  const openEdit = (p: Policy) => { setForm(policyToForm(p)); setEditOpen(true); };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    const rules = formToRules(form);
    if (rules.length === 0) { toast.error('Add at least one rule'); return; }

    setSaving(true);
    try {
      const isEdit = !!form.id;
      const url = isEdit ? `/api/inference/guardrails/policies/${form.id}` : '/api/inference/guardrails/policies';
      const method = isEdit ? 'PATCH' : 'POST';
      const body = isEdit
        ? { mode: form.mode, rules }
        : { name: form.name.trim(), mode: form.mode, rules };

      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Failed to save');
      toast.success(isEdit ? `Updated "${form.name}"` : `Created "${form.name}"`);
      setEditOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/inference/guardrails/policies/${deleteTarget.id}`, {
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

  const runTest = async () => {
    if (!testText.trim()) { toast.error('Enter some text to test'); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const body: Record<string, unknown> = { text: testText };
      if (testPolicyId && testPolicyId !== '__default__') body.policy_id = testPolicyId;
      const r = await fetch('/api/inference/guardrails/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Test failed');
      setTestResult(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const modeCount = policies.reduce<Record<string, number>>((acc, p) => {
    acc[p.mode] = (acc[p.mode] ?? 0) + 1;
    return acc;
  }, {});

  const ACTION_COLOR: Record<string, string> = {
    clean: 'text-emerald-400',
    flagged: 'text-amber-300',
    blocked: 'text-red-400',
    redacted: 'text-[#0095FF]',
  };

  return (
    <PageCanvas>
      <Hero
        breadcrumb={{ label: 'Inference', href: '/dashboard/services/inference' }}
        title="Guardrails"
        accent="policies"
        caption="Per-org input/output safety policies. Pass X-Ahura-Guardrail: <policy-name> or a keyword (warn / block / redact) — the gateway evaluates and blocks, warns, or redacts before forwarding."
        size="md"
        actions={
          <>
            <GhostButton onClick={load} disabled={loading}>
              <RotateCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </GhostButton>
            <PrimaryButton onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" />
              New policy
            </PrimaryButton>
          </>
        }
      />

      <StatsStrip>
        <StatCell label="Policies" value={String(policies.length)} hint="Defined in this org" />
        <StatCell label="Block" value={String(modeCount.block ?? 0)} hint="Hard stop on violation" accent="#f87171" />
        <StatCell label="Redact" value={String(modeCount.redact ?? 0)} hint="PII scrubbed before forward" accent={ACCENT} />
        <StatCell label="Warn" value={String(modeCount.warn ?? 0)} hint="Logged, not blocked" accent="#fbbf24" />
      </StatsStrip>

      <Tabs defaultValue="policies" className="mt-8">
        <TabsList className="bg-white/[0.03] border border-white/[0.07]">
          <TabsTrigger value="policies" className={`${MONO} text-[10.5px] uppercase tracking-[0.12em]`}>
            Policies
          </TabsTrigger>
          <TabsTrigger value="test" className={`${MONO} text-[10.5px] uppercase tracking-[0.12em]`}>
            Test
          </TabsTrigger>
          <TabsTrigger value="usage" className={`${MONO} text-[10.5px] uppercase tracking-[0.12em]`}>
            How to use
          </TabsTrigger>
        </TabsList>

        {/* ── Policies tab ─────────────────────────────────── */}
        <TabsContent value="policies" className="mt-6">
          <SectionHead
            eyebrow="Inventory"
            title="Named"
            accent="policies"
            rightMeta={policies.length > 0 ? `${policies.length} configured` : undefined}
          />

          {loading ? (
            <DataTable>
              <div className={`${MONO} px-5 py-12 text-center text-[11.5px] uppercase tracking-[0.14em] text-white/35`}>
                Loading…
              </div>
            </DataTable>
          ) : policies.length > 0 ? (
            <DataTable>
              <div className="hidden md:grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,0.6fr)] gap-3 px-5 py-2.5 border-b border-white/[0.06]">
                <ColHead>Name</ColHead>
                <ColHead>Mode</ColHead>
                <ColHead>Rules</ColHead>
                <ColHead>Updated</ColHead>
                <ColHead align="right">Actions</ColHead>
              </div>
              {policies.map((p) => (
                <div
                  key={p.id}
                  className="grid grid-cols-1 gap-2 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,0.6fr)] md:items-center"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Shield className="h-3.5 w-3.5 shrink-0 text-[#0095FF]/70" />
                    <span className={`${MONO} text-[12.5px] font-semibold text-white truncate`}>{p.name}</span>
                  </div>
                  <span
                    className={`${MONO} text-[11px] font-semibold uppercase tracking-[0.12em]`}
                    style={{ color: typeof MODE_COLORS[p.mode] === 'string' && MODE_COLORS[p.mode].startsWith('#') ? MODE_COLORS[p.mode] : undefined }}
                  >
                    <span className={typeof MODE_COLORS[p.mode] !== 'string' || !MODE_COLORS[p.mode].startsWith('#') ? MODE_COLORS[p.mode] : ''}>
                      {MODE_LABEL[p.mode]}
                    </span>
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {p.rules.map((r, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className={`${MONO} text-[9.5px] uppercase tracking-[0.1em] border-white/[0.1] text-white/60 py-0.5`}
                      >
                        {r.type === 'jailbreak' ? 'jailbreak' : r.type === 'pii' ? `pii: ${(r.categories ?? []).join(', ')}` : `regex: ${r.pattern?.slice(0, 20)}`}
                      </Badge>
                    ))}
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
              title="No guardrail policies yet"
              description="Create a named policy and reference it via X-Ahura-Guardrail to add input safety to any inference request."
              action={
                <PrimaryButton onClick={openCreate}>
                  <Plus className="h-3.5 w-3.5" />
                  Create your first policy
                </PrimaryButton>
              }
            />
          )}
        </TabsContent>

        {/* ── Test tab ─────────────────────────────────────── */}
        <TabsContent value="test" className="mt-6 space-y-4 max-w-2xl">
          <SectionHead eyebrow="Dry-run" title="Test" accent="a policy" />

          <div>
            <Field label="Policy (optional — leave blank for default jailbreak check)">
              <Select value={testPolicyId} onValueChange={setTestPolicyId}>
                <SelectTrigger className="bg-white/[0.02] border-white/[0.08]">
                  <SelectValue placeholder="Default (jailbreak warn)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Default (jailbreak warn)</SelectItem>
                  {policies.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {p.mode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Input text to evaluate">
            <Textarea
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="Paste user message here…"
              rows={6}
              className="bg-white/[0.02] border-white/[0.08] font-mono text-[11.5px] resize-none"
            />
          </Field>

          <PrimaryButton onClick={runTest} disabled={testing || !testText.trim()}>
            <Play className="h-3.5 w-3.5" />
            {testing ? 'Evaluating…' : 'Run evaluation'}
          </PrimaryButton>

          {testResult && (
            <div className="border border-white/[0.08] bg-[#111216] rounded-[6px] p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className={`${MONO} text-[10px] uppercase tracking-[0.14em] text-white/45`}>Result</span>
                <span className={`${MONO} text-[13px] font-bold uppercase tracking-[0.1em] ${ACTION_COLOR[testResult.action] ?? 'text-white'}`}>
                  {testResult.action}
                </span>
              </div>

              {testResult.hits.length > 0 && (
                <div className="space-y-1">
                  <p className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/40`}>Hits</p>
                  {testResult.hits.map((h, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px]">
                      <Badge
                        variant="outline"
                        className={`${MONO} text-[9.5px] uppercase shrink-0 border-white/[0.1] ${h.severity === 'critical' ? 'text-red-400/80' : 'text-amber-300/70'}`}
                      >
                        {h.pattern_id}
                      </Badge>
                      <code className={`${MONO} text-white/60 break-all`}>{h.excerpt}</code>
                    </div>
                  ))}
                </div>
              )}

              {testResult.redacted_text && (
                <div>
                  <p className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/40 mb-1`}>Redacted output</p>
                  <pre className={`${MONO} text-[11px] text-[#0095FF]/80 bg-black/30 border border-white/[0.06] rounded p-3 whitespace-pre-wrap break-all`}>
                    {testResult.redacted_text}
                  </pre>
                </div>
              )}

              {testResult.action === 'clean' && (
                <p className={`${MONO} text-[11px] text-emerald-400/80`}>No violations detected.</p>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── How-to tab ────────────────────────────────────── */}
        <TabsContent value="usage" className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5">
            <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45 mb-2`}>
              Named policy
            </p>
            <h4 className="text-[14.5px] font-semibold tracking-[-0.01em] text-white mb-2">Reference by name</h4>
            <pre className={`${MONO} text-[10.5px] text-white/65 leading-relaxed bg-black/40 border border-white/[0.06] rounded p-2.5 overflow-x-auto`}>
{`curl -X POST ${INFERENCE_API_BASE}/chat/completions \\
  -H "Authorization: Bearer ahu_live_..." \\
  -H "X-Ahura-Guardrail: strict-pii" \\
  -d '{"messages":[{"role":"user","content":"..."}]}'`}
            </pre>
          </div>
          <div className="border border-white/[0.06] bg-[#111216] rounded-[6px] p-5">
            <p className={`${MONO} text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45 mb-2`}>
              Built-in keywords
            </p>
            <h4 className="text-[14.5px] font-semibold tracking-[-0.01em] text-white mb-2">No policy required</h4>
            <p className={`${MONO} text-[11px] text-white/55 leading-relaxed mb-3`}>
              Pass <CodeChip>warn</CodeChip>, <CodeChip>block</CodeChip>, or <CodeChip>redact</CodeChip> as the
              header value to activate the built-in jailbreak pattern set without creating a named policy.
            </p>
            <p className={`${MONO} text-[10px] text-white/40 leading-relaxed`}>
              <CodeChip>block</CodeChip> hard-stops on critical hits,{' '}
              <CodeChip>redact</CodeChip> scrubs PII before forwarding,{' '}
              <CodeChip>warn</CodeChip> logs and continues,{' '}
              <CodeChip>off</CodeChip> disables enforcement entirely.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Create / Edit dialog ───────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg border-white/[0.08] bg-[#111216]">
          <DialogHeader>
            <DialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-white/80`}>
              {form.id ? 'Edit policy' : 'New policy'}
            </DialogTitle>
            <DialogDescription className={`${MONO} text-[11px] text-white/45 leading-relaxed`}>
              The name becomes the value passed in X-Ahura-Guardrail. Letters, digits, hyphens.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="strict-pii"
                className="bg-white/[0.02] border-white/[0.08]"
                disabled={!!form.id}
              />
            </Field>

            <Field label="Mode">
              <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v as PolicyMode })}>
                <SelectTrigger className="bg-white/[0.02] border-white/[0.08]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="warn">Warn — log hit, continue</SelectItem>
                  <SelectItem value="block">Block — return 400 on violation</SelectItem>
                  <SelectItem value="redact">Redact — scrub PII, continue</SelectItem>
                  <SelectItem value="off">Off — disabled</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <div className="space-y-2">
              <p className={`${MONO} text-[10.5px] uppercase tracking-[0.14em] text-white/55`}>Rules</p>

              {/* Jailbreak rule */}
              <RuleToggle
                checked={form.hasJailbreak}
                label="Jailbreak detection"
                hint="Matches 'ignore previous instructions', DAN prompts, persona hijacks"
                onChange={(v) => setForm({ ...form, hasJailbreak: v })}
              />

              {/* PII rule */}
              <RuleToggle
                checked={form.hasPii}
                label="PII redaction / detection"
                hint="Email, phone, SSN, card number, API keys, IBAN"
                onChange={(v) => setForm({ ...form, hasPii: v })}
              />
              {form.hasPii && (
                <div className="ml-4 mt-1 flex flex-wrap gap-1.5">
                  {PII_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          piiCategories: form.piiCategories.includes(cat)
                            ? form.piiCategories.filter((c) => c !== cat)
                            : [...form.piiCategories, cat],
                        })
                      }
                      className={`${MONO} text-[9.5px] uppercase tracking-[0.1em] px-2 py-0.5 rounded border transition-colors ${
                        form.piiCategories.includes(cat)
                          ? 'bg-[#0095FF]/20 border-[#0095FF]/40 text-[#0095FF]'
                          : 'border-white/[0.08] text-white/40 hover:text-white/60'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}

              {/* Regex rule */}
              <RuleToggle
                checked={form.hasRegex}
                label="Custom regex pattern"
                hint="Block or flag arbitrary patterns in user input"
                onChange={(v) => setForm({ ...form, hasRegex: v })}
              />
              {form.hasRegex && (
                <div className="ml-4 space-y-2 mt-1">
                  <Input
                    value={form.regexPattern}
                    onChange={(e) => setForm({ ...form, regexPattern: e.target.value })}
                    placeholder="confidential|do not share"
                    className="bg-white/[0.02] border-white/[0.08] font-mono text-[11.5px]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={form.regexFlags}
                      onChange={(e) => setForm({ ...form, regexFlags: e.target.value })}
                      placeholder="flags: gi"
                      className="bg-white/[0.02] border-white/[0.08] font-mono text-[11px]"
                    />
                    <Select
                      value={form.regexSeverity}
                      onValueChange={(v) => setForm({ ...form, regexSeverity: v as 'critical' | 'soft' })}
                    >
                      <SelectTrigger className="bg-white/[0.02] border-white/[0.08]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="critical">Critical (triggers block/redact)</SelectItem>
                        <SelectItem value="soft">Soft (warn only)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    value={form.regexId}
                    onChange={(e) => setForm({ ...form, regexId: e.target.value })}
                    placeholder="Rule ID (optional, for audit logs)"
                    className="bg-white/[0.02] border-white/[0.08] text-[11px]"
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <GhostButton onClick={() => setEditOpen(false)} disabled={saving}>Cancel</GhostButton>
            <PrimaryButton onClick={save} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving…' : form.id ? 'Save changes' : 'Create policy'}
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete dialog ─────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="border-white/[0.08] bg-[#111216]">
          <AlertDialogHeader>
            <AlertDialogTitle className={`${MONO} text-[12px] uppercase tracking-[0.16em] text-red-300`}>
              Delete policy
            </AlertDialogTitle>
            <AlertDialogDescription className={`${MONO} text-[11px] text-white/55 leading-relaxed`}>
              Deleting &quot;{deleteTarget?.name}&quot; removes it immediately. Requests referencing it will fall back to
              the default keyword guardrail.
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

function RuleToggle({
  checked,
  label,
  hint,
  onChange,
}: {
  checked: boolean;
  label: string;
  hint: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className={`flex items-start justify-between rounded-[5px] border px-3 py-2.5 cursor-pointer transition-colors ${
        checked ? 'border-[#0095FF]/30 bg-[#0095FF]/5' : 'border-white/[0.08] bg-white/[0.02]'
      }`}
      onClick={() => onChange(!checked)}
    >
      <div>
        <p className={`${MONO} text-[11px] uppercase tracking-[0.12em] font-semibold text-white/80`}>{label}</p>
        <p className={`${MONO} mt-0.5 text-[10px] text-white/40`}>{hint}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => { e.stopPropagation(); onChange(e.target.checked); }}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#0095FF]"
      />
    </div>
  );
}
