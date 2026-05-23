import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const db = await createServiceClient();
    const { data } = await db
      .from('templates')
      .select(`
        slug, name, description, tags, visibility, verification_status, demo_project_id, latest_version_id, latest_published_version_id,
        template_versions!template_id(id, version, spec, status, update_policy, update_source)
      `)
      .eq('slug', slug)
      .in('visibility', ['published', 'unlisted'])
      .single();

    const version = selectDeployableVersion(data);

    if (!data || !version) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const spec = version.spec as {
      kind?: 'single' | 'multi';
      inputs?: Record<string, {
        label: string;
        description?: string;
        required?: boolean;
        defaultValue?: string;
        secret?: boolean;
      }>;
      services?: Array<{
        id?: string;
        name: string;
        type: string;
        engine?: string;
        source?: { kind?: string; image?: string; repoUrl?: string };
        volumes?: unknown[];
      }>;
    };
    return NextResponse.json({
      template: {
        slug: data.slug,
        name: data.name,
        description: data.description,
        tags: data.tags ?? [],
        kind: spec.kind ?? ((spec.services?.length ?? 0) > 1 ? 'multi' : 'single'),
        inputs: spec.inputs ?? {},
        services: (spec.services ?? []).map(service => ({
          ...service,
          image: service.source?.kind === 'image' ? service.source.image ?? '' : service.source?.repoUrl ?? '',
        })),
        demoProjectId: data.demo_project_id,
        verificationStatus: data.verification_status,
      },
      version: {
        id: version.id,
        version: version.version,
        updatePolicy: version.update_policy ?? 'none',
        updateSource: version.update_source ?? {},
      },
    });
  } catch {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
}

function selectDeployableVersion(data: {
  visibility: string;
  latest_version_id: string | null;
  latest_published_version_id: string | null;
  demo_project_id: string | null;
  template_versions: Array<{
    id: string;
    version: number;
    spec: unknown;
    status: string;
    update_policy?: string;
    update_source?: unknown;
  }> | null;
} | null) {
  const versions = Array.isArray(data?.template_versions) ? data.template_versions : [];
  if (!data) return null;

  if (data.visibility === 'published') {
    return versions.find(version =>
      version.id === data.latest_published_version_id && version.status === 'published'
    ) ?? null;
  }

  if (data.visibility === 'unlisted') {
    return versions.find(version =>
      version.id === data.latest_version_id && ['draft', 'tested', 'published'].includes(version.status)
    ) ?? null;
  }

  return null;
}
