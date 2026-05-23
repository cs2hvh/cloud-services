'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import {
  ArrowLeft, Database, Zap, Globe, Settings, Loader2, Layers, Leaf, BarChart3,
  CheckCircle2, ShieldCheck, Users, HardDrive, Cpu,
  ExternalLink, GitBranch, Package,
} from 'lucide-react';
import { getServiceDefinition } from '@/lib/services/registry';

type TemplateService = {
  name: string;
  type: string;
  engine?: string;
  image: string;
  source?: { kind: 'github' | 'image'; repoUrl?: string; image?: string; branch?: string };
  volumes?: { name: string; mountPath: string; sizeGb: number }[];
  ports?: { internal: number; public?: boolean }[];
  dependsOn?: string[];
  healthCheck?: { type: string; port: number; path?: string };
};

type Template = {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  kind: 'single' | 'multi';
  services: TemplateService[];
  verified?: boolean;
  deployCount?: number;
  iconUrl?: string;
  creatorName?: string;
};

function serviceMeta(engine?: string) {
  const def = getServiceDefinition(engine ?? 'generic');
  const Icon = def.icon === 'Database' ? Database
    : def.icon === 'Zap' ? Zap
      : def.icon === 'Layers' ? Layers
        : def.icon === 'Leaf' ? Leaf
          : def.icon === 'BarChart3' ? BarChart3
            : def.icon === 'Settings' ? Settings
              : Globe;
  return {
    Icon,
    color: def.color.text,
    bg: def.color.bg.replace('/20', '/15'),
    border: def.color.border.replace('/30', '/25'),
    label: def.label,
  };
}

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function ServiceCard({ svc }: { svc: TemplateService }) {
  const tm = serviceMeta(svc.engine);
  const isGithub = svc.source?.kind === 'github';

  return (
    <div className="bg-[#0e0e16] border border-white/[0.07] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border ${tm.bg} ${tm.border}`}>
          <tm.Icon className={`w-4 h-4 ${tm.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-white">{svc.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${tm.bg} ${tm.border} ${tm.color}`}>
              {tm.label}
            </span>
            {svc.dependsOn && svc.dependsOn.length > 0 && (
              <span className="text-[10px] text-white/30 flex items-center gap-1">
                → depends on {svc.dependsOn.join(', ')}
              </span>
            )}
          </div>
          {isGithub ? (
            <div className="flex items-center gap-1 text-[11px] text-white/35 font-mono">
              <GitBranch className="w-3 h-3" />
              {svc.source?.repoUrl}
              {svc.source?.branch && <span className="text-white/20">@{svc.source.branch}</span>}
            </div>
          ) : (
            <p className="text-[11px] text-white/25 font-mono truncate">
              <Package className="w-3 h-3 inline mr-1 opacity-60" />
              {svc.image}
            </p>
          )}
        </div>
      </div>

      {/* Volumes */}
      {svc.volumes && svc.volumes.length > 0 && (
        <>
          <div className="border-t border-white/[0.05]" />
          <div className="flex items-center gap-2 px-4 py-2.5 flex-wrap">
            {svc.volumes.map(v => (
              <span key={v.name} className="flex items-center gap-1.5 text-[10px] text-white/30 bg-white/[0.04] border border-white/8 rounded-md px-2 py-1">
                <HardDrive className="w-3 h-3" />
                {v.mountPath} — {v.sizeGb}GB
              </span>
            ))}
          </div>
        </>
      )}

      {/* Ports */}
      {svc.ports && svc.ports.length > 0 && (
        <>
          <div className="border-t border-white/[0.05]" />
          <div className="flex items-center gap-2 px-4 py-2.5">
            {svc.ports.map((p, i) => (
              <span key={i} className="flex items-center gap-1.5 text-[10px] text-white/30 bg-white/[0.04] border border-white/8 rounded-md px-2 py-1">
                <Cpu className="w-3 h-3" />
                :{p.internal} {p.public ? '(public)' : '(private)'}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function TemplateDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [template, setTemplate] = useState<Template | null>(null);
  const [summary, setSummary] = useState<{ verified: boolean; deployCount: number; creatorName: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);

  useEffect(() => {
    async function load() {
      // Load full template schema
      const res = await fetch(`/api/templates/${slug}`);
      if (!res.ok) { router.push('/dashboard/templates'); return; }
      const { template: t } = await res.json();
      setTemplate(t);

      // Load marketplace summary for metadata
      const listRes = await fetch('/api/templates');
      if (listRes.ok) {
        const { templates } = await listRes.json();
        const s = templates.find((x: { slug: string }) => x.slug === slug);
        if (s) setSummary({ verified: s.verified, deployCount: s.deployCount, creatorName: s.creatorName });
      }

      setLoading(false);
    }
    load();
  }, [slug, router]);

  if (loading) {
    return (
      <div className="flex-1 bg-black min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
      </div>
    );
  }

  if (!template) return null;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top bar */}
      <div className="border-b border-white/8 bg-black/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-3.5 flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard/templates')}
            className="text-white/40 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/8"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <h1 className="text-sm font-semibold truncate">{template.name}</h1>
            {summary?.verified && (
              <span className="flex items-center gap-1 text-[10px] text-blue-300 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded-full flex-shrink-0">
                <ShieldCheck className="w-3 h-3" /> Verified
              </span>
            )}
          </div>
          <button
            onClick={() => {
              setDeploying(true);
              router.push(`/dashboard/templates?deploy=${slug}`);
            }}
            disabled={deploying}
            className="flex items-center gap-1.5 bg-white text-black hover:bg-white/90 text-xs font-medium px-4 py-1.5 rounded-lg transition-all disabled:opacity-60"
          >
            {deploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Deploy
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Meta */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-4"
        >
          <div>
            <p className="text-[13px] text-white/50 leading-relaxed mb-4">{template.description}</p>
            <div className="flex items-center gap-4 text-[11px] text-white/30">
              {summary?.deployCount !== undefined && (
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  {formatCount(summary.deployCount)} deploys
                </span>
              )}
              {summary?.creatorName && (
                <span>by {summary.creatorName}</span>
              )}
              <span className={`px-2 py-0.5 rounded-full border text-[10px] ${
                template.kind === 'multi'
                  ? 'text-blue-300 bg-blue-500/10 border-blue-500/20'
                  : 'text-white/40 bg-white/[0.04] border-white/10'
              }`}>
                {template.kind === 'multi' ? `${template.services.length} services` : 'Single service'}
              </span>
            </div>
            {template.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {template.tags.map(t => (
                  <span key={t} className="text-[10px] px-2 py-0.5 rounded-full text-white/30 border border-white/8 bg-white/[0.03]">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* Services */}
        <section>
          <h2 className="text-[11px] text-white/35 uppercase tracking-wider font-medium mb-4">
            Services ({template.services.length})
          </h2>
          <div className="space-y-3">
            {template.services.map((svc, i) => (
              <motion.div
                key={svc.name}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <ServiceCard svc={svc} />
              </motion.div>
            ))}
          </div>
        </section>

        {/* What happens when you deploy */}
        <section className="bg-[#0d1117] border border-white/[0.06] rounded-xl p-5">
          <p className="text-[11px] text-white/35 uppercase tracking-wider font-medium mb-3">What gets deployed</p>
          {template.kind === 'single' ? (
            <p className="text-[12px] text-white/40 leading-relaxed">
              A single <strong className="text-white/60">{template.services[0]?.type}</strong> service is created in
              a dedicated Kubernetes namespace. You can customise env vars, image, and resource limits before deploying.
            </p>
          ) : (
            <div className="space-y-2 text-[12px] text-white/40">
              <p>All {template.services.length} services are provisioned in a shared namespace:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                {template.services.map(s => (
                  <li key={s.name}>
                    <strong className="text-white/60">{s.name}</strong>
                    {s.dependsOn?.length ? ` (waits for ${s.dependsOn.join(', ')})` : ' (starts immediately)'}
                  </li>
                ))}
              </ol>
              <p className="pt-1">Services communicate over a private ClusterIP network — no public access between them unless you enable it.</p>
            </div>
          )}
        </section>

        {/* Deploy CTA */}
        <div className="flex justify-center pb-8">
          <button
            onClick={() => router.push(`/dashboard/templates?deploy=${slug}`)}
            className="flex items-center gap-2 bg-white text-black hover:bg-white/90 text-sm font-medium px-8 py-2.5 rounded-xl transition-all"
          >
            <ExternalLink className="w-4 h-4" /> Deploy this template
          </button>
        </div>
      </div>
    </div>
  );
}
