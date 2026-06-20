import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const db = await createServiceClient();
    const { data, error } = await db
      .from('templates')
      .select(`
        id, slug, name, description, tags, category, visibility, verification_status, deploy_count, icon_url, demo_project_id, owner_id,
        template_versions!templates_latest_published_version_fk(id, spec, status)
      `)
      .eq('visibility', 'published');

    if (error) throw error;

    const templates = (data ?? []).map(template => {
      const version = Array.isArray(template.template_versions)
        ? template.template_versions[0]
        : template.template_versions;
      const spec = version?.spec as { kind?: string; services?: Array<{ name: string; type: string; engine?: string; source?: { kind?: string; image?: string } }> } | undefined;
      const services = spec?.services ?? [];

      return {
        slug: template.slug,
        name: template.name,
        description: template.description,
        tags: template.tags ?? [],
        category: (template as { category?: string }).category ?? 'Other',
        kind: spec?.kind ?? (services.length > 1 ? 'multi' : 'single'),
        serviceCount: services.length,
        services: services.map(service => ({
          name: service.name,
          type: service.type,
          engine: service.engine,
          image: service.source?.kind === 'image' ? service.source.image ?? '' : '',
          source: service.source,
        })),
        verified: template.verification_status === 'verified',
        verificationStatus: template.verification_status,
        deployCount: template.deploy_count ?? 0,
        iconUrl: template.icon_url ?? null,
        demoProjectId: template.demo_project_id ?? null,
        creatorName: template.owner_id ? 'Community' : 'Platform',
        source: 'db' as const,
      };
    });

    return NextResponse.json({ templates });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load templates', templates: [] },
      { status: 500 }
    );
  }
}
