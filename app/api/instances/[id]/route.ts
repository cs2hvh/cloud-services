import { NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { OperationEventService } from '@/lib/templates/services/operation-event-service';
import { enqueueProjectDeploy } from '@/lib/workers/project-deploy-worker';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const db = await createServiceClient();

  const { data, error } = await db
    .from('projects')
    .select(`
      id, name, namespace, status, created_at, ready_at, template_id, template_version_id, desired_spec,
      services (
        id, spec_service_id, name, type, engine, status, source, runtime, networking, health, dependencies
      ),
      operations ( id, type, status, progress_pct, started_at, finished_at, created_at )
    `)
    .eq('id', id)
    .eq('user_id', auth.user!.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
  }

  return NextResponse.json({
    deployment: data,
    instance: deploymentToLegacyInstance(data),
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const db = await createServiceClient();

  const { data: deployment } = await db
    .from('projects')
    .select('id, user_id, namespace')
    .eq('id', id)
    .eq('user_id', auth.user!.id)
    .single();

  if (!deployment) {
    return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
  }

  const { data: operation, error } = await db
    .from('operations')
    .insert({
      project_id: id,
      user_id: auth.user!.id,
      type: 'delete_project',
      status: 'queued',
      current_stage: 'queued',
      progress_pct: 0,
    })
    .select('id')
    .single();

  if (error || !operation) {
    return NextResponse.json({ error: error?.message ?? 'Failed to queue delete operation' }, { status: 500 });
  }

  await OperationEventService.emit({
    operationId: operation.id,
    stage: 'queued',
    status: 'success',
    progressPct: 0,
    message: 'Project delete operation queued',
  });

  await enqueueProjectDeploy({
    operationId: operation.id,
    projectId: id,
    namespace: deployment.namespace,
  });
  await db.from('projects').update({ status: 'deleting' }).eq('id', id);

  return NextResponse.json({ deleted: false, queued: true, operationId: operation.id }, { status: 202 });
}

function deploymentToLegacyInstance(deployment: {
  id: string;
  name: string;
  namespace: string;
  status: string;
  created_at: string;
  ready_at: string | null;
  template_id?: string | null;
  template_version_id?: string | null;
  desired_spec?: unknown;
  services?: Array<{
    id: string;
    spec_service_id: string;
    name: string;
    type: string;
    engine: string | null;
    status: string;
    source: { image?: string; kind?: string } | null;
    runtime: { volumes?: unknown[]; ports?: unknown[]; scaling?: unknown } | null;
    networking: { privateHost?: string; publicUrl?: string; publicPorts?: unknown[] } | null;
    health: unknown;
    dependencies: string[];
  }>;
  operations?: unknown[];
}) {
  return {
    id: deployment.id,
    project_name: deployment.name,
    namespace: deployment.namespace,
    status: deployment.status,
    created_at: deployment.created_at,
    ready_at: deployment.ready_at,
    template_slug: deployment.template_id ?? null,
    desired_spec: deployment.desired_spec,
    template_instance_services: (deployment.services ?? []).map(service => ({
      id: service.id,
      service_name: service.name,
      service_type: service.type,
      engine:       service.engine ?? 'generic',
      status: legacyServiceStatus(service.status),
      public_domain: service.networking?.publicUrl ?? null,
      private_domain: service.networking?.privateHost ?? null,
      image: service.source?.kind === 'image' ? service.source.image ?? '' : '',
      env_vars: {},
      volumes: service.runtime?.volumes ?? [],
      ports: service.runtime?.ports ?? [],
      config: {
        healthCheck: service.health,
        scaling: service.runtime?.scaling ?? null,
        dependsOn: service.dependencies,
      },
    })),
    deployment_runs: deployment.operations ?? [],
  };
}

function legacyServiceStatus(status: string) {
  if (status === 'starting') return 'deploying';
  if (status === 'degraded') return 'failed';
  return status;
}
