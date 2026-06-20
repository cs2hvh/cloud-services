import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Database, Zap, Globe, Layers, Leaf, BarChart3, Package,
  CheckCircle2, Rocket, Search,
} from 'lucide-react';
import { getPublishedTemplates, type MarketplaceTemplateSummary } from '@/lib/templates/queries/marketplace';
import { siteConfig } from '@/config/site';

export const metadata: Metadata = {
  title: `Templates — ${siteConfig.name}`,
  description: 'One-click deploy templates for databases, web apps, AI tools, and more. Deploy the full stack in seconds.',
  alternates: { canonical: `${siteConfig.url}/templates` },
};

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_CATEGORIES = ['All', 'AI/ML', 'Analytics', 'Automation', 'Blogs', 'Bots', 'CMS', 'Observability', 'Other', 'Starters', 'Storage'] as const;
type Category = (typeof ALL_CATEGORIES)[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

const ENGINE_META: Record<string, { iconName: string; textColor: string; bgColor: string; borderColor: string }> = {
  postgres:   { iconName: 'Database', textColor: 'text-indigo-300', bgColor: 'bg-indigo-500/15', borderColor: 'border-indigo-500/25' },
  mysql:      { iconName: 'Database', textColor: 'text-orange-300', bgColor: 'bg-orange-500/15', borderColor: 'border-orange-500/25' },
  mongodb:    { iconName: 'Leaf',     textColor: 'text-green-300',  bgColor: 'bg-green-500/15',  borderColor: 'border-green-500/25'  },
  clickhouse: { iconName: 'BarChart3',textColor: 'text-yellow-300', bgColor: 'bg-yellow-500/15', borderColor: 'border-yellow-500/25' },
  redis:      { iconName: 'Zap',      textColor: 'text-red-300',    bgColor: 'bg-red-500/15',    borderColor: 'border-red-500/25'    },
  valkey:     { iconName: 'Zap',      textColor: 'text-emerald-300',bgColor: 'bg-emerald-500/15',borderColor: 'border-emerald-500/25'},
  rabbitmq:   { iconName: 'Layers',   textColor: 'text-amber-300',  bgColor: 'bg-amber-500/15',  borderColor: 'border-amber-500/25'  },
  generic:    { iconName: 'Globe',    textColor: 'text-blue-300',   bgColor: 'bg-blue-500/15',   borderColor: 'border-blue-500/25'   },
};

function engineMeta(engine?: string) {
  return ENGINE_META[engine ?? 'generic'] ?? ENGINE_META['generic'];
}

function SmallIcon({ iconName, className }: { iconName: string; className?: string }) {
  const cls = className ?? 'w-3.5 h-3.5';
  if (iconName === 'Database') return <Database className={cls} />;
  if (iconName === 'Zap')      return <Zap className={cls} />;
  if (iconName === 'Leaf')     return <Leaf className={cls} />;
  if (iconName === 'BarChart3') return <BarChart3 className={cls} />;
  if (iconName === 'Layers')   return <Layers className={cls} />;
  return <Globe className={cls} />;
}

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Template Card ─────────────────────────────────────────────────────────────

function TemplateCard({ template }: { template: MarketplaceTemplateSummary }) {
  const topServices = template.services.slice(0, 4);

  return (
    <Link
      href={`/deploy/${template.slug}`}
      className="group flex flex-col rounded-xl border border-white/8 bg-white/[0.02] hover:border-violet-500/30 hover:bg-violet-500/[0.04] transition-all p-5 gap-4"
    >
      <div className="flex items-start gap-3">
        {template.iconUrl ? (
          <img src={template.iconUrl} alt={template.name} className="w-10 h-10 rounded-lg border border-white/10 object-cover shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-600/20 border border-violet-500/25 flex items-center justify-center shrink-0">
            <Package className="w-4 h-4 text-violet-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white group-hover:text-violet-300 transition-colors truncate">{template.name}</span>
            {template.verificationStatus === 'verified' && (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
          </div>
          <span className="text-xs text-neutral-500">{template.category}</span>
        </div>
      </div>

      <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed flex-1">{template.description}</p>

      {topServices.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {topServices.map((svc, i) => {
            const m = engineMeta(svc.engine);
            return (
              <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs ${m.bgColor} ${m.borderColor} ${m.textColor}`}>
                <SmallIcon iconName={m.iconName} className="w-3 h-3" />
                {svc.name}
              </span>
            );
          })}
          {template.services.length > 4 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-xs text-neutral-500">
              +{template.services.length - 4} more
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-600">
          {template.deployCount > 0 ? `${formatCount(template.deployCount)} deploys` : 'New'}
        </span>
        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
          template.kind === 'multi'
            ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
            : 'bg-white/5 text-neutral-500 border border-white/10'
        }`}>
          {template.serviceCount} {template.serviceCount === 1 ? 'service' : 'services'}
        </span>
      </div>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { category: rawCategory, q: searchQuery } = await searchParams;

  const activeCategory: Category = (ALL_CATEGORIES as readonly string[]).includes(rawCategory ?? '')
    ? (rawCategory as Category)
    : 'All';

  const allTemplates = await getPublishedTemplates();

  const filtered = allTemplates.filter(t => {
    const matchCat = activeCategory === 'All' || t.category === activeCategory;
    const matchQ   = !searchQuery || [t.name, t.description, ...(t.tags ?? [])].some(
      s => s?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return matchCat && matchQ;
  });

  const counts = Object.fromEntries(
    ALL_CATEGORIES.map(cat => [
      cat,
      cat === 'All' ? allTemplates.length : allTemplates.filter(t => t.category === cat).length,
    ])
  );

  return (
    <div className="min-h-screen bg-neutral-950">
      {/* Hero */}
      <div className="border-b border-white/5 bg-gradient-to-b from-violet-950/20 to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs mb-4">
            <Rocket className="w-3 h-3" />
            {allTemplates.length} ready-to-deploy templates
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Deploy in Seconds</h1>
          <p className="text-neutral-400 text-lg max-w-2xl mx-auto mb-8">
            One-click deploy templates for full-stack apps, AI tools, databases, and more. Services wired up automatically.
          </p>

          {/* Search bar */}
          <form className="max-w-md mx-auto relative" method="GET">
            {activeCategory !== 'All' && (
              <input type="hidden" name="category" value={activeCategory} />
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input
                name="q"
                defaultValue={searchQuery}
                placeholder="Search templates…"
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 focus:border-violet-500/50"
              />
            </div>
          </form>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Category pills — mobile */}
        <div className="flex gap-2 overflow-x-auto pb-4 lg:hidden scrollbar-none">
          {ALL_CATEGORIES.map(cat => (
            <Link
              key={cat}
              href={`/templates?${cat === 'All' ? '' : `category=${encodeURIComponent(cat)}`}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ''}`}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-violet-600 text-white'
                  : 'bg-white/5 border border-white/10 text-neutral-400 hover:text-white hover:border-white/20'
              }`}
            >
              {cat}
              {counts[cat] > 0 && (
                <span className={`ml-1.5 text-[10px] ${activeCategory === cat ? 'text-violet-200' : 'text-neutral-600'}`}>
                  {counts[cat]}
                </span>
              )}
            </Link>
          ))}
        </div>

        <div className="flex gap-8">
          {/* Sidebar — desktop */}
          <aside className="hidden lg:block w-44 shrink-0">
            <div className="sticky top-24 space-y-0.5">
              {ALL_CATEGORIES.map(cat => (
                <Link
                  key={cat}
                  href={`/templates?${cat === 'All' ? '' : `category=${encodeURIComponent(cat)}`}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ''}`}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    activeCategory === cat
                      ? 'bg-violet-600/15 text-violet-300 font-medium'
                      : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'
                  }`}
                >
                  {cat}
                  {counts[cat] > 0 && (
                    <span className={`text-xs ${activeCategory === cat ? 'text-violet-400' : 'text-neutral-700'}`}>
                      {counts[cat]}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </aside>

          {/* Grid */}
          <div className="flex-1 min-w-0">
            {filtered.length === 0 ? (
              <div className="text-center py-20">
                <Package className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
                <p className="text-neutral-400 text-sm">No templates found{searchQuery ? ` for "${searchQuery}"` : ''}.</p>
                <Link href="/templates" className="text-violet-400 hover:text-violet-300 text-sm mt-2 inline-block">Clear filters</Link>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs text-neutral-500">
                    {filtered.length} template{filtered.length !== 1 ? 's' : ''}
                    {activeCategory !== 'All' ? ` in ${activeCategory}` : ''}
                    {searchQuery ? ` matching "${searchQuery}"` : ''}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filtered.map(t => <TemplateCard key={t.slug} template={t} />)}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Create CTA */}
      <div className="border-t border-white/5 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Have something to share?</h2>
            <p className="text-neutral-400 text-sm">Create a template and let others deploy your stack in one click.</p>
          </div>
          <Link href="/dashboard/templates/new"
            className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors">
            <Package className="w-4 h-4" /> Create Template
          </Link>
        </div>
      </div>
    </div>
  );
}
