import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { OperationEventService } from '@/lib/templates/services/operation-event-service';
import { enqueueProjectDeploy } from '@/lib/workers/project-deploy-worker';

type RouteCtx = { params: Promise<{ id: string; name: string }> };

export async function POST(_req: NextRequest, { params }: RouteCtx) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id: projectId, name: serviceName } = await params;
  const db = await createServiceClient();

  // Verify ownership and get service info
  const { data: project } = await db
    .from('stacks')
    .select('id, namespace, services(id, name, spec_service_id, type)')
    .eq('id', projectId)
    .eq('user_id', auth.user!.id)
    .single();

  const services = project?.services as Array<{ id: string; name: string; spec_service_id: string; type: string }> | undefined;
  const service = services?.find(s => s.name === serviceName || s.spec_service_id === serviceName);

  if (!project || !service) {
    return NextResponse.json({ error: 'Service not found' }, { status: 404 });
  }

  const { data: operation, error } = await db
    .from('operations')
    .insert({
      project_id: projectId,
      service_id: service.id,
      user_id: auth.user!.id,
      type: 'restart',
      status: 'queued',
      current_stage: 'queued',
      progress_pct: 0,
    })
    .select('id')
    .single();

  if (error || !operation) {
    return NextResponse.json({ error: error?.message ?? 'Failed to queue restart operation' }, { status: 500 });
  }

  await OperationEventService.emit({
    operationId: operation.id,
    serviceId: service.id,
    stage: 'queued',
    status: 'success',
    progressPct: 0,
    message: `Restart queued for ${service.name}`,
  });

  await enqueueProjectDeploy({
    operationId: operation.id,
    projectId,
    namespace: project.namespace as string,
  });

  return NextResponse.json({ queued: true, operationId: operation.id }, { status: 202 });
}
