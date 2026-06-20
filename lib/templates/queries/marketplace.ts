/**
 * Marketplace query functions — used by public API routes only.
 * These are the data-access layer for template discovery and detail pages.
 * Pages call API routes → API routes call these functions.
 */

import { createServiceClient } from '@/lib/supabase/server';

// ── Types ─────────────────────────────────────────────────────────────────────

export type MarketplaceService = {
  id?: string;
  name: string;
  type: string;
  engine?: string;
  image: string;
  source?: { kind?: string; image?: string; repoUrl?: string };
  volumes?: { name: string; mountPath: string; sizeGb: number }[];
  ports?: { internal: number; public?: boolean; protocol?: string; name?: string }[];
  dependsOn?: string[];
  healthCheck?: { type: string; port: number; path?: string };
  env?: Record<string, unknown>;
};

export type MarketplaceTemplateSummary = {
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  deployCount: number;
  iconUrl: string | null;
  verificationStatus: string;
  kind: string;
  serviceCount: number;
  services: Array<{ name: string; type: string; engine?: string; image: string }>;
};

export type MarketplaceTemplateDetail = {
  id: string;
  slug: string;
  name: string;
  description: string;
  readme: string;
  category: string;
  tags: string[];
  iconUrl: string | null;
  deployCount: number;
  ownerId: string | null;
  publishedAt: string | null;
  verificationStatus: string;
  services: MarketplaceService[];
  versionId: string | null;
  updatePolicy: string;
};

export type TemplateDeployStats = {
  activeProjects: number;
  recentProjects: number;
  successRate: number | null;
};

export type RelatedTemplate = {
  slug: string;
  name: string;
  description: string;
  serviceCount: number;
};

// ── Queries ───────────────────────────────────────────────────────────────────

/** All published templates for the public marketplace listing. */
export async function getPublishedTemplates(): Promise<MarketplaceTemplateSummary[]> {
  const db = await createServiceClient();
  const { data, error } = await db
    .from('templates')
    .select(`
      slug, name, description, category, tags, deploy_count, icon_url, verification_status,
      template_versions!templates_latest_published_version_fk(spec)
    `)
    .eq('visibility', 'published')
    .order('deploy_count', { ascending: false });

  if (error || !data) return [];

  return data.map(t => {
    const v = Array.isArray(t.template_versions) ? t.template_versions[0] : t.template_versions;
    const spec = v?.spec as { kind?: string; services?: MarketplaceService[] } | undefined;
    const services = spec?.services ?? [];
    const td = t as typeof t & { category?: string };

    return {
      slug: t.slug,
      name: t.name,
      description: t.description,
      category: td.category ?? 'Other',
      tags: t.tags ?? [],
      deployCount: t.deploy_count ?? 0,
      iconUrl: t.icon_url ?? null,
      verificationStatus: t.verification_status,
      kind: spec?.kind ?? (services.length > 1 ? 'multi' : 'single'),
      serviceCount: services.length,
      services: services.map(svc => ({
        name: svc.name,
        type: svc.type,
        engine: svc.engine,
        image: svc.source?.kind === 'image' ? svc.source.image ?? '' : svc.source?.repoUrl ?? '',
      })),
    };
  });
}

/** Full detail for a single published/unlisted template by slug. */
export async function getTemplateDetail(slug: string): Promise<MarketplaceTemplateDetail | null> {
  const db = await createServiceClient();
  const { data } = await db
    .from('templates')
    .select(`
      id, slug, name, description, readme, category, tags, icon_url, deploy_count,
      owner_id, published_at, verification_status,
      template_versions!templates_latest_published_version_fk(id, spec, update_policy)
    `)
    .eq('slug', slug)
    .eq('visibility', 'published')
    .single();

  if (!data) return null;

  const v = Array.isArray(data.template_versions) ? data.template_versions[0] : data.template_versions;
  const spec = v?.spec as { services?: MarketplaceService[] } | undefined;
  const d = data as typeof data & {
    readme?: string; category?: string;
    owner_id?: string | null; published_at?: string | null;
  };

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    description: data.description,
    readme: d.readme ?? '',
    category: d.category ?? 'Other',
    tags: data.tags ?? [],
    iconUrl: data.icon_url ?? null,
    deployCount: data.deploy_count ?? 0,
    ownerId: d.owner_id ?? null,
    publishedAt: d.published_at ?? null,
    verificationStatus: data.verification_status,
    services: spec?.services ?? [],
    versionId: v?.id ?? null,
    updatePolicy: (v as { update_policy?: string } | undefined)?.update_policy ?? 'none',
  };
}

/** Live deploy stats for a template derived from the stacks table — no cached counter. */
export async function getTemplateDeployStats(templateId: string): Promise<TemplateDeployStats> {
  const db = await createServiceClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [activeRes, recentRes, successRes, totalRes] = await Promise.all([
    db.from('stacks').select('*', { count: 'exact', head: true })
      .eq('template_id', templateId)
      .not('status', 'in', '(deleted,failed,deleting)'),
    db.from('stacks').select('*', { count: 'exact', head: true })
      .eq('template_id', templateId)
      .gte('created_at', thirtyDaysAgo)
      .not('status', 'in', '(deleted,deleting)'),
    db.from('stacks').select('*', { count: 'exact', head: true })
      .eq('template_id', templateId)
      .in('status', ['ready', 'deploying', 'degraded']),
    db.from('stacks').select('*', { count: 'exact', head: true })
      .eq('template_id', templateId),
  ]);

  const total = totalRes.count ?? 0;
  const success = successRes.count ?? 0;

  return {
    activeProjects: activeRes.count ?? 0,
    recentProjects: recentRes.count ?? 0,
    successRate: total > 0 ? Math.round((success / total) * 100) : null,
  };
}

/** Related templates in the same category (excludes the current slug). */
export async function getRelatedTemplates(category: string, excludeSlug: string): Promise<RelatedTemplate[]> {
  const db = await createServiceClient();
  const { data } = await db
    .from('templates')
    .select('slug, name, description, template_versions!templates_latest_published_version_fk(spec)')
    .eq('visibility', 'published')
    .eq('category', category)
    .neq('slug', excludeSlug)
    .limit(4);

  return (data ?? []).map(t => {
    const v = Array.isArray(t.template_versions) ? t.template_versions[0] : t.template_versions;
    const s = v?.spec as { services?: unknown[] } | undefined;
    return { slug: t.slug, name: t.name, description: t.description, serviceCount: s?.services?.length ?? 0 };
  });
}
