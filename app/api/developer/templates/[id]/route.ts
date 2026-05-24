import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { TemplateSpecSchema, validateTemplateSpec, type TemplateSpec } from '@/lib/templates/domain/spec-schema';
import { buildTemplateShareLinks, requestBaseUrl } from '@/lib/templates/domain/share';
import { z } from 'zod';

type RouteCtx = { params: Promise<{ id: string }> };

const UpdateTemplateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().min(1).max(400).optional(),
  tags: z.array(z.string()).optional(),
  demoProjectId: z.string().uuid().nullable().optional(),
  spec: TemplateSpecSchema.optional(),
});

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const db = await createServiceClient();

  const { data, error } = await db
      .from('templates')
      .select(`
      id, slug, name, description, tags, visibility, verification_status, demo_project_id, created_at, updated_at,
      template_versions!template_id(id, version, status, spec, created_at)
    `)
    .eq('id', id)
    .eq('owner_id', auth.user!.id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  const spec = latestSpec(data.template_versions);
  return NextResponse.json({
    template: {
      ...data,
      active: data.visibility === 'published',
      kind: spec.kind ?? 'single',
      schema: spec,
      share: buildTemplateShareLinks(requestBaseUrl(_req), data.slug),
    },
  });
}

export async function PUT(req: NextRequest, { params }: RouteCtx) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid update', details: parsed.error.issues }, { status: 400 });
  }

  const db = await createServiceClient();
  const { data: existing } = await db
    .from('templates')
    .select('id, slug, name, description, tags, visibility, latest_version_id, latest_published_version_id, template_versions!template_id(id, version, status, spec)')
    .eq('id', id)
    .eq('owner_id', auth.user!.id)
    .single();

  if (!existing) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  const previousSpec = latestSpec(existing.template_versions);
  const validation = validateTemplateSpec(parsed.data.spec ?? previousSpec);
  if (!validation.valid) {
    return NextResponse.json({ error: 'Invalid template spec', details: validation.errors }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.tags !== undefined) updates.tags = parsed.data.tags;
  if (parsed.data.demoProjectId !== undefined) {
    if (parsed.data.demoProjectId !== null) {
      const { data: demoProject } = await db
        .from('stacks')
        .select('id')
        .eq('id', parsed.data.demoProjectId)
        .eq('user_id', auth.user!.id)
        .maybeSingle();
      if (!demoProject) return NextResponse.json({ error: 'Demo project not found' }, { status: 404 });
    }
    updates.demo_project_id = parsed.data.demoProjectId;
  }
  if (Object.keys(updates).length > 0) {
    const { error } = await db.from('templates').update(updates).eq('id', id).eq('owner_id', auth.user!.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const versions = Array.isArray(existing.template_versions) ? existing.template_versions : [];
  const latestDraft = versions
    .filter((version: { status: string }) => version.status === 'draft')
    .sort((a: { version: number }, b: { version: number }) => b.version - a.version)[0];

  if (latestDraft && existing.latest_version_id === latestDraft.id) {
    const { error } = await db.from('template_versions').update({ spec: validation.spec }).eq('id', latestDraft.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { error: latestError } = await db.from('templates').update({ latest_version_id: latestDraft.id }).eq('id', id);
    if (latestError) return NextResponse.json({ error: latestError.message }, { status: 500 });
  } else {
    const nextVersion = Math.max(0, ...versions.map((version: { version: number }) => version.version)) + 1;
    const { data: version, error } = await db
      .from('template_versions')
      .insert({
        template_id: id,
        version: nextVersion,
        schema_version: 1,
        status: 'draft',
        spec: validation.spec,
        created_by: auth.user!.id,
      })
      .select('id')
      .single();
    if (error || !version) return NextResponse.json({ error: error?.message ?? 'Failed to create draft version' }, { status: 500 });
    const { error: latestError } = await db.from('templates').update({ latest_version_id: version.id }).eq('id', id);
    if (latestError) {
      await db.from('template_versions').delete().eq('id', version.id);
      return NextResponse.json({ error: latestError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ updated: true });
}

export async function DELETE(_req: NextRequest, { params }: RouteCtx) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const db = await createServiceClient();
  const { error } = await db.from('templates').delete().eq('id', id).eq('owner_id', auth.user!.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}

function latestSpec(versions: unknown): TemplateSpec {
  const list = Array.isArray(versions) ? versions : [];
  const latest = list
    .filter((version): version is { version: number; spec: TemplateSpec } =>
      typeof version === 'object' && version !== null && 'version' in version && 'spec' in version
    )
    .sort((a, b) => b.version - a.version)[0];
  return latest?.spec ?? { schemaVersion: 1, kind: 'single', services: [] };
}
