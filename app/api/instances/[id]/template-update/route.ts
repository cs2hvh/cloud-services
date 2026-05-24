import { NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { validateTemplateSpec, type TemplateSpec } from '@/lib/templates/domain/spec-schema';
import { enqueueProjectDeploy } from '@/lib/workers/project-deploy-worker';

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteCtx) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const db = await createServiceClient();

  const { data: project } = await db
    .from('stacks')
    .select('id, template_id, template_version_id')
    .eq('id', id)
    .eq('user_id', auth.user!.id)
    .single();

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  if (!project.template_id) return NextResponse.json({ hasUpdate: false, reason: 'no_template' });

  const { data: template } = await db
    .from('templates')
    .select('id, latest_published_version_id, template_versions!template_id(id, version, status, changelog, published_at)')
    .eq('id', project.template_id)
    .single();

  if (!template?.latest_published_version_id) {
    return NextResponse.json({ hasUpdate: false, reason: 'no_published_version' });
  }

  const hasUpdate = project.template_version_id !== template.latest_published_version_id;
  const versions = Array.isArray(template.template_versions) ? template.template_versions : [];
  const latestVersion = versions.find((v: { id: string; version: number; changelog?: string; published_at?: string }) => v.id === template.latest_published_version_id);
  const currentVersion = versions.find((v: { id: string; version: number }) => v.id === project.template_version_id);

  return NextResponse.json({
    hasUpdate,
    currentVersionId: project.template_version_id,
    currentVersion: (currentVersion as { version: number } | undefined)?.version ?? null,
    latestVersionId: template.latest_published_version_id,
    latestVersion: (latestVersion as { version: number } | undefined)?.version ?? null,
    changelog: (latestVersion as { changelog?: string } | undefined)?.changelog ?? null,
    publishedAt: (latestVersion as { published_at?: string } | undefined)?.published_at ?? null,
  });
}

export async function POST(_req: Request, { params }: RouteCtx) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const db = await createServiceClient();

  const { data: project } = await db
    .from('stacks')
    .select('id, status, template_id, template_version_id, desired_spec, namespace')
    .eq('id', id)
    .eq('user_id', auth.user!.id)
    .single();

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  if (!project.template_id) {
    return NextResponse.json({ error: 'Project was not deployed from a template' }, { status: 400 });
  }
  if (['creating', 'deploying'].includes(project.status)) {
    return NextResponse.json({ error: 'Project is already deploying; wait until it finishes' }, { status: 409 });
  }

  const { data: template } = await db
    .from('templates')
    .select('id, latest_published_version_id, template_versions!template_id(id, version, spec, status)')
    .eq('id', project.template_id)
    .single();

  if (!template?.latest_published_version_id) {
    return NextResponse.json({ error: 'No published template version available' }, { status: 400 });
  }
  if (project.template_version_id === template.latest_published_version_id) {
    return NextResponse.json({ error: 'Project is already on the latest template version' }, { status: 409 });
  }

  const versions = Array.isArray(template.template_versions) ? template.template_versions : [];
  const latestPublished = versions.find(
    (v: { id: string; status: string; spec: unknown }) => v.id === template.latest_published_version_id && v.status === 'published'
  ) as { id: string; spec: unknown } | undefined;

  if (!latestPublished) {
    return NextResponse.json({ error: 'Latest published template version not found' }, { status: 404 });
  }

  const validation = validateTemplateSpec(latestPublished.spec);
  if (!validation.valid) {
    return NextResponse.json({ error: 'New template version has invalid spec', details: validation.errors }, { status: 422 });
  }

  const mergedSpec = mergeSpecPreservingNames(validation.spec, project.desired_spec as TemplateSpec | null);

  const { error: projectUpdateError } = await db
    .from('stacks')
    .update({
      template_version_id: template.latest_published_version_id,
      desired_spec: mergedSpec,
      status: 'deploying',
    })
    .eq('id', id)
    .eq('user_id', auth.user!.id);

  if (projectUpdateError) {
    return NextResponse.json({ error: projectUpdateError.message }, { status: 500 });
  }

  const { data: operation, error: opError } = await db
    .from('operations')
    .insert({
      project_id: id,
      user_id: auth.user!.id,
      type: 'update_template',
      status: 'queued',
      current_stage: 'queued',
      progress_pct: 0,
    })
    .select('id')
    .single();

  if (opError || !operation) {
    // Best-effort rollback
    await db.from('stacks').update({
      status: project.status,
      template_version_id: project.template_version_id,
      desired_spec: project.desired_spec,
    }).eq('id', id);
    return NextResponse.json({ error: opError?.message ?? 'Failed to create operation' }, { status: 500 });
  }

  await enqueueProjectDeploy({ operationId: operation.id, projectId: id, namespace: project.namespace });

  return NextResponse.json({ operationId: operation.id, runId: operation.id }, { status: 202 });
}

// Preserves user's service name overrides and volume configs when applying a template update.
function mergeSpecPreservingNames(newSpec: TemplateSpec, currentSpec: TemplateSpec | null): TemplateSpec {
  if (!currentSpec?.services?.length) return newSpec;
  const byId = new Map(currentSpec.services.map(s => [s.id, s]));
  return {
    ...newSpec,
    services: newSpec.services.map(newSvc => {
      const current = byId.get(newSvc.id);
      if (!current) return newSvc;
      return {
        ...newSvc,
        name: current.name,
        volumes: current.volumes.length > 0 ? current.volumes : newSvc.volumes,
      };
    }),
  };
}
