import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Database, Zap, Globe, Settings, Layers, Leaf, BarChart3,
  HardDrive, ChevronRight, Rocket, CheckCircle2,
  ExternalLink, Package,
} from 'lucide-react';
import {
  getTemplateDetail,
  getTemplateDeployStats,
  getRelatedTemplates,
  type MarketplaceService,
} from '@/lib/templates/queries/marketplace';
import { Button } from '@/components/ui/button';
import { siteConfig } from '@/config/site';

// ── Engine metadata ───────────────────────────────────────────────────────────

const ENGINE_META: Record<string, { label: string; iconName: string; textColor: string; bgColor: string; borderColor: string }> = {
  postgres:   { label: 'PostgreSQL',  iconName: 'Database', textColor: 'text-indigo-300', bgColor: 'bg-indigo-500/15', borderColor: 'border-indigo-500/25' },
  mysql:      { label: 'MySQL',       iconName: 'Database', textColor: 'text-orange-300', bgColor: 'bg-orange-500/15', borderColor: 'border-orange-500/25' },
  mongodb:    { label: 'MongoDB',     iconName: 'Leaf',     textColor: 'text-green-300',  bgColor: 'bg-green-500/15',  borderColor: 'border-green-500/25'  },
  clickhouse: { label: 'ClickHouse',  iconName: 'BarChart3',textColor: 'text-yellow-300', bgColor: 'bg-yellow-500/15', borderColor: 'border-yellow-500/25' },
  redis:      { label: 'Redis',       iconName: 'Zap',      textColor: 'text-red-300',    bgColor: 'bg-red-500/15',    borderColor: 'border-red-500/25'    },
  valkey:     { label: 'Valkey',      iconName: 'Zap',      textColor: 'text-emerald-300',bgColor: 'bg-emerald-500/15',borderColor: 'border-emerald-500/25'},
  rabbitmq:   { label: 'RabbitMQ',   iconName: 'Layers',   textColor: 'text-amber-300',  bgColor: 'bg-amber-500/15',  borderColor: 'border-amber-500/25'  },
  generic:    { label: 'Web Service', iconName: 'Globe',    textColor: 'text-blue-300',   bgColor: 'bg-blue-500/15',   borderColor: 'border-blue-500/25'   },
};

function engineMeta(engine?: string) {
  return ENGINE_META[engine ?? 'generic'] ?? ENGINE_META['generic'];
}

function EngineIcon({ iconName, className }: { iconName: string; className?: string }) {
  const cls = className ?? 'w-5 h-5';
  if (iconName === 'Database') return <Database className={cls} />;
  if (iconName === 'Zap')      return <Zap className={cls} />;
  if (iconName === 'Leaf')     return <Leaf className={cls} />;
  if (iconName === 'BarChart3') return <BarChart3 className={cls} />;
  if (iconName === 'Layers')   return <Layers className={cls} />;
  if (iconName === 'Settings') return <Settings className={cls} />;
  return <Globe className={cls} />;
}

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function resolveImage(svc: MarketplaceService): string {
  if ((svc as { image?: string }).image) return (svc as { image?: string }).image!;
  if (svc.source?.kind === 'image') return svc.source.image ?? '';
  if (svc.source?.kind === 'github') return svc.source.repoUrl ?? '';
  return '';
}

function shortImage(img: string) {
  const tag  = img.split(':').pop() ?? '';
  const name = img.split('/').pop()?.split(':')[0] ?? img;
  return tag ? `${name}:${tag}` : name;
}

// ── Lightweight markdown renderer ─────────────────────────────────────────────

function renderReadme(md: string): React.ReactNode[] {
  if (!md.trim()) return [];

  const nodes: React.ReactNode[] = [];
  const lines = md.split('\n');
  let i = 0;

  function inlineFormat(text: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    const rx = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[([^\]]+)\]\(([^)]+)\))/g;
    let last = 0, m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      const chunk = m[0];
      if (chunk.startsWith('`'))   parts.push(<code key={m.index} className="px-1 py-0.5 text-xs bg-white/10 rounded font-mono text-violet-300">{chunk.slice(1,-1)}</code>);
      else if (chunk.startsWith('**')) parts.push(<strong key={m.index} className="text-white font-semibold">{chunk.slice(2,-2)}</strong>);
      else if (chunk.startsWith('*'))  parts.push(<em key={m.index} className="italic text-neutral-300">{chunk.slice(1,-1)}</em>);
      else if (chunk.startsWith('['))  parts.push(<a key={m.index} href={m[3]} className="text-violet-400 hover:underline" target="_blank" rel="noopener noreferrer">{m[2]}</a>);
      last = m.index + chunk.length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts.length === 1 ? parts[0] : <>{parts}</>;
  }

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('### ')) {
      nodes.push(<h3 key={i} className="text-base font-semibold text-white mt-6 mb-2">{line.slice(4)}</h3>);
    } else if (line.startsWith('## ')) {
      nodes.push(<h2 key={i} className="text-lg font-semibold text-white mt-8 mb-3 border-b border-white/10 pb-1">{line.slice(3)}</h2>);
    } else if (line.startsWith('# ')) {
      nodes.push(<h1 key={i} className="text-xl font-bold text-white mt-8 mb-3">{line.slice(2)}</h1>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(<li key={i} className="flex gap-2 text-neutral-300 text-sm"><span className="text-violet-400 mt-1 shrink-0">•</span><span>{inlineFormat(lines[i].slice(2))}</span></li>);
        i++;
      }
      nodes.push(<ul key={`ul-${i}`} className="space-y-1 my-3">{items}</ul>);
      continue;
    } else if (line.trim() === '') {
      // blank line — skip
    } else if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      nodes.push(<pre key={i} className="my-4 p-4 bg-white/5 border border-white/10 rounded-lg overflow-x-auto text-xs text-neutral-300 font-mono leading-relaxed">{codeLines.join('\n')}</pre>);
    } else if (line.startsWith('> ')) {
      nodes.push(<blockquote key={i} className="border-l-2 border-violet-500/50 pl-4 my-3 text-neutral-400 text-sm italic">{inlineFormat(line.slice(2))}</blockquote>);
    } else {
      nodes.push(<p key={i} className="text-neutral-300 text-sm leading-relaxed mb-3">{inlineFormat(line)}</p>);
    }
    i++;
  }
  return nodes;
}

// ── SEO metadata ──────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const template = await getTemplateDetail(slug);
  if (!template) return { title: 'Template Not Found' };

  const title = `Deploy ${template.name} — ${siteConfig.name}`;
  const description = template.description || `One-click deploy ${template.name} on ${siteConfig.name}.`;

  return {
    title,
    description,
    openGraph: { title, description, url: `${siteConfig.url}/deploy/${slug}` },
    alternates: { canonical: `${siteConfig.url}/deploy/${slug}` },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DeployTemplatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const template = await getTemplateDetail(slug);
  if (!template) notFound();

  const [stats, related] = await Promise.all([
    getTemplateDeployStats(template.id),
    getRelatedTemplates(template.category, slug),
  ]);

  const deployUrl = `/dashboard/templates?deploy=${template.slug}`;
  const { activeProjects, recentProjects, successRate } = stats;

  return (
    <div className="min-h-screen bg-neutral-950">
      {/* Breadcrumb */}
      <div className="border-b border-white/5 bg-neutral-950/80 backdrop-blur sticky top-16 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-10 flex items-center gap-2 text-xs text-neutral-500">
          <Link href="/" className="hover:text-neutral-300 transition-colors">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/templates" className="hover:text-neutral-300 transition-colors">Templates</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href={`/templates?category=${encodeURIComponent(template.category)}`} className="hover:text-neutral-300 transition-colors">{template.category}</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-neutral-300 truncate max-w-[160px]">{template.name}</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-start gap-4 mb-8">
          {template.iconUrl ? (
            <img src={template.iconUrl} alt={template.name} className="w-14 h-14 rounded-xl border border-white/10 object-cover shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-600/20 border border-violet-500/25 flex items-center justify-center shrink-0">
              <Package className="w-6 h-6 text-violet-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-white">{template.name}</h1>
              {template.verificationStatus === 'verified' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-xs">
                  <CheckCircle2 className="w-3 h-3" /> Verified
                </span>
              )}
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-neutral-400 text-xs">
                {template.category}
              </span>
            </div>
            <p className="text-neutral-400 text-sm mt-1 leading-relaxed max-w-2xl">{template.description}</p>
          </div>
          <div className="shrink-0 hidden sm:block">
            <Link href={deployUrl}>
              <Button size="sm" className="bg-violet-600 hover:bg-violet-500 text-white gap-2">
                <Rocket className="w-4 h-4" /> Deploy Now
              </Button>
            </Link>
          </div>
        </div>

        {/* Main two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
          {/* Left column */}
          <div className="space-y-8">
            {/* Service Canvas */}
            <section>
              <h2 className="text-xs font-medium text-neutral-500 mb-4 uppercase tracking-wider">Services ({template.services.length})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {template.services.map((svc, idx) => {
                  const meta = engineMeta(svc.engine);
                  const image = resolveImage(svc);
                  const publicPorts = (svc.ports ?? []).filter(p => p.public);
                  return (
                    <div key={(svc as { id?: string }).id ?? idx} className={`relative rounded-xl border ${meta.borderColor} ${meta.bgColor} p-4 flex flex-col gap-3`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg ${meta.bgColor} border ${meta.borderColor} flex items-center justify-center shrink-0`}>
                          <EngineIcon iconName={meta.iconName} className={`w-4 h-4 ${meta.textColor}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-white truncate">{svc.name}</div>
                          <div className={`text-xs ${meta.textColor} truncate`}>{meta.label}</div>
                        </div>
                        <div className="shrink-0 w-2 h-2 rounded-full bg-emerald-400" />
                      </div>
                      {image && (
                        <div className="flex items-center gap-2 text-xs text-neutral-500 font-mono bg-black/20 rounded-md px-2 py-1.5 truncate">
                          <Package className="w-3 h-3 shrink-0" />
                          <span className="truncate">{shortImage(image)}</span>
                        </div>
                      )}
                      {(svc.volumes ?? []).length > 0 && (
                        <div className="space-y-1">
                          {(svc.volumes ?? []).map(vol => (
                            <div key={vol.name} className="flex items-center gap-2 text-xs text-neutral-500">
                              <HardDrive className="w-3 h-3 shrink-0 text-neutral-600" />
                              <span className="truncate font-mono">{vol.mountPath}</span>
                              <span className="ml-auto shrink-0 text-neutral-600">{vol.sizeGb}GB</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {publicPorts.length > 0 && (
                        <div className="flex items-center gap-1.5 text-xs text-sky-400/70">
                          <Globe className="w-3 h-3" />
                          <span>Public · :{publicPorts[0].internal}</span>
                        </div>
                      )}
                      {(svc.dependsOn ?? []).length > 0 && (
                        <div className="text-xs text-neutral-600">
                          Depends on: <span className="text-neutral-500">{svc.dependsOn!.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* README */}
            {template.readme && (
              <section className="border border-white/8 rounded-xl p-6 bg-white/[0.02]">
                {renderReadme(template.readme)}
              </section>
            )}

            {/* Template Content list */}
            <section>
              <h2 className="text-xs font-medium text-neutral-500 mb-4 uppercase tracking-wider">Template Content</h2>
              <div className="border border-white/8 rounded-xl divide-y divide-white/5 overflow-hidden">
                {template.services.map((svc, idx) => {
                  const meta = engineMeta(svc.engine);
                  const image = resolveImage(svc);
                  return (
                    <div key={(svc as { id?: string }).id ?? idx} className="flex items-center gap-4 px-4 py-3">
                      <div className={`w-8 h-8 rounded-lg ${meta.bgColor} border ${meta.borderColor} flex items-center justify-center shrink-0`}>
                        <EngineIcon iconName={meta.iconName} className={`w-4 h-4 ${meta.textColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white">{svc.name}</div>
                        <div className="text-xs text-neutral-500 truncate font-mono">{image}</div>
                      </div>
                      <div className="text-xs text-neutral-600">{meta.label}</div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Tags */}
            {template.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {template.tags.map(tag => (
                  <span key={tag} className="px-2 py-1 text-xs rounded-md bg-white/5 border border-white/10 text-neutral-400">{tag}</span>
                ))}
              </div>
            )}

            {/* Related templates */}
            {related.length > 0 && (
              <section>
                <h2 className="text-xs font-medium text-neutral-500 mb-4 uppercase tracking-wider">More in {template.category}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {related.map(rel => (
                    <Link key={rel.slug} href={`/deploy/${rel.slug}`}
                      className="group block rounded-xl border border-white/8 bg-white/[0.02] p-4 hover:border-violet-500/30 hover:bg-violet-500/5 transition-all">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-white group-hover:text-violet-300 transition-colors">{rel.name}</span>
                        <span className="text-xs text-neutral-600">{rel.serviceCount} services</span>
                      </div>
                      <p className="text-xs text-neutral-500 line-clamp-2">{rel.description}</p>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right sidebar */}
          <aside className="space-y-4">
            {/* Deploy CTA */}
            <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-4">
              <Link href={deployUrl} className="block w-full">
                <Button className="w-full bg-violet-600 hover:bg-violet-500 text-white gap-2">
                  <Rocket className="w-4 h-4" /> Deploy Now
                </Button>
              </Link>
              <p className="text-xs text-neutral-500 text-center mt-2">Free trial · No credit card required</p>
            </div>

            {/* Stats */}
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500">Total deploys</span>
                <span className="text-sm font-medium text-white">{formatCount(template.deployCount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500">Active projects</span>
                <span className="text-sm font-medium text-white">{formatCount(activeProjects)}</span>
              </div>
              {recentProjects > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-500">Recent (30d)</span>
                  <span className="text-sm font-medium text-white">{formatCount(recentProjects)}</span>
                </div>
              )}
              {successRate !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-500">Success rate</span>
                  <span className={`text-sm font-medium ${successRate >= 90 ? 'text-emerald-400' : successRate >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {successRate}%
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500">Category</span>
                <Link href={`/templates?category=${encodeURIComponent(template.category)}`} className="text-sm text-violet-400 hover:text-violet-300 transition-colors">
                  {template.category}
                </Link>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500">Services</span>
                <span className="text-sm font-medium text-white">{template.services.length}</span>
              </div>
            </div>

            {/* Deploy embed */}
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
              <div className="text-xs text-neutral-500 mb-2 font-medium">Embed deploy button</div>
              <code className="block text-xs text-neutral-400 bg-black/30 rounded p-2 font-mono break-all leading-relaxed select-all">
                {`[![Deploy on AhuraSense](${siteConfig.url}/button.svg)](${siteConfig.url}/deploy/${template.slug})`}
              </code>
            </div>

            {/* Links */}
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 space-y-2">
              <Link href="/docs/templates" className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white transition-colors">
                <ExternalLink className="w-3 h-3" /> Template documentation
              </Link>
              <Link href="/dashboard/templates/new" className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white transition-colors">
                <Package className="w-3 h-3" /> Create your own template
              </Link>
            </div>
          </aside>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="border-t border-white/5 bg-gradient-to-r from-violet-950/50 to-indigo-950/50 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Ready to deploy {template.name}?</h2>
            <p className="text-neutral-400 text-sm">One click. All services provisioned. Up and running in minutes.</p>
          </div>
          <Link href={deployUrl}>
            <Button size="lg" className="bg-violet-600 hover:bg-violet-500 text-white gap-2 shrink-0">
              <Rocket className="w-5 h-5" /> Deploy {template.name}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
