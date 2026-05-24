import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateUser } from '@/lib/auth/server-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { getServiceDefinition } from '@/lib/services/registry';
import { OperationEventService } from '@/lib/templates/services/operation-event-service';
import { enqueueProjectDeploy } from '@/lib/workers/project-deploy-worker';

type RouteCtx = { params: Promise<{ id: string }> };

const ConnectSchema = z.object({
  fromServiceId: z.string().uuid(),
  toServiceId: z.string().uuid(),
  templateId: z.string().min(1),
});

// ── GET — list connections for a project ─────────────────────────────────────

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const db = await createServiceClient();

  const { data: project } = await db
    .from('stacks')
    .select('id')
    .eq('id', id)
    .eq('user_id', auth.user!.id)
    .single();

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const { data: connections } = await db
    .from('service_connections')
    .select(`
      id, connection_type, status, created_env_keys, created_at,
      from_service:services!service_connections_from_service_id_fkey(id, name, engine),
      to_service:services!service_connections_to_service_id_fkey(id, name, engine)
    `)
    .eq('project_id', id)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });

  return NextResponse.json({ connections: connections ?? [] });
}

// ── POST — create a new connection ───────────────────────────────────────────

export async function POST(req: NextRequest, { params }: RouteCtx) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = ConnectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400 });
  }

  const { id } = await params;
  const { fromServiceId, toServiceId, templateId } = parsed.data;
  const db = await createServiceClient();

  // ── Ownership check + load project ───────────────────────────────────────

  const { data: project } = await db
    .from('stacks')
    .select('id, namespace, services(id, name, engine)')
    .eq('id', id)
    .eq('user_id', auth.user!.id)
    .single();

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const services = project.services as Array<{
    id: string;
    name: string;
    engine: string | null;
  }>;

  const fromSvc = services.find(s => s.id === fromServiceId);
  const toSvc = services.find(s => s.id === toServiceId);

  if (!fromSvc) return NextResponse.json({ error: 'From-service not found in project' }, { status: 404 });
  if (!toSvc) return NextResponse.json({ error: 'To-service not found in project' }, { status: 404 });

  // ── Validate template exists for the to-service engine ───────────────────

  const toEngine = toSvc.engine ?? 'generic';
  const def = getServiceDefinition(toEngine);
  const template = def.connectionTemplates.find(t => t.id === templateId);

  if (!template) {
    return NextResponse.json(
      { error: `Template "${templateId}" not found for engine "${toEngine}"` },
      { status: 400 },
    );
  }

  // ── Check for existing active connection ──────────────────────────────────

  const { data: existing } = await db
    .from('service_connections')
    .select('id')
    .eq('from_service_id', fromServiceId)
    .eq('to_service_id', toServiceId)
    .eq('connection_type', templateId)
    .in('status', ['pending', 'active', 'disconnecting'])
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'Connection already exists' }, { status: 409 });
  }

  // ── Insert pending service_connections row ────────────────────────────────

  const { data: connection, error: connErr } = await db
    .from('service_connections')
    .insert({
      project_id: id,
      from_service_id: fromServiceId,
      to_service_id: toServiceId,
      connection_type: templateId,
      status: 'pending',
      created_env_keys: template.vars.map(v => v.key),
    })
    .select('id')
    .single();

  if (connErr || !connection) {
    return NextResponse.json({ error: connErr?.message ?? 'Failed to create connection' }, { status: 500 });
  }

  const { data: operation, error: opErr } = await db
    .from('operations')
    .insert({
      project_id: id,
      service_id: fromServiceId,
      user_id: auth.user!.id,
      type: 'connect_service',
      status: 'queued',
      payload: { connectionId: connection.id },
      current_stage: 'queued',
      progress_pct: 0,
    })
    .select('id')
    .single();

  if (opErr || !operation) {
    await db.from('service_connections').delete().eq('id', connection.id);
    return NextResponse.json({ error: opErr?.message ?? 'Failed to queue connection operation' }, { status: 500 });
  }

  await OperationEventService.emit({
    operationId: operation.id,
    serviceId: fromServiceId,
    stage: 'queued',
    status: 'success',
    progressPct: 0,
    message: `Connection queued: ${fromSvc.name} -> ${toSvc.name}`,
  });

  await enqueueProjectDeploy({
    operationId: operation.id,
    projectId: id,
    namespace: project.namespace as string,
  });

  return NextResponse.json({
    connection: { id: connection.id, createdEnvKeys: template.vars.map(v => v.key) },
    operationId: operation.id,
  }, { status: 202 });
}
