import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { TemplateSpecSchema, validateTemplateSpec } from '@/lib/templates/domain/spec-schema';
import { buildTemplateShareLinks, requestBaseUrl } from '@/lib/templates/domain/share';
import { z } from 'zod';

const TEMPLATE_CATEGORIES = ['AI/ML', 'Analytics', 'Automation', 'Blogs', 'Bots', 'CMS', 'Observability', 'Other', 'Starters', 'Storage'] as const;

const CreateTemplateSchema = z.object({
  slug: z.string().min(2).max(64).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'slug must be lowercase letters, numbers, hyphens'),
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(400),
  readme: z.string().max(20000).default(''),
  category: z.enum(TEMPLATE_CATEGORIES).default('Other'),
  tags: z.array(z.string()).default([]),
  spec: TemplateSpecSchema,
});

export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const db = await createServiceClient();
  const { data, error } = await db
    .from('templates')
    .select(`
      id, slug, name, description, tags, visibility, verification_status, demo_project_id, created_at, updated_at,
      template_versions!template_id(id, version, status, test_status, spec, created_at)
    `)
    .eq('owner_id', auth.user!.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const baseUrl = requestBaseUrl(req);
  return NextResponse.json({
    templates: (data ?? []).map(template => ({
      ...template,
      active: template.visibility === 'published',
      schema: latestSpec(template.template_versions),
      versionStatus: latestVersionStatus(template.template_versions),
      share: buildTemplateShareLinks(baseUrl, template.slug),
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = CreateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid template', details: parsed.error.issues }, { status: 400 });
  }

  const validation = validateTemplateSpec(parsed.data.spec);
  if (!validation.valid) {
    return NextResponse.json({ error: 'Invalid template spec', details: validation.errors }, { status: 400 });
  }

  const db = await createServiceClient();
  const { data: template, error: templateError } = await db
    .from('templates')
    .insert({
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: parsed.data.description,
      readme: parsed.data.readme,
      category: parsed.data.category,
      tags: parsed.data.tags,
      visibility: 'unlisted',
      owner_id: auth.user!.id,
    })
    .select('id, slug')
    .single();

  if (templateError || !template) {
    const msg = templateError?.code === '23505'
      ? `Slug "${parsed.data.slug}" is already taken`
      : templateError?.message ?? 'Failed to create template';
    return NextResponse.json({ error: msg }, { status: templateError?.code === '23505' ? 409 : 500 });
  }

  const { data: version, error: versionError } = await db
    .from('template_versions')
    .insert({
      template_id: template.id,
      version: 1,
      schema_version: 1,
      status: 'draft',
      spec: validation.spec,
      created_by: auth.user!.id,
    })
    .select('id')
    .single();

  if (versionError || !version) {
    await db.from('templates').delete().eq('id', template.id).eq('owner_id', auth.user!.id);
    return NextResponse.json({ error: versionError?.message ?? 'Failed to create template version' }, { status: 500 });
  }

  const { error: latestError } = await db.from('templates').update({ latest_version_id: version.id }).eq('id', template.id);
  if (latestError) {
    await db.from('templates').delete().eq('id', template.id).eq('owner_id', auth.user!.id);
    return NextResponse.json({ error: latestError.message }, { status: 500 });
  }

  return NextResponse.json({ id: template.id, slug: template.slug, versionId: version.id }, { status: 201 });
}

function latestSpec(versions: unknown) {
  const list = Array.isArray(versions) ? versions : [];
  const latest = list
    .filter((version): version is { version: number; spec: unknown } => typeof version === 'object' && version !== null && 'version' in version)
    .sort((a, b) => b.version - a.version)[0];
  return latest?.spec ?? { services: [] };
}

function latestVersionStatus(versions: unknown): { status: string; testStatus: string | null; hasPassedTest: boolean } {
  const list = Array.isArray(versions) ? versions : [];
  const latest = list
    .filter((v): v is { version: number; status: string; test_status: string | null } =>
      typeof v === 'object' && v !== null && 'version' in v && 'status' in v
    )
    .sort((a, b) => b.version - a.version)[0];
  if (!latest) return { status: 'draft', testStatus: null, hasPassedTest: false };
  return {
    status: latest.status,
    testStatus: latest.test_status,
    hasPassedTest: latest.test_status === 'passed' || latest.status === 'published',
  };
}
