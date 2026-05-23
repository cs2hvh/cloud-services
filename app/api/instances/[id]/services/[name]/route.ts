import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { OperationEventService } from '@/lib/templates/services/operation-event-service';
import { enqueueProjectDeploy } from '@/lib/workers/project-deploy-worker';
import { z } from 'zod';

type RouteCtx = { params: Promise<{ id: string; name: string }> };

const UpdateServiceSchema = z.object({
  env: z.record(z.string()).optional(),
  image: z.string().min(1).optional(),
}).refine(value => value.env !== undefined || value.image !== undefined, {
  message: 'No service update was provided',
});

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id, name } = await params;
  const db = await createServiceClient();

  const { data: deployment } = await db
    .from('projects')
    .select('id, services(id, spec_service_id, name, type, engine, status, source, runtime, networking, health, dependencies)')
    .eq('id', id)
    .eq('user_id', auth.user!.id)
    .single();

  if (!deployment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const service = (deployment.services as Array<{
    id: string;
    spec_service_id: string;
    name: string;
    type: string;
    engine: string | null;
    status: string;
    source: { kind?: string; image?: string } | null;
    runtime: unknown;
    networking: { publicUrl?: string; privateHost?: string } | null;
    health: unknown;
    dependencies: string[];
  }>).find(item => item.name === name || item.spec_service_id === name);

  if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 });
  // Only return literal-typed vars — returning service_ref/computed as '' would let
  // a save overwrite those managed references with empty strings.
  const { data: envRows } = await db
    .from('service_env_vars')
    .select('key, value, managed_by')
    .eq('service_id', service.id)
    .eq('value_type', 'literal')
    .order('key');

  const envVars = Object.fromEntries(
    (envRows ?? []).filter(row => row.managed_by !== 'connection' && row.managed_by !== 'system').map(row => {
      const val = row.value as { value?: string } | null;
      return [row.key, typeof val?.value === 'string' ? val.value : ''];
    })
  );

  return NextResponse.json({
    service: {
      id: service.id,
      service_name: service.name,
      service_type: service.type,
      engine:       service.engine ?? 'generic',
      status: service.status,
      image: service.source?.kind === 'image' ? service.source.image ?? '' : '',
      env_vars: envVars,
      public_domain: service.networking?.publicUrl ?? null,
      private_domain: service.networking?.privateHost ?? null,
      runtime: service.runtime,
      health: service.health,
      dependencies: service.dependencies,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = UpdateServiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid service update', details: parsed.error.issues }, { status: 400 });
  }

  const { id, name } = await params;
  const db = await createServiceClient();
  const { data: project } = await db
    .from('projects')
    .select('id, namespace, services(id, name, spec_service_id, source)')
    .eq('id', id)
    .eq('user_id', auth.user!.id)
    .single();

  const service = (project?.services as Array<{ id: string; name: string; spec_service_id: string; source: { kind?: string } | null }> | undefined)
    ?.find(item => item.name === name || item.spec_service_id === name);

  if (!project || !service) return NextResponse.json({ error: 'Service not found' }, { status: 404 });
  if (parsed.data.image && service.source?.kind !== 'image') {
    return NextResponse.json({ error: 'Image updates are only supported for Docker image services' }, { status: 400 });
  }
  if (parsed.data.env && Object.keys(parsed.data.env).length > 0) {
    const { data: managedRows } = await db
      .from('service_env_vars')
      .select('key, managed_by, value_type')
      .eq('service_id', service.id)
      .in('key', Object.keys(parsed.data.env));
    const blocked = (managedRows ?? []).filter(row =>
      row.managed_by === 'connection' ||
      row.managed_by === 'system' ||
      row.value_type === 'generated_secret' ||
      row.value_type === 'secret_ref' ||
      row.value_type === 'connection_ref'
    );
    if (blocked.length > 0) {
      return NextResponse.json(
        { error: `These variables are managed and cannot be edited here: ${blocked.map(row => row.key).join(', ')}` },
        { status: 400 },
      );
    }
  }

  const { data: operation, error } = await db
    .from('operations')
    .insert({
      project_id: id,
      service_id: service.id,
      user_id: auth.user!.id,
      type: 'update_service',
      status: 'queued',
      current_stage: 'queued',
      progress_pct: 0,
      payload: parsed.data,
    })
    .select('id')
    .single();

  if (error || !operation) {
    return NextResponse.json({ error: error?.message ?? 'Failed to queue service update' }, { status: 500 });
  }

  await OperationEventService.emit({
    operationId: operation.id,
    serviceId: service.id,
    stage: 'queued',
    status: 'success',
    progressPct: 0,
    message: `Update queued for ${service.name}`,
  });

  await enqueueProjectDeploy({
    operationId: operation.id,
    projectId: id,
    namespace: project.namespace as string,
  });

  return NextResponse.json({ queued: true, operationId: operation.id }, { status: 202 });
}
