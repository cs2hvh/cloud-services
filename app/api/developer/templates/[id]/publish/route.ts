import { NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { validateTemplateSpec } from '@/lib/templates/domain/spec-schema';
import { z } from 'zod';

type RouteCtx = { params: Promise<{ id: string }> };

const PublishTemplateSchema = z.object({
  demoProjectId: z.string().uuid().nullable().optional(),
  changelog: z.string().max(4000).optional(),
});

export async function POST(req: Request, { params }: RouteCtx) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = PublishTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid publish request', details: parsed.error.issues }, { status: 400 });
  }

  const db = await createServiceClient();

  const { data: template } = await db
    .from('templates')
    .select('id, visibility, latest_version_id, latest_published_version_id, template_versions!templates_latest_version_fk(id, spec, status, test_status)')
    .eq('id', id)
    .eq('owner_id', auth.user!.id)
    .single();

  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  const latestVersion = Array.isArray(template.template_versions)
    ? template.template_versions[0]
    : template.template_versions;

  if (!latestVersion) {
    return NextResponse.json({ error: 'Template has no version to publish' }, { status: 400 });
  }

  if (template.visibility === 'published') {
    await db.from('templates').update({ visibility: 'unlisted' }).eq('id', id);
    return NextResponse.json({ active: false, visibility: 'unlisted' });
  }

  if (parsed.data.demoProjectId) {
    const { data: demoProject } = await db
      .from('stacks')
      .select('id')
      .eq('id', parsed.data.demoProjectId)
      .eq('user_id', auth.user!.id)
      .maybeSingle();
    if (!demoProject) return NextResponse.json({ error: 'Demo project not found' }, { status: 404 });
  }

  const validation = validateTemplateSpec(latestVersion.spec);
  if (!validation.valid) {
    return NextResponse.json({ error: 'Template spec is invalid', details: validation.errors }, { status: 400 });
  }

  const { data: latestSuccessfulTest } = await db
    .from('template_test_runs')
    .select('id')
    .eq('template_version_id', latestVersion.id)
    .eq('status', 'succeeded')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestSuccessfulTest && latestVersion.test_status !== 'passed') {
    return NextResponse.json({ error: 'Run a successful template test before publishing this version' }, { status: 409 });
  }

  const now = new Date().toISOString();
  if (template.latest_published_version_id && template.latest_published_version_id !== latestVersion.id) {
    await db.from('template_versions').update({ status: 'deprecated' }).eq('id', template.latest_published_version_id);
  }
  const versionUpdate: Record<string, unknown> = {
    status: 'published',
    published_at: now,
  };
  if (parsed.data.changelog !== undefined) versionUpdate.changelog = parsed.data.changelog;
  await db.from('template_versions').update(versionUpdate).eq('id', latestVersion.id);

  const templateUpdate: Record<string, unknown> = {
    visibility: 'published',
    verification_status: template.latest_published_version_id ? 'unverified' : 'pending',
    latest_version_id: latestVersion.id,
    latest_published_version_id: latestVersion.id,
    published_at: now,
  };
  if (parsed.data.demoProjectId !== undefined) templateUpdate.demo_project_id = parsed.data.demoProjectId;

  const { error } = await db
    .from('templates')
    .update(templateUpdate)
    .eq('id', id)
    .eq('owner_id', auth.user!.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ active: true, visibility: 'published' });
}
