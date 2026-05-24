import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { AppsV1Api } from '@kubernetes/client-node';
import kubeConfig from '@/lib/kubernetes';
import { z } from 'zod';
import { OperationEventService } from '@/lib/templates/services/operation-event-service';
import { enqueueProjectDeploy } from '@/lib/workers/project-deploy-worker';

type RouteCtx = { params: Promise<{ id: string; name: string }> };

const ScaleSchema = z.object({
  replicas: z.number().int().min(1).max(20),
});

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id, name } = await params;
  const db = await createServiceClient();

  const { data: project } = await db
    .from('stacks')
    .select('id, namespace, services(id, spec_service_id, name, runtime, health)')
    .eq('id', id)
    .eq('user_id', auth.user!.id)
    .single();

  const service = (project?.services as Array<{
    id: string;
    spec_service_id: string;
    name: string;
    runtime: { scaling?: { minReplicas?: number; maxReplicas?: number }; volumes?: unknown[] } | null;
    health: unknown;
  }> | undefined)?.find(s => s.name === name || s.spec_service_id === name);

  if (!project || !service) {
    return NextResponse.json({ error: 'Service not found' }, { status: 404 });
  }

  const scaling = service.runtime?.scaling ?? null;
  const namespace = project.namespace as string;
  const apps = kubeConfig.makeApiClient(AppsV1Api);
  let currentReplicas = 1;
  let readyReplicas = 0;
  let hasVolumes = false;

  // Try StatefulSet first; fall back to Deployment
  try {
    const ss = await apps.readNamespacedStatefulSet({ name: service.name, namespace });
    currentReplicas = ss.spec?.replicas ?? 1;
    readyReplicas = ss.status?.readyReplicas ?? 0;
    hasVolumes = true;
  } catch {
    try {
      const dep = await apps.readNamespacedDeployment({ name: service.name, namespace });
      currentReplicas = dep.spec?.replicas ?? 1;
      readyReplicas = dep.status?.readyReplicas ?? 0;
    } catch {
      // workload may not exist yet (pending/failed state)
    }
  }

  return NextResponse.json({
    scaling: {
      currentReplicas,
      readyReplicas,
      minReplicas: scaling?.minReplicas ?? 1,
      maxReplicas: scaling?.maxReplicas ?? 1,
      hasVolumes,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = ScaleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid scale request', details: parsed.error.issues }, { status: 400 });
  }

  const { id, name } = await params;
  const { replicas } = parsed.data;
  const db = await createServiceClient();

  const { data: project } = await db
    .from('stacks')
    .select('id, namespace, services(id, spec_service_id, name, runtime)')
    .eq('id', id)
    .eq('user_id', auth.user!.id)
    .single();

  const service = (project?.services as Array<{
    id: string;
    spec_service_id: string;
    name: string;
    runtime: { scaling?: { minReplicas?: number; maxReplicas?: number }; volumes?: unknown[] } | null;
  }> | undefined)?.find(s => s.name === name || s.spec_service_id === name);

  if (!project || !service) {
    return NextResponse.json({ error: 'Service not found' }, { status: 404 });
  }

  const hasVolumes = Array.isArray(service.runtime?.volumes) && service.runtime.volumes.length > 0;
  if (hasVolumes) {
    return NextResponse.json(
      { error: 'Scaling StatefulSet-backed services (with volumes) is not supported via this endpoint. Use the K8s API directly.' },
      { status: 400 },
    );
  }

  const { data: operation, error } = await db
    .from('operations')
    .insert({
      project_id: id,
      service_id: service.id,
      user_id: auth.user!.id,
      type: 'update_service',
      status: 'queued',
      payload: { scale: { replicas } },
      current_stage: 'queued',
      progress_pct: 0,
    })
    .select('id')
    .single();

  if (error || !operation) {
    return NextResponse.json({ error: error?.message ?? 'Failed to queue scale operation' }, { status: 500 });
  }

  await OperationEventService.emit({
    operationId: operation.id,
    serviceId: service.id,
    stage: 'queued',
    status: 'success',
    progressPct: 0,
    message: `Scale queued for ${service.name}`,
  });

  await enqueueProjectDeploy({
    operationId: operation.id,
    projectId: id,
    namespace: project.namespace as string,
  });

  return NextResponse.json({ queued: true, operationId: operation.id, replicas }, { status: 202 });
}
