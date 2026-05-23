'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Database, Zap, Globe, Settings, Search, Loader2, Layers, Leaf, BarChart3,
  ChevronDown, ChevronUp, CheckCircle2, Package, HardDrive, Plus,
  ShieldCheck, Users, ExternalLink, Pencil, Trash2, Globe2, EyeOff,
  FlaskConical, Copy, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { getServiceDefinition } from '@/lib/services/registry';
import type { EnvValue } from '@/lib/templates/domain/spec-schema';

// ── Shared types ──────────────────────────────────────────────────────────────

type ServiceSummary = { name: string; type: string; engine?: string; image: string };

type TemplateSummary = {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  kind?: string;
  serviceCount: number;
  services: ServiceSummary[];
  verified?: boolean;
  deployCount?: number;
  creatorName?: string;
  iconUrl?: string;
};

type FullService = {
  id: string;
  name: string;
  type: string;
  engine?: string;
  source?: { kind?: string; image?: string; repoUrl?: string };
  image: string;
  env?: Record<string, EnvValue>;
  volumes?: { name: string; mountPath: string; sizeGb: number }[];
};

type FullTemplate = {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  inputs?: Record<string, { label: string; description?: string; required?: boolean; defaultValue?: string; secret?: boolean }>;
  services: FullService[];
};

type MyTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string;
  tags: string[];
  kind: 'single' | 'multi';
  schema: { services: { name: string; type: string; engine?: string; source?: { kind?: string; image?: string; repoUrl?: string } }[] };
  share?: { templateUrl: string; markdown: string; html: string };
  active: boolean;
  created_at: string;
  updated_at: string;
  versionStatus?: { status: string; testStatus: string | null; hasPassedTest: boolean };
};

type DeployInputDraft = {
  envKey: string;
  inputKey: string;
  label: string;
  description?: string;
  required: boolean;
  secret: boolean;
  value: string;
};

type AutoWiredEnv = {
  key: string;
  fromService: string;
  field: 'privateHost' | 'publicUrl';
};

type ServiceDraft = {
  serviceId: string;
  originalName: string;
  name: string;
  image: string;
  sourceKind?: string;
  type: string;
  engine?: string;
  volumes?: { name: string; mountPath: string; sizeGb: number }[];
  inputs: DeployInputDraft[];
  autoWired: AutoWiredEnv[];
  expanded: boolean;
};

// ── Icon helpers ──────────────────────────────────────────────────────────────

function serviceMeta(engine?: string) {
  const def = getServiceDefinition(engine ?? 'generic');
  const Icon = def.icon === 'Database' ? Database
    : def.icon === 'Zap' ? Zap
      : def.icon === 'Layers' ? Layers
        : def.icon === 'Leaf' ? Leaf
          : def.icon === 'BarChart3' ? BarChart3
            : def.icon === 'Settings' ? Settings
              : Globe;
  return { Icon, color: def.color.text, bg: def.color.bg, border: def.color.border, label: def.label };
}

function serviceIcon(engine?: string) {
  const { Icon } = serviceMeta(engine);
  return <Icon className="w-3.5 h-3.5" />;
}

function servicePillClass(engine?: string) {
  const def = getServiceDefinition(engine ?? 'generic');
  return `${def.color.text} ${def.color.bg.replace('/20', '/15')} ${def.color.border.replace('/30', '/20')}`;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  { bg: 'bg-violet-500/20', text: 'text-violet-300', border: 'border-violet-500/30' },
  { bg: 'bg-sky-500/20',    text: 'text-sky-300',    border: 'border-sky-500/30'    },
  { bg: 'bg-emerald-500/20',text: 'text-emerald-300',border: 'border-emerald-500/30'},
  { bg: 'bg-amber-500/20',  text: 'text-amber-300',  border: 'border-amber-500/30'  },
  { bg: 'bg-rose-500/20',   text: 'text-rose-300',   border: 'border-rose-500/30'   },
];

const FILTER_TABS = [
  { id: 'all',        label: 'All'        },
  { id: 'stacks',     label: 'Stacks'     },
  { id: 'databases',  label: 'Databases'  },
  { id: 'ai',         label: 'AI / ML'    },
  { id: 'automation', label: 'Automation' },
  { id: 'analytics',  label: 'Analytics'  },
];

const AI_TAGS         = new Set(['ai', 'ml', 'llm', 'vector', 'embeddings', 'inference', 'gpu']);
const AUTOMATION_TAGS = new Set(['automation', 'workflow', 'orchestration', 'n8n', 'temporal', 'airflow']);
const ANALYTICS_TAGS  = new Set(['analytics', 'metrics', 'visualization', 'bi', 'clickhouse', 'metabase', 'grafana']);

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// ── Deploy dialog helpers ─────────────────────────────────────────────────────

function inputDraftsForService(service: FullService, templateInputs: NonNullable<FullTemplate['inputs']>): DeployInputDraft[] {
  return Object.entries(service.env ?? {})
    .filter((entry): entry is [string, Extract<EnvValue, { kind: 'input' }>] => entry[1].kind === 'input')
    .map(([envKey, value]) => {
      const meta = templateInputs[value.inputKey];
      return {
        envKey,
        inputKey: value.inputKey,
        label: meta?.label ?? value.inputKey,
        description: meta?.description,
        required: meta?.required ?? value.defaultValue === undefined,
        secret: meta?.secret ?? false,
        value: value.defaultValue ?? meta?.defaultValue ?? '',
      };
    });
}

function autoWiredForService(service: FullService): AutoWiredEnv[] {
  return Object.entries(service.env ?? {})
    .filter((entry): entry is [string, Extract<EnvValue, { kind: 'serviceRef' }>] => entry[1].kind === 'serviceRef')
    .map(([key, value]) => ({ key, fromService: value.serviceId, field: value.field }));
}

// ── Service configure card (inside deploy dialog) ─────────────────────────────

function ServiceConfigCard({ draft, onChange, onToggle }: {
  draft: ServiceDraft;
  onChange: (d: Partial<ServiceDraft>) => void;
  onToggle: () => void;
}) {
  const tm = serviceMeta(draft.engine);
  const hasVolume = !!draft.volumes?.length;
  const requiredMissing = draft.inputs.some(i => i.required && !i.value.trim());
  const isGithub = draft.sourceKind === 'github';

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.02]">
      <div className="flex items-center gap-3 p-4">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border ${tm.bg} ${tm.border}`}>
          <tm.Icon className={`w-[18px] h-[18px] ${tm.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{draft.name}</p>
          <p className="text-[11px] text-white/30 font-mono truncate">{draft.image}</p>
          {isGithub && (
            <p className="text-[10px] text-amber-300/80 mt-0.5">GitHub build not yet supported for template deploys.</p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className={`flex items-center gap-1.5 text-[11px] ${requiredMissing || isGithub ? 'text-amber-300' : 'text-green-400'}`}>
            <CheckCircle2 className="w-3.5 h-3.5" />
            {requiredMissing ? 'Needs input' : isGithub ? 'Unsupported' : 'Ready'}
          </div>
          <button
            onClick={onToggle}
            className="flex items-center gap-1 text-xs text-white/50 hover:text-white border border-white/10 rounded-lg px-2.5 py-1 hover:bg-white/8 transition-all"
          >
            {draft.expanded ? <><ChevronUp className="w-3 h-3" /> Hide</> : <><ChevronDown className="w-3 h-3" /> Configure</>}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {draft.expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/8 p-4 space-y-5">
              {draft.autoWired.length > 0 && (
                <div>
                  <Label className="text-xs text-white/50 mb-2 block">Auto-configured from other services</Label>
                  <div className="space-y-1">
                    {draft.autoWired.map(aw => (
                      <div key={aw.key} className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg bg-sky-500/8 border border-sky-500/15">
                        <span className="font-mono text-white/60">{aw.key}</span>
                        <span className="text-sky-300/70">← {aw.fromService}.{aw.field}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {draft.inputs.length > 0 && (
                <div>
                  <Label className="text-xs text-white/50 mb-2 block">Deploy-time variables</Label>
                  <div className="space-y-2">
                    {draft.inputs.map(inp => (
                      <label key={`${inp.envKey}:${inp.inputKey}`} className="block">
                        <span className="text-[11px] text-white/45 mb-1 flex items-center gap-1">
                          {inp.label}{inp.required && <span className="text-red-300">*</span>}
                        </span>
                        <Input
                          type={inp.secret ? 'password' : 'text'}
                          value={inp.value}
                          onChange={e => onChange({ inputs: draft.inputs.map(x => x.envKey === inp.envKey ? { ...x, value: e.target.value } : x) })}
                          className="bg-white/5 border-white/10 text-white font-mono text-xs h-8"
                        />
                        {inp.description && <span className="text-[10px] text-white/25 mt-0.5 block">{inp.description}</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Package className="w-3.5 h-3.5 text-white/30" />
                  <Label className="text-xs text-white/50">Docker image</Label>
                </div>
                <Input value={draft.image} onChange={e => onChange({ image: e.target.value })}
                  className="bg-white/5 border-white/10 text-white font-mono text-xs h-8" />
              </div>
              <div>
                <Label className="text-xs text-white/50 mb-2 block">Service name</Label>
                <Input value={draft.name} onChange={e => onChange({ name: e.target.value })}
                  className="bg-white/5 border-white/10 text-white text-xs h-8" />
              </div>
              {hasVolume && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <HardDrive className="w-3.5 h-3.5 text-white/30" />
                    <Label className="text-xs text-white/50">Storage size (GB)</Label>
                  </div>
                  <Input type="number" min={1} value={draft.volumes![0].sizeGb}
                    onChange={e => onChange({ volumes: draft.volumes!.map((v, i) => i === 0 ? { ...v, sizeGb: parseInt(e.target.value) || 5 } : v) })}
                    className="bg-white/5 border-white/10 text-white text-xs h-8 w-24" />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Deploy dialog ─────────────────────────────────────────────────────────────

function DeployDialog({ template, onClose }: { template: TemplateSummary; onClose: () => void }) {
  const router = useRouter();
  const [fullTemplate, setFullTemplate] = useState<FullTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<ServiceDraft[]>([]);
  const [projectName, setProjectName] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/templates/${template.slug}`)
      .then(r => r.json())
      .then(d => {
        const t: FullTemplate = d.template;
        setFullTemplate(t);
        setDrafts(t.services.map(svc => ({
          serviceId: svc.id, originalName: svc.name, name: svc.name,
          image: svc.source?.kind === 'github' ? svc.source.repoUrl ?? '' : svc.image,
          sourceKind: svc.source?.kind, type: svc.type, engine: svc.engine, volumes: svc.volumes,
          inputs: inputDraftsForService(svc, t.inputs ?? {}),
          autoWired: autoWiredForService(svc), expanded: false,
        })));
      })
      .finally(() => setLoading(false));
  }, [template.slug]);

  function updateDraft(i: number, changes: Partial<ServiceDraft>) {
    setDrafts(prev => prev.map((d, idx) => idx === i ? { ...d, ...changes } : d));
  }

  async function handleDeploy() {
    if (!projectName.trim() || !fullTemplate) return;
    setDeploying(true); setError('');
    try {
      const serviceOverrides: Record<string, { name: string; image: string }> = {};
      const serviceInputs: Record<string, Record<string, string>> = {};
      drafts.forEach(d => {
        serviceOverrides[d.originalName] = { name: d.name, image: d.image };
        if (d.inputs.length > 0) {
          serviceInputs[d.serviceId] = Object.fromEntries(d.inputs.map(i => [i.inputKey, i.value]));
        }
      });
      const res = await fetch('/api/templates/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: template.slug, projectName: projectName.trim(), serviceOverrides, serviceInputs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Deploy failed');
      router.push(`/dashboard/projects/${data.instanceId}/deploy/${data.runId}`);
    } catch (err) {
      setError((err as Error).message);
      setDeploying(false);
    }
  }

  const palette = AVATAR_PALETTE[0];
  const hasUnsupportedGithub = drafts.some(d => d.sourceKind === 'github');
  const missingRequiredInput = drafts.some(d => d.inputs.some(i => i.required && !i.value.trim()));

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="bg-[#0D0D12] border-white/10 text-white max-w-2xl max-h-[88vh] overflow-hidden flex flex-col p-0">
        <div className="px-6 pt-6 pb-4 border-b border-white/8 flex-shrink-0">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold border flex-shrink-0 ${palette.bg} ${palette.text} ${palette.border}`}>
              {template.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">{template.name}</h2>
                {template.verified && (
                  <span className="flex items-center gap-1 text-[10px] text-blue-300 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded-full">
                    <ShieldCheck className="w-3 h-3" /> Verified
                  </span>
                )}
              </div>
              <p className="text-xs text-white/40 truncate">{template.description}</p>
            </div>
          </div>
          <div>
            <Label className="text-xs text-white/50 mb-1.5 block">Project name</Label>
            <Input
              placeholder={`my-${template.slug}`}
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleDeploy()}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/25"
              autoFocus
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
            </div>
          ) : drafts.map((draft, i) => (
            <ServiceConfigCard
              key={draft.originalName}
              draft={draft}
              onChange={changes => updateDraft(i, changes)}
              onToggle={() => updateDraft(i, { expanded: !draft.expanded })}
            />
          ))}
        </div>
        <div className="px-6 py-4 border-t border-white/8 flex-shrink-0 space-y-3">
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
          {hasUnsupportedGithub && (
            <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              GitHub-source services need the platform build adapter. Use Docker image services for now.
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose} className="text-white/50 hover:text-white hover:bg-white/8">Cancel</Button>
            <Button
              className="bg-white text-black hover:bg-white/90 px-6"
              disabled={!projectName.trim() || deploying || loading || hasUnsupportedGithub || missingRequiredInput}
              onClick={handleDeploy}
            >
              {deploying ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Launching…</> : 'Deploy Now →'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Marketplace template card ─────────────────────────────────────────────────

function TemplateCard({ t, i, onDeploy, onView }: {
  t: TemplateSummary; i: number; onDeploy: () => void; onView: () => void;
}) {
  const palette = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
      className="group bg-white/[0.03] border border-white/8 rounded-xl p-5 hover:bg-white/[0.06] hover:border-white/15 transition-all duration-200 flex flex-col"
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold border ${palette.bg} ${palette.text} ${palette.border}`}>
          {t.iconUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={t.iconUrl} alt={t.name} className="w-8 h-8 object-contain rounded" />
            : t.name[0]}
        </div>
        {t.verified && (
          <span className="flex items-center gap-1 text-[10px] text-blue-300 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded-full">
            <ShieldCheck className="w-3 h-3" /> Verified
          </span>
        )}
      </div>
      <h3 className="font-semibold text-[15px] mb-1 text-white group-hover:text-white/90">{t.name}</h3>
      <p className="text-white/40 text-xs leading-relaxed mb-3 flex-1 line-clamp-2">{t.description}</p>
      <div className="flex items-center gap-3 text-[10px] text-white/25 mb-3">
        {t.creatorName && <span>by {t.creatorName}</span>}
        {t.deployCount !== undefined && t.deployCount > 0 && (
          <span className="flex items-center gap-1 ml-auto"><Users className="w-3 h-3" />{formatCount(t.deployCount)}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {t.services.map(svc => {
          const sm = serviceMeta(svc.engine);
          return (
            <span key={svc.name} className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border ${sm.bg} ${sm.color} ${sm.border}`}>
              <sm.Icon className="w-3 h-3" />{svc.name}
            </span>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button onClick={onView} className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white hover:border-white/20 hover:bg-white/[0.04] transition-all">
          <ExternalLink className="w-3 h-3" /> View
        </button>
        <Button size="sm" className="flex-1 bg-white text-black hover:bg-white/90 text-xs font-medium h-8" onClick={onDeploy}>
          Deploy
        </Button>
      </div>
    </motion.div>
  );
}

// ── "Mine" tab ─────────────────────────────────────────────────────────────────

function MyTemplatesTab({ onDeploy }: { onDeploy: (slug: string) => void }) {
  const router = useRouter();
  const [templates, setTemplates] = useState<MyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<{ id: string; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/developer/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleTest(t: MyTemplate) {
    setTesting(t.id); setPublishError(null);
    try {
      const res = await fetch(`/api/developer/templates/${t.id}/test`, { method: 'POST' });
      await load();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPublishError({ id: t.id, message: err.errors?.[0]?.message ?? err.error ?? 'Test failed' });
      }
    } finally { setTesting(null); }
  }

  async function handleTogglePublish(t: MyTemplate) {
    setPublishError(null); setToggling(t.id);
    try {
      const res = await fetch(`/api/developer/templates/${t.id}/publish`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPublishError({ id: t.id, message: err.error ?? 'Failed to publish' });
        return;
      }
      await load();
    } finally { setToggling(null); }
  }

  async function handleDelete(t: MyTemplate) {
    if (!confirm(`Delete "${t.name}"? This cannot be undone.`)) return;
    setDeleting(t.id);
    try {
      await fetch(`/api/developer/templates/${t.id}`, { method: 'DELETE' });
      setTemplates(prev => prev.filter(x => x.id !== t.id));
    } finally { setDeleting(null); }
  }

  async function copyDeployButton(t: MyTemplate) {
    if (!t.share?.markdown) return;
    await navigator.clipboard.writeText(t.share.markdown);
  }

  const visible = templates.filter(t =>
    filter === 'published' ? t.active : filter === 'draft' ? !t.active : true
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
      </div>
    );
  }

  if (visible.length === 0 && templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/8 flex items-center justify-center">
          <Layers className="w-7 h-7 text-white/20" />
        </div>
        <div className="text-center">
          <p className="text-white/60 font-medium mb-1">No templates yet</p>
          <p className="text-white/30 text-sm max-w-xs">
            Package any stack you deploy into a reusable one-click template for others — or just for yourself.
          </p>
        </div>
        <div className="flex flex-col items-center gap-2 mt-2">
          <Button onClick={() => router.push('/dashboard/templates/new')} className="bg-white text-black hover:bg-white/90">
            <Plus className="w-4 h-4 mr-1.5" /> Create Template
          </Button>
          <p className="text-[11px] text-white/25 flex items-center gap-1">
            or go to a project and click <Layers className="w-3 h-3 mx-0.5" /> to generate from it
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Filter + create */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-3">
          {(['all', 'published', 'draft'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`text-xs pb-1 border-b-2 transition-colors capitalize ${filter === tab ? 'border-white text-white' : 'border-transparent text-white/35 hover:text-white/60'}`}
            >
              {tab}
              {tab === 'all' && templates.length > 0 && <span className="ml-1.5 text-[10px] text-white/25">{templates.length}</span>}
            </button>
          ))}
        </div>
        <button
          onClick={() => router.push('/dashboard/templates/new')}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/8 border border-white/12 text-white/60 hover:text-white hover:bg-white/12 transition-all"
        >
          <Plus className="w-3 h-3" /> New Template
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="text-center text-sm text-white/30 py-16">No {filter} templates</p>
      ) : (
        <div className="grid gap-3">
          {visible.map((t, i) => {
            const services = t.schema?.services ?? [];
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className="bg-[#0e0e16] border border-white/[0.07] rounded-xl p-4 flex items-start gap-4 hover:border-white/12 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/8 flex items-center justify-center flex-shrink-0">
                  <Layers className={`w-4 h-4 ${t.kind === 'multi' ? 'text-blue-300' : 'text-white/30'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-white">{t.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${t.active ? 'text-green-400 bg-green-500/10 border-green-500/20' : 'text-white/30 bg-white/[0.04] border-white/10'}`}>
                      {t.active ? 'Published' : 'Draft'}
                    </span>
                    {!t.active && t.versionStatus?.hasPassedTest && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                        Tested ✓
                      </span>
                    )}
                    <span className="text-[10px] text-white/20 font-mono">{t.slug}</span>
                  </div>
                  <p className="text-[12px] text-white/40 mb-2.5 line-clamp-1">{t.description}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {services.map(s => (
                      <span key={s.name} className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border ${servicePillClass(s.engine)}`}>
                        {serviceIcon(s.engine)}{s.name}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    {t.share?.templateUrl && (
                      <button onClick={() => window.open(t.share!.templateUrl, '_blank', 'noopener,noreferrer')}
                        className="p-2 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors" title="Open share page">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {t.share?.markdown && (
                      <button onClick={() => copyDeployButton(t)}
                        className="p-2 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors" title="Copy deploy badge">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {t.active && (
                      <button onClick={() => onDeploy(t.slug)}
                        className="p-2 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors" title="Deploy this template">
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => router.push(`/dashboard/templates/edit/${t.id}`)}
                      className="p-2 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors" title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {!t.active && !t.versionStatus?.hasPassedTest && (
                      <button onClick={() => handleTest(t)} disabled={!!testing}
                        className="p-2 rounded-lg text-amber-300/50 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                        title="Run validation test (required before publishing)">
                        {testing === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <button
                      onClick={() => handleTogglePublish(t)}
                      disabled={!!toggling || (!t.active && !t.versionStatus?.hasPassedTest)}
                      className={`p-2 rounded-lg transition-colors ${t.active ? 'text-green-400/60 hover:text-white hover:bg-white/8' : t.versionStatus?.hasPassedTest ? 'text-white/30 hover:text-green-400 hover:bg-green-500/10' : 'text-white/15 cursor-not-allowed'}`}
                      title={t.active ? 'Unpublish' : t.versionStatus?.hasPassedTest ? 'Publish to marketplace' : 'Run test before publishing'}
                    >
                      {toggling === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t.active ? <EyeOff className="w-3.5 h-3.5" /> : <Globe2 className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => handleDelete(t)} disabled={!!deleting}
                      className="p-2 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Delete">
                      {deleting === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {publishError?.id === t.id && (
                    <p className="text-[10px] text-red-400 max-w-[220px] text-right leading-snug">{publishError.message}</p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Lifecycle guide */}
      <div className="mt-8 p-4 rounded-xl border border-white/[0.06] bg-white/[0.01]">
        <p className="text-[11px] text-white/35 uppercase tracking-wider font-medium mb-3">Template lifecycle</p>
        <div className="flex items-center gap-0 text-[11px] text-white/40 flex-wrap">
          {[
            { step: '1. Create', hint: 'Define services + env vars' },
            { step: '2. Test', hint: 'Validate spec & best practices' },
            { step: '3. Publish', hint: 'List on marketplace' },
            { step: '4. Deploy', hint: 'One-click for anyone' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-0">
              <div className="px-3 py-1.5">
                <span className="text-white/60 font-medium">{item.step}</span>
                <span className="text-white/25 ml-1.5">{item.hint}</span>
              </div>
              {i < 3 && <ArrowRight className="w-3 h-3 text-white/20 flex-shrink-0" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Inner page ────────────────────────────────────────────────────────────────

function TemplatesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeMainTab = searchParams.get('tab') === 'mine' ? 'mine' : 'discover';
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateSummary | null>(null);

  const loadMarketplace = useCallback(async () => {
    const res = await fetch('/api/templates');
    if (res.ok) {
      const { templates: t } = await res.json();
      setTemplates(t ?? []);
      const deploySlug = searchParams.get('deploy');
      if (deploySlug) {
        const target = t.find((x: TemplateSummary) => x.slug === deploySlug);
        if (target) setSelectedTemplate(target);
      }
    }
  }, [searchParams]);

  useEffect(() => { loadMarketplace(); }, [loadMarketplace]);

  function switchTab(tab: 'discover' | 'mine') {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'discover') params.delete('tab');
    else params.set('tab', 'mine');
    router.push(`/dashboard/templates?${params.toString()}`);
  }

  function handleDeployBySlug(slug: string) {
    const t = templates.find(x => x.slug === slug);
    if (t) { setSelectedTemplate(t); switchTab('discover'); }
    else router.push(`/dashboard/templates/${slug}`);
  }

  const filtered = templates.filter(t => {
    if (activeFilter === 'stacks'     && t.kind !== 'multi') return false;
    if (activeFilter === 'databases'  && !t.tags.some(tag => ['database','postgres','mysql','mongodb','redis','valkey','clickhouse'].includes(tag))) return false;
    if (activeFilter === 'ai'         && !t.tags.some(tag => AI_TAGS.has(tag))) return false;
    if (activeFilter === 'automation' && !t.tags.some(tag => AUTOMATION_TAGS.has(tag))) return false;
    if (activeFilter === 'analytics'  && !t.tags.some(tag => ANALYTICS_TAGS.has(tag))) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.tags.some(g => g.includes(search.toLowerCase()))) return false;
    return true;
  });

  return (
    <div className="flex-1 bg-black min-h-screen text-white">
      {/* Header */}
      <div className="px-6 sm:px-8 pt-8 pb-0">
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-1">Templates</h1>
              <p className="text-white/40 text-sm">
                {activeMainTab === 'discover' ? 'One-click deployment of popular stacks.' : 'Your templates — build, test, publish, and share.'}
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard/templates/new')}
              className="flex items-center gap-1.5 bg-white text-black hover:bg-white/90 transition-colors text-xs font-medium px-3 py-1.5 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" /> New Template
            </button>
          </div>
        </motion.div>

        {/* Main tabs */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-end gap-0">
            {([
              { id: 'discover', label: 'Discover' },
              { id: 'mine',     label: 'My Templates' },
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                  activeMainTab === tab.id ? 'text-white border-white' : 'text-white/40 border-transparent hover:text-white/70 hover:border-white/20'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeMainTab === 'discover' && (
            <div className="flex items-center gap-3">
              <div className="flex items-end gap-0">
                {FILTER_TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveFilter(tab.id)}
                    className={`px-3 py-2 text-xs font-medium border-b-2 transition-all ${
                      activeFilter === tab.id ? 'text-white border-white' : 'text-white/35 border-transparent hover:text-white/60 hover:border-white/15'
                    }`}
                  >
                    {tab.label}
                    {tab.id === 'all' && templates.length > 0 && <span className="ml-1 text-[10px] text-white/25">{templates.length}</span>}
                  </button>
                ))}
              </div>
              <div className="relative w-44">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                <Input
                  placeholder="Search…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs bg-white/5 border-white/10 text-white placeholder:text-white/25 focus-visible:ring-white/20"
                />
              </div>
            </div>
          )}
        </div>
        <div className="border-b border-white/8" />
      </div>

      {/* Tab content */}
      <div className="px-6 sm:px-8 py-6">
        {activeMainTab === 'discover' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((t, i) => (
              <TemplateCard
                key={t.slug} t={t} i={i}
                onDeploy={() => setSelectedTemplate(t)}
                onView={() => router.push(`/dashboard/templates/${t.slug}`)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full flex flex-col items-center py-20 text-white/25 gap-3">
                <Package className="w-10 h-10 opacity-40" />
                <p className="text-sm">
                  {search ? `No templates match "${search}"` : 'No templates in this category'}
                </p>
                <button onClick={() => switchTab('mine')} className="text-xs text-white/40 hover:text-white transition-colors flex items-center gap-1">
                  Create your own <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <MyTemplatesTab onDeploy={handleDeployBySlug} />
        )}
      </div>

      {selectedTemplate && (
        <DeployDialog template={selectedTemplate} onClose={() => setSelectedTemplate(null)} />
      )}
    </div>
  );
}

export default function TemplatesPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 bg-black min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
      </div>
    }>
      <TemplatesInner />
    </Suspense>
  );
}
