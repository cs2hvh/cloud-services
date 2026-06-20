import { NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { validateTemplateSpec } from '@/lib/templates/domain/spec-schema';
import { resolveServiceLayers, inferDependenciesFromEnv } from '@/lib/templates/domain/dag';
import { planEnvironment } from '@/lib/templates/domain/env-plan';
import {
  evaluateTemplateBestPractices,
  getTemplateUpdatePolicy,
  splitPracticeIssues,
} from '@/lib/templates/domain/best-practices';

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: RouteCtx) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const db = await createServiceClient();

  const { data: template } = await db
    .from('templates')
    .select('id, latest_version_id, template_versions!templates_latest_version_fk(id, spec, status)')
    .eq('id', id)
    .eq('owner_id', auth.user!.id)
    .single();

  const version = Array.isArray(template?.template_versions)
    ? template?.template_versions[0]
    : template?.template_versions;

  if (!template || !version) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  if (version.status === 'published') {
    return NextResponse.json({ error: 'Published versions are immutable; create a draft before testing changes' }, { status: 409 });
  }

  const { data: run, error: runError } = await db
    .from('template_test_runs')
    .insert({
      template_id: template.id,
      template_version_id: version.id,
      user_id: auth.user!.id,
      status: 'running',
      service_count: Array.isArray((version.spec as { services?: unknown[] }).services)
        ? ((version.spec as { services: unknown[] }).services.length)
        : 0,
    })
    .select('id')
    .single();

  if (runError || !run) {
    return NextResponse.json({ error: runError?.message ?? 'Failed to create test run' }, { status: 500 });
  }

  await db.from('template_versions').update({
    status: 'testing',
    test_status: 'running',
    last_test_run_id: run.id,
  }).eq('id', version.id);

  const result = validateVersion(version.spec);
  const ok = result.errors.length === 0;
  const now = new Date().toISOString();

  await db.from('template_test_runs').update({
    status: ok ? 'succeeded' : 'failed',
    validation_errors: result.errors,
    validation_warnings: result.warnings,
    finished_at: now,
  }).eq('id', run.id);

  await db.from('template_versions').update({
    status: ok ? 'tested' : 'draft',
    test_status: ok ? 'passed' : 'failed',
    tested_at: ok ? now : null,
    update_policy: result.updatePolicy.policy,
    update_source: result.updatePolicy.source,
  }).eq('id', version.id);

  // Compute which deps would be auto-inferred at deploy time, so the creator
  // can add them explicitly (the warnings already flag individual env vars, but
  // this gives a concise "here's what to add to dependsOn" summary).
  const inferredDeps = ok ? computeInferredDeps(version.spec) : [];

  if (!ok) {
    return NextResponse.json({
      tested: false,
      runId: run.id,
      errors: result.errors,
      warnings: result.warnings,
    }, { status: 422 });
  }

  return NextResponse.json({
    tested: true,
    runId: run.id,
    warnings: result.warnings,
    updatePolicy: result.updatePolicy,
    ...(inferredDeps.length > 0 ? { inferredDeps } : {}),
  });
}

/**
 * Returns a list of { serviceId, added: string[] } entries describing which
 * `dependsOn` entries the deploy pipeline would auto-add from env var references.
 * Empty array means the spec's dependsOn is fully declared.
 */
function computeInferredDeps(spec: unknown): Array<{ serviceId: string; added: string[] }> {
  const validation = validateTemplateSpec(spec);
  if (!validation.valid) return [];
  const enriched = inferDependenciesFromEnv(validation.spec);
  const results: Array<{ serviceId: string; added: string[] }> = [];
  for (let i = 0; i < validation.spec.services.length; i++) {
    const original = validation.spec.services[i];
    const inferred = enriched.services[i];
    const added = inferred.dependsOn.filter(d => !original.dependsOn.includes(d));
    if (added.length > 0) results.push({ serviceId: original.id, added });
  }
  return results;
}

function validateVersion(spec: unknown) {
  const issues: Array<{ field: string; message: string }> = [];
  const validation = validateTemplateSpec(spec);
  if (!validation.valid) {
    return {
      errors: validation.errors,
      warnings: [],
      updatePolicy: { policy: 'none' as const, source: { repos: [] } },
    };
  }

  const dag = resolveServiceLayers(validation.spec.services);
  if (!dag.ok) issues.push({ field: 'services.dependsOn', message: dag.error });

  const envPlan = planEnvironment(validation.spec);
  issues.push(...envPlan.errors);

  const practiceIssues = evaluateTemplateBestPractices(validation.spec);
  const { errors, warnings } = splitPracticeIssues(practiceIssues);

  return {
    errors: [
      ...issues,
      ...errors.map(({ field, message }) => ({ field, message })),
    ],
    warnings,
    updatePolicy: getTemplateUpdatePolicy(validation.spec),
  };
}
