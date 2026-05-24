import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { OperationEventService } from '@/lib/templates/services/operation-event-service';
import { enqueueProjectDeploy } from '@/lib/workers/project-deploy-worker';

type RouteCtx = { params: Promise<{ id: string; connId: string }> };

// ── DELETE — remove a connection and its injected env vars ───────────────────

export async function DELETE(_req: NextRequest, { params }: RouteCtx) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id, connId } = await params;
  const db = await createServiceClient();

  // ── Ownership + load connection ───────────────────────────────────────────

  const { data: project } = await db
    .from('stacks')
    .select('id, namespace')
    .eq('id', id)
    .eq('user_id', auth.user!.id)
    .single();

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const { data: connection } = await db
    .from('service_connections')
    .select('id, from_service_id, to_service_id, created_env_keys, status')
    .eq('id', connId)
    .eq('project_id', id)
    .single();

  if (!connection) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  if (connection.status === 'deleted') {
    return NextResponse.json({ error: 'Connection already deleted' }, { status: 410 });
  }

  // ── Load from-service name for operation event ────────────────────────────

  const { data: fromSvc } = await db
    .from('services')
    .select('id, name')
    .eq('id', connection.from_service_id)
    .single();

  if (!fromSvc) return NextResponse.json({ error: 'From-service not found' }, { status: 404 });

  await db
    .from('service_connections')
    .update({ status: 'disconnecting', updated_at: new Date().toISOString() })
    .eq('id', connId);

  const { data: operation, error } = await db
    .from('operations')
    .insert({
      project_id: id,
      service_id: connection.from_service_id,
      user_id: auth.user!.id,
      type: 'disconnect_service',
      status: 'queued',
      payload: { connectionId: connId },
      current_stage: 'queued',
      progress_pct: 0,
    })
    .select('id')
    .single();

  if (error || !operation) {
    await db.from('service_connections').update({ status: connection.status }).eq('id', connId);
    return NextResponse.json({ error: error?.message ?? 'Failed to queue disconnect operation' }, { status: 500 });
  }

  await OperationEventService.emit({
    operationId: operation.id,
    serviceId: connection.from_service_id,
    stage: 'queued',
    status: 'success',
    progressPct: 0,
    message: `Disconnect queued for ${fromSvc.name}`,
  });

  await enqueueProjectDeploy({
    operationId: operation.id,
    projectId: id,
    namespace: project.namespace as string,
  });

  return NextResponse.json({ queued: true, operationId: operation.id }, { status: 202 });
}
