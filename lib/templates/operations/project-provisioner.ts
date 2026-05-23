/**
 * Orchestrator: sequences multi-service template deployments and handles
 * all operation types (restart, update, connect, create_service, delete).
 *
 * K8s primitives for a single service live in service-runner.ts.
 * Pure env/manifest building lives in env-resolver.ts and k8s-manifest-builder.ts.
 */
import { CoreV1Api, AppsV1Api, NetworkingV1Api } from '@kubernetes/client-node';
import { Encryption, type EncryptedData } from '@/config/functions';
import kubeConfig from '@/lib/kubernetes';
import { createWorkerClient } from '@/lib/supabase/server';
import { getServiceDefinition } from '@/lib/services/registry';
import { OperationEventService } from '@/lib/templates/services/operation-event-service';
import { resolveServiceLayers } from '@/lib/templates/domain/dag';
import { parseTemplateSpec, type TemplateSpec } from '@/lib/templates/domain/spec-schema';
import { generateTemplateSecret } from '@/lib/templates/domain/secrets';
import { resolveAllEnvs } from './env-resolver';
import { resolveConnectionTemplate } from './connection-resolver';
import {
  buildSecret,
  buildK8sService,
  buildDeployment,
  buildStatefulSet,
  buildIngress,
} from './k8s-manifest-builder';
import {
  applyService,
  applyEnvUpdate,
  removeEnvKeys,
  rollingRestart,
  patchImage,
  scaleStatelessWorkload,
  type ServiceRunSpec,
  type K8sClients,
} from './service-runner';

export type ProvisionJobData = {
  operationId: string;
  projectId: string;
  namespace: string;
};

type ServiceRow = {
  id: string;
  spec_service_id: string | null;
  name: string;
};

type ServiceUpdatePayload = {
  env?: Record<string, string>;
  image?: string;
  scale?: { replicas: number };
  connectionId?: string;
};

const INGRESS_DOMAIN = process.env.INGRESS_DOMAIN ?? '';
const HEALTH_TIMEOUT_MS = parseInt(process.env.HEALTH_TIMEOUT_MS ?? '300000', 10);
const HEALTH_POLL_MS = 4000;

// ── Entry point ────────────────────────────────────────────────────────────

export async function provisionProject(data: ProvisionJobData): Promise<void> {
  const { operationId, projectId, namespace } = data;
  const startedAt = Date.now();

  const db = await createWorkerClient();
  const core = kubeConfig.makeApiClient(CoreV1Api);
  const apps = kubeConfig.makeApiClient(AppsV1Api);
  const networking = kubeConfig.makeApiClient(NetworkingV1Api);
  const k8s: K8sClients = { core, apps, networking };

  const emit = makeEmitter(operationId, db);
  let namespaceCreated = false;
  let operationType: string | null = null;

  try {
    const { data: operation } = await db
      .from('operations')
      .select('type, service_id, payload')
      .eq('id', operationId)
      .single();
    operationType = operation?.type ?? null;

    // ── Dispatch to per-operation handlers ─────────────────────────────────
    if (operation?.type === 'delete_project') {
      await handleDeleteProject({ operationId, projectId, namespace }, core, db, emit);
      return;
    }
    if (operation?.type === 'restart') {
      await handleRestart(data, operation.service_id as string | null, k8s, db, emit);
      return;
    }
    if (operation?.type === 'update_service') {
      await handleUpdateService(
        data,
        operation.service_id as string | null,
        operation.payload as ServiceUpdatePayload | null,
        k8s,
        db,
        emit,
      );
      return;
    }
    if (operation?.type === 'connect_service') {
      await handleConnectService(
        data,
        operation.payload as ServiceUpdatePayload | null,
        k8s,
        db,
        emit,
      );
      return;
    }
    if (operation?.type === 'disconnect_service') {
      await handleDisconnectService(
        data,
        operation.payload as ServiceUpdatePayload | null,
        k8s,
        db,
        emit,
      );
      return;
    }
    if (operation?.type === 'create_service') {
      await handleCreateService(data, operation.service_id as string | null, k8s, db, emit);
      return;
    }

    // ── create_project — deploy all services from template spec ───────────
    await db.from('operations').update({
      status: 'running',
      started_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    }).eq('id', operationId);
    await db.from('projects').update({ status: 'deploying' }).eq('id', projectId);

    const { spec, services, inputsBySpecId, secretsBySpecId } = await loadProject(projectId, db);

    await emit('namespace', 'running', 5, `Creating namespace ${namespace}`);
    await ensureNamespace(core, namespace);
    namespaceCreated = true;
    await emit('namespace', 'success', 10, 'Namespace ready');

    await emit('env_resolve', 'running', 12, 'Resolving environment variables');
    const publicUrlsBySpecId = buildPublicUrls(spec, namespace);
    validatePublicUrlRefs(spec, publicUrlsBySpecId);
    const resolvedEnvs = resolveAllEnvs(spec, inputsBySpecId, namespace, secretsBySpecId, publicUrlsBySpecId);
    await emit('env_resolve', 'success', 15, `Resolved env for ${resolvedEnvs.size} services`);

    await emit('secrets', 'running', 17, 'Creating secrets');
    for (const svc of services) {
      const env = resolvedEnvs.get(svc.spec_service_id ?? '') ?? {};
      if (Object.keys(env).length === 0) continue;
      await upsertSecret(core, namespace, buildSecret(`${svc.name}-env`, namespace, env));
    }
    await emit('secrets', 'success', 22, 'Secrets created');

    // ── Layer-by-layer deploy + health gate ────────────────────────────────
    const layerResult = resolveServiceLayers(spec.services);
    if (!layerResult.ok) throw new Error(`Dependency error: ${layerResult.error}`);

    const layers = layerResult.layers;
    const totalServices = spec.services.length;
    let deployedCount = 0;
    const PCT_START = 22;
    const PCT_END = 88;
    const pctRange = PCT_END - PCT_START;

    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx];
      const layerRows: ServiceRow[] = [];

      for (const svcSpec of layer) {
        const svcRow = services.find(s => s.spec_service_id === svcSpec.id);
        if (!svcRow) continue;
        if (svcSpec.source.kind !== 'image') {
          throw new Error(`Service "${svcSpec.id}" requires a GitHub build adapter — only Docker image sources are supported right now`);
        }

        const env = resolvedEnvs.get(svcSpec.id) ?? {};
        const pct = PCT_START + Math.round((deployedCount / totalServices) * pctRange * 0.6);
        await emit('provision', 'running', pct, `Deploying ${svcSpec.name}`, svcRow.id);

        // ClusterIP
        const svcManifest = buildK8sService(svcSpec, namespace);
        if (svcManifest) {
          await db.from('service_endpoints').update({ status: 'provisioning' }).eq('service_id', svcRow.id);
          await upsertK8sService(core, namespace, svcManifest);
          await db.from('service_endpoints').update({ status: 'ready' }).eq('service_id', svcRow.id).eq('kind', 'private');
        }

        // Workload
        const useStatefulSet = svcSpec.volumes.length > 0;
        if (useStatefulSet) {
          await upsertStatefulSet(apps, namespace, buildStatefulSet(svcSpec, namespace, projectId, env));
        } else {
          await upsertDeployment(apps, namespace, buildDeployment(svcSpec, namespace, projectId, env));
        }

        await db.from('services').update({ status: 'deploying' }).eq('id', svcRow.id);
        layerRows.push(svcRow);
        deployedCount++;
      }

      if (layerRows.length === 0) continue;

      const healthPct = PCT_START + Math.round((deployedCount / totalServices) * pctRange * 0.8);
      await emit('health', 'running', healthPct,
        layers.length > 1
          ? `Layer ${layerIdx + 1}/${layers.length}: waiting for ${layerRows.map(r => r.name).join(', ')}`
          : `Waiting for ${layerRows.map(r => r.name).join(', ')} to become healthy`,
      );
      // Anchor health timeout to when THIS layer started deploying, not the overall start.
      // This gives each layer the full HEALTH_TIMEOUT_MS window regardless of earlier layers.
      const layerStartedAt = Date.now();
      await waitForAllHealthy(core, namespace, layerRows, emit, layerStartedAt);
      await db.from('services').update({ status: 'healthy' }).in('id', layerRows.map(r => r.id));
    }

    await emit('provision', 'success', PCT_END, `${deployedCount} services provisioned and healthy`);

    // ── Public domains ─────────────────────────────────────────────────────
    const publicSpecs = spec.services.filter(s => s.ports.some(p => p.public) && INGRESS_DOMAIN);
    if (publicSpecs.length > 0) {
      await emit('domains', 'running', 90, 'Configuring public access');
      for (const svcSpec of publicSpecs) {
        const result = buildIngress(svcSpec, namespace, INGRESS_DOMAIN);
        if (!result) continue;
        await upsertIngress(networking, namespace, result.manifest);
        const svcRow = services.find(s => s.spec_service_id === svcSpec.id);
        if (svcRow) {
          const { data: current } = await db.from('services').select('networking').eq('id', svcRow.id).single();
          const net = (current?.networking ?? {}) as Record<string, unknown>;
          await db.from('services').update({ networking: { ...net, publicUrl: `https://${result.host}` } }).eq('id', svcRow.id);
          await db.from('service_endpoints')
            .update({ host: result.host, url: `https://${result.host}`, status: 'ready' })
            .eq('service_id', svcRow.id)
            .eq('kind', 'public');
        }
      }
      await emit('domains', 'success', 96, `${publicSpecs.length} public endpoint(s) configured`);
    }

    // ── Complete ───────────────────────────────────────────────────────────
    await db.from('projects').update({ status: 'ready', ready_at: new Date().toISOString() }).eq('id', projectId);
    await db.from('operations').update({
      status: 'succeeded',
      progress_pct: 100,
      current_stage: 'complete',
      finished_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    }).eq('id', operationId);
    await emit('complete', 'success', 100, `Deployment complete in ${Math.round((Date.now() - startedAt) / 1000)}s`);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Provisioner] FAILED op=${operationId} project=${projectId}:`, err);

    if (namespaceCreated && (!operationType || operationType === 'create_project')) {
      try { await core.deleteNamespace({ name: namespace }); } catch { /* ignore */ }
    }

    try {
      await emit('failed', 'failed', 0, message);
      await db.from('operations').update({
        status: 'failed',
        error_message: message,
        finished_at: new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString(),
      }).eq('id', operationId);
      if (!operationType || operationType === 'create_project') {
        await db.from('projects').update({ status: 'failed' }).eq('id', projectId);
        // Only mark services that are still in-progress as failed.
        // Services that already reached 'healthy' keep their healthy status —
        // a partial deployment failure should not retroactively mark good services.
        await db.from('services')
          .update({ status: 'failed' })
          .eq('project_id', projectId)
          .in('status', ['pending', 'building', 'deploying', 'starting']);
        await db.from('service_endpoints')
          .update({ status: 'failed' })
          .eq('project_id', projectId)
          .in('status', ['planned', 'provisioning']);
      } else if (operationType === 'delete_project') {
        await db.from('projects').update({ status: 'degraded' }).eq('id', projectId).eq('status', 'deleting');
      }
    } catch (secondaryErr) {
      console.error(`[Provisioner] Secondary failure while recording op=${operationId} failure:`, secondaryErr);
    }
    throw err;
  }
}

// ── Operation handlers — each delegates K8s work to service-runner ─────────

async function handleDeleteProject(
  data: ProvisionJobData,
  core: CoreV1Api,
  db: Awaited<ReturnType<typeof createWorkerClient>>,
  emit: EmitFn,
) {
  await db.from('operations').update({
    status: 'running', current_stage: 'delete_namespace', progress_pct: 10,
    started_at: new Date().toISOString(), last_heartbeat_at: new Date().toISOString(),
  }).eq('id', data.operationId);

  await emit('delete_namespace', 'running', 20, `Deleting namespace ${data.namespace}`);
  try {
    await core.deleteNamespace({ name: data.namespace });
  } catch (err) {
    if ((err as { code?: number }).code !== 404) throw err;
  }

  await db.from('services').update({ status: 'deleted' }).eq('project_id', data.projectId);
  await db.from('service_endpoints').update({ status: 'deleted' }).eq('project_id', data.projectId);
  await db.from('infra_resources').update({ status: 'deleted' }).eq('project_id', data.projectId);
  await db.from('projects').update({ status: 'deleted' }).eq('id', data.projectId);
  await db.from('operations').update({
    status: 'succeeded', current_stage: 'complete', progress_pct: 100,
    finished_at: new Date().toISOString(), last_heartbeat_at: new Date().toISOString(),
  }).eq('id', data.operationId);
  await emit('complete', 'success', 100, 'Project deleted');
}

async function handleRestart(
  data: ProvisionJobData,
  serviceId: string | null,
  k8s: K8sClients,
  db: Awaited<ReturnType<typeof createWorkerClient>>,
  emit: EmitFn,
) {
  if (!serviceId) throw new Error('Restart operation missing service_id');

  const { data: service, error } = await db
    .from('services').select('id, name').eq('id', serviceId).eq('project_id', data.projectId).single();
  if (error || !service) throw new Error(error?.message ?? 'Service not found');

  await markOperationRunning(db, data.operationId, 'restart', 10);
  await emit('restart', 'running', 20, `Restarting ${service.name}`, service.id);
  await db.from('services').update({ status: 'starting' }).eq('id', service.id);

  await rollingRestart(service.name, data.namespace, k8s);

  await emit('health', 'running', 60, `Waiting for ${service.name}`, service.id);
  await waitForAllHealthy(k8s.core, data.namespace, [service], emit, Date.now());

  await db.from('services').update({ status: 'healthy' }).eq('id', service.id);
  await markOperationSucceeded(db, data.operationId);
  await emit('complete', 'success', 100, `${service.name} restarted`, service.id);
}

async function handleUpdateService(
  data: ProvisionJobData,
  serviceId: string | null,
  payload: ServiceUpdatePayload | null,
  k8s: K8sClients,
  db: Awaited<ReturnType<typeof createWorkerClient>>,
  emit: EmitFn,
) {
  if (!serviceId) throw new Error('Update operation missing service_id');
  if (!payload || (!payload.env && !payload.image && !payload.scale)) throw new Error('Update operation has no payload');

  const { data: service, error } = await db
    .from('services').select('id, name, source, status').eq('id', serviceId).eq('project_id', data.projectId).single();
  if (error || !service) throw new Error(error?.message ?? 'Service not found');

  await markOperationRunning(db, data.operationId, 'update_service', 10);
  await emit('update_service', 'running', 20, `Updating ${service.name}`, service.id);
  await db.from('services').update({ status: 'starting' }).eq('id', service.id);

  if (payload.env) {
    try {
      const rows = Object.entries(payload.env).map(([key, value]) => ({
        project_id: data.projectId,
        service_id: service.id,
        key,
        value_type: 'literal',
        value: { kind: 'literal', value },
        managed_by: 'user',
      }));
      if (rows.length > 0) {
        const { error: envError } = await db
          .from('service_env_vars')
          .upsert(rows, { onConflict: 'service_id,key' });
        if (envError) throw new Error(`Failed to persist env: ${envError.message}`);
      }

      await applyEnvUpdate(service.name, data.namespace, payload.env, k8s);
  } catch (err) {
      await db.from('services').update({ status: service.status ?? 'degraded' }).eq('id', service.id);
      throw err;
    }
  }

  if (payload.image) {
    const src = service.source as { kind?: string; image?: string } | null;
    if (src?.kind !== 'image') throw new Error('Image update requires a Docker image service');
    try {
      await patchImage(service.name, data.namespace, payload.image, k8s);
      await db.from('services').update({ source: { ...src, image: payload.image } }).eq('id', service.id);
    } catch (err) {
      await db.from('services').update({ status: service.status ?? 'degraded' }).eq('id', service.id);
      throw err;
    }
  }

  if (payload.scale) {
    const replicas = payload.scale.replicas;
    try {
      await scaleStatelessWorkload(service.name, data.namespace, replicas, k8s);
      const { data: current } = await db.from('services').select('runtime').eq('id', service.id).single();
      const runtime = (current?.runtime ?? {}) as Record<string, unknown>;
      const scaling = (runtime.scaling ?? {}) as Record<string, unknown>;
      await db
        .from('services')
        .update({ runtime: { ...runtime, scaling: { ...scaling, minReplicas: replicas, maxReplicas: replicas } } })
        .eq('id', service.id);
    } catch (err) {
      await db.from('services').update({ status: service.status ?? 'degraded' }).eq('id', service.id);
      throw err;
    }
  }

  await emit('health', 'running', 70, `Waiting for ${service.name}`, service.id);
  await waitForAllHealthy(k8s.core, data.namespace, [service], emit, Date.now());

  await db.from('services').update({ status: 'healthy' }).eq('id', service.id);
  await markOperationSucceeded(db, data.operationId);
  await emit('complete', 'success', 100, `${service.name} updated`, service.id);
}

async function handleConnectService(
  data: ProvisionJobData,
  payload: ServiceUpdatePayload | null,
  k8s: K8sClients,
  db: Awaited<ReturnType<typeof createWorkerClient>>,
  emit: EmitFn,
) {
  const connectionId = payload?.connectionId;
  if (!connectionId) throw new Error('connect_service operation missing connectionId');

  const { data: connection, error } = await db
    .from('service_connections')
    .select(`
      id, from_service_id, to_service_id, connection_type,
      from_service:services!service_connections_from_service_id_fkey(id, name, engine, runtime, networking),
      to_service:services!service_connections_to_service_id_fkey(id, name, engine, runtime, networking)
    `)
    .eq('id', connectionId)
    .eq('project_id', data.projectId)
    .single();
  if (error || !connection) throw new Error(error?.message ?? 'Connection not found');

  const fromService = Array.isArray(connection.from_service) ? connection.from_service[0] : connection.from_service;
  const toService = Array.isArray(connection.to_service) ? connection.to_service[0] : connection.to_service;
  if (!fromService || !toService) throw new Error('Connection services could not be loaded');

  await markOperationRunning(db, data.operationId, 'connect_service', 10);
  await emit('connect_service', 'running', 20, `Connecting ${fromService.name} to ${toService.name}`, fromService.id);

  const toEngine = toService.engine ?? 'generic';
  const def = getServiceDefinition(toEngine);
  const template = def.connectionTemplates.find(t => t.id === connection.connection_type);
  if (!template) throw new Error(`Connection template "${connection.connection_type}" not found for ${toEngine}`);

  const serviceEnv = await loadServiceEnvWithSecrets(db, toService.id);
  const toRuntime = toService.runtime as { ports?: { internal: number }[] } | null;
  const toNetworking = toService.networking as { privateHost?: string } | null;
  const host = toNetworking?.privateHost ?? `${toService.name}.${data.namespace}.svc.cluster.local`;
  const port = toRuntime?.ports?.[0]?.internal ?? def.defaultPort;
  const resolvedVars = resolveConnectionTemplate(template.vars, serviceEnv, host, port);
  const envMapping = Object.fromEntries(resolvedVars.map(v => [v.key, v.value]));
  const createdEnvKeys = resolvedVars.map(v => v.key);

  await db.from('services').update({ status: 'starting' }).eq('id', fromService.id);
  try {
    const envRows = resolvedVars.map(({ key, value }) => ({
      project_id: data.projectId,
      service_id: fromService.id,
      key,
      value_type: 'connection_ref',
      value: { kind: 'literal', value },
      managed_by: 'connection',
      connection_id: connection.id,
    }));
    if (envRows.length > 0) {
      const { error: envError } = await db.from('service_env_vars').upsert(envRows, { onConflict: 'service_id,key' });
      if (envError) throw new Error(`Failed to persist connection env vars: ${envError.message}`);
    }

    await applyEnvUpdate(fromService.name, data.namespace, envMapping, k8s);
    await waitForAllHealthy(k8s.core, data.namespace, [fromService], emit, Date.now());
  } catch (err) {
    await db.from('service_connections').update({ status: 'failed' }).eq('id', connection.id);
    await db.from('services').update({ status: 'degraded' }).eq('id', fromService.id);
    throw err;
  }

  await db
    .from('service_connections')
    .update({ status: 'active', created_env_keys: createdEnvKeys })
    .eq('id', connection.id);
  await db.from('services').update({ status: 'healthy' }).eq('id', fromService.id);

  await markOperationSucceeded(db, data.operationId);
  await emit('complete', 'success', 100, `${fromService.name} connected to ${toService.name}`, fromService.id);
}

async function handleDisconnectService(
  data: ProvisionJobData,
  payload: ServiceUpdatePayload | null,
  k8s: K8sClients,
  db: Awaited<ReturnType<typeof createWorkerClient>>,
  emit: EmitFn,
) {
  const connectionId = payload?.connectionId;
  if (!connectionId) throw new Error('disconnect_service operation missing connectionId');

  const { data: connection, error } = await db
    .from('service_connections')
    .select('id, from_service_id, created_env_keys, from_service:services!service_connections_from_service_id_fkey(id, name)')
    .eq('id', connectionId)
    .eq('project_id', data.projectId)
    .single();
  if (error || !connection) throw new Error(error?.message ?? 'Connection not found');

  const fromService = Array.isArray(connection.from_service) ? connection.from_service[0] : connection.from_service;
  if (!fromService) throw new Error('Connection source service could not be loaded');

  await markOperationRunning(db, data.operationId, 'disconnect_service', 10);
  await emit('disconnect_service', 'running', 20, `Disconnecting ${fromService.name}`, fromService.id);

  const removedKeys = (connection.created_env_keys ?? []) as string[];
  if (removedKeys.length > 0) {
    await db.from('services').update({ status: 'starting' }).eq('id', fromService.id);
    try {
      await removeEnvKeys(fromService.name, data.namespace, removedKeys, k8s);
      await waitForAllHealthy(k8s.core, data.namespace, [fromService], emit, Date.now());
    } catch (err) {
      await db.from('service_connections').update({ status: 'failed' }).eq('id', connection.id);
      await db.from('services').update({ status: 'degraded' }).eq('id', fromService.id);
      throw err;
    }
  }

  await db
    .from('service_env_vars')
    .delete()
    .eq('connection_id', connection.id)
    .eq('service_id', connection.from_service_id);
  await db
    .from('service_connections')
    .update({ status: 'deleted' })
    .eq('id', connection.id);
  await db.from('services').update({ status: 'healthy' }).eq('id', fromService.id);

  await markOperationSucceeded(db, data.operationId);
  await emit('complete', 'success', 100, `${fromService.name} disconnected`, fromService.id);
}

async function handleCreateService(
  data: ProvisionJobData,
  serviceId: string | null,
  k8s: K8sClients,
  db: Awaited<ReturnType<typeof createWorkerClient>>,
  emit: EmitFn,
) {
  if (!serviceId) throw new Error('create_service operation missing service_id');

  const { data: svc, error } = await db
    .from('services')
    .select('id, name, engine, source, runtime, networking')
    .eq('id', serviceId)
    .eq('project_id', data.projectId)
    .single();
  if (error || !svc) throw new Error(error?.message ?? 'Service not found');

  const source = svc.source as { kind?: string; image?: string; startCommand?: string } | null;
  if (source?.kind !== 'image' || !source.image) throw new Error('create_service requires a Docker image source');

  const runtime = svc.runtime as {
    ports?: { internal: number; public?: boolean }[];
    volumes?: { name: string; mountPath: string; sizeGb: number }[];
    resources?: ServiceRunSpec['resources'];
    scaling?: { minReplicas?: number };
  } | null;

  const port = runtime?.ports?.[0]?.internal ?? 3000;
  const isPublic = runtime?.ports?.some(p => p.public) ?? false;
  const volumes = runtime?.volumes ?? [];

  await markOperationRunning(db, data.operationId, 'create_service', 10);
  await emit('provision', 'running', 20, `Creating ${svc.name}`, svc.id);
  await db.from('services').update({ status: 'deploying' }).eq('id', svc.id);

  // Load env vars for this service
  const { data: envRows } = await db
    .from('service_env_vars')
    .select('key, value, value_type')
    .eq('service_id', svc.id)
    .in('value_type', ['literal', 'input']);

  const env: Record<string, string> = {};
  for (const row of envRows ?? []) {
    const val = row.value as { value?: string } | null;
    if (typeof val?.value === 'string') env[row.key] = val.value;
  }

  // Ensure namespace exists
  await ensureNamespace(k8s.core, data.namespace);

  const spec: ServiceRunSpec = {
    name: svc.name,
    namespace: data.namespace,
    projectId: data.projectId,
    image: source.image,
    startCommand: source.startCommand,
    port,
    isPublic,
    volumes,
    replicas: runtime?.scaling?.minReplicas ?? 1,
    resources: runtime?.resources,
  };

  const result = await applyService(spec, env, k8s, INGRESS_DOMAIN);

  // Update networking + endpoints in DB
  const networking = svc.networking as Record<string, unknown> ?? {};
  await db.from('services').update({
    networking: { ...networking, privateHost: result.privateHost, ...(result.publicUrl ? { publicUrl: result.publicUrl } : {}) },
  }).eq('id', svc.id);
  await db.from('service_endpoints')
    .update({ host: result.privateHost, status: 'ready' })
    .eq('service_id', svc.id)
    .eq('kind', 'private');
  if (result.publicUrl) {
    const publicHost = result.publicUrl.replace(/^https?:\/\//, '');
    await db.from('service_endpoints')
      .update({ host: publicHost, url: result.publicUrl, status: 'ready' })
      .eq('service_id', svc.id)
      .eq('kind', 'public');
  }

  await emit('health', 'running', 60, `Waiting for ${svc.name}`, svc.id);
  await waitForAllHealthy(k8s.core, data.namespace, [svc], emit, Date.now());

  await db.from('services').update({ status: 'healthy' }).eq('id', svc.id);
  await markOperationSucceeded(db, data.operationId);
  await emit('complete', 'success', 100, `${svc.name} deployed`, svc.id);
}

// ── Data loading (used by create_project only) ─────────────────────────────

async function loadProject(projectId: string, db: Awaited<ReturnType<typeof createWorkerClient>>) {
  const [projectRes, servicesRes, envVarsRes] = await Promise.all([
    db.from('projects').select('id, desired_spec').eq('id', projectId).single(),
    db.from('services').select('id, spec_service_id, name').eq('project_id', projectId),
    db.from('service_env_vars').select('service_id, key, value, value_type').eq('project_id', projectId).eq('value_type', 'input'),
  ]);

  if (projectRes.error || !projectRes.data) throw new Error(`Project not found: ${projectRes.error?.message}`);
  if (servicesRes.error) throw new Error(`Failed to load services: ${servicesRes.error.message}`);
  if (envVarsRes.error) throw new Error(`Failed to load env vars: ${envVarsRes.error.message}`);

  const services = (servicesRes.data ?? []) as ServiceRow[];
  // Validate the stored spec on load — corrupt JSONB should fail fast with a clear error
  const spec = parseTemplateSpec(projectRes.data.desired_spec);
  const secretsBySpecId = await materializeGeneratedSecrets(db, projectId, spec, services);

  const serviceById = new Map(services.map(s => [s.id, s]));
  const inputsBySpecId = new Map<string, Record<string, string>>();
  for (const row of envVarsRes.data ?? []) {
    const svcRow = serviceById.get(row.service_id);
    if (!svcRow?.spec_service_id) continue;
    const bucket = inputsBySpecId.get(svcRow.spec_service_id) ?? {};
    const val = row.value as { inputKey?: string; value?: string };
    const inputKey = typeof val?.inputKey === 'string' && val.inputKey ? val.inputKey : row.key;
    if (typeof val?.value === 'string') {
      bucket[inputKey] = val.value;
    } else if (val && 'secret' in val) {
      bucket[inputKey] = secretsBySpecId.get(svcRow.spec_service_id)?.[row.key] ?? '';
    }
    inputsBySpecId.set(svcRow.spec_service_id, bucket);
  }

  return { spec, services, inputsBySpecId, secretsBySpecId };
}

async function materializeGeneratedSecrets(
  db: Awaited<ReturnType<typeof createWorkerClient>>,
  projectId: string,
  spec: TemplateSpec,
  services: ServiceRow[],
) {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    const hasGeneratedSecrets = spec.services.some(s => Object.values(s.env).some(v => v.kind === 'generatedSecret'));
    if (hasGeneratedSecrets) throw new Error('ENCRYPTION_KEY is required for generated template secrets');
  }

  const serviceBySpecId = new Map(services.map(s => [s.spec_service_id, s]));
  const serviceById = new Map(services.map(s => [s.id, s]));

  const { data: existingRows, error } = await db
    .from('service_secrets').select('service_id, key, value_ciphertext').eq('project_id', projectId);
  if (error) throw new Error(`Failed to load secrets: ${error.message}`);
  if (!encryptionKey && (existingRows ?? []).some(row => row.value_ciphertext)) {
    throw new Error('ENCRYPTION_KEY is required to decrypt template secrets');
  }

  const secretsBySpecId = new Map<string, Record<string, string>>();
  const existing = new Map<string, string>();

  for (const row of existingRows ?? []) {
    const svc = serviceById.get(row.service_id);
    if (!svc?.spec_service_id || !row.value_ciphertext) continue;
    const decrypted = Encryption.decrypt(JSON.parse(row.value_ciphertext) as EncryptedData, encryptionKey!);
    const bucket = secretsBySpecId.get(svc.spec_service_id) ?? {};
    bucket[row.key] = decrypted;
    secretsBySpecId.set(svc.spec_service_id, bucket);
    existing.set(`${svc.spec_service_id}:${row.key}`, decrypted);
  }

  const rowsToInsert = [];
  for (const svcSpec of spec.services) {
    const svc = serviceBySpecId.get(svcSpec.id);
    if (!svc) continue;
    const bucket = secretsBySpecId.get(svcSpec.id) ?? {};
    for (const [key, value] of Object.entries(svcSpec.env)) {
      if (value.kind !== 'generatedSecret') continue;
      if (existing.has(`${svcSpec.id}:${key}`)) continue;
      const secret = generateTemplateSecret(value.length ?? 32, value.alphabet);
      bucket[key] = secret;
      rowsToInsert.push({
        project_id: projectId,
        service_id: svc.id,
        key,
        value_ciphertext: JSON.stringify(Encryption.encrypt(secret, encryptionKey!)),
      });
    }
    if (Object.keys(bucket).length > 0) secretsBySpecId.set(svcSpec.id, bucket);
  }

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await db.from('service_secrets').upsert(rowsToInsert, { onConflict: 'service_id,key' });
    if (insertError) throw new Error(`Failed to persist secrets: ${insertError.message}`);
  }

  return secretsBySpecId;
}

async function loadServiceEnvWithSecrets(
  db: Awaited<ReturnType<typeof createWorkerClient>>,
  serviceId: string,
) {
  const env: Record<string, string> = {};
  const { data: envRows, error: envError } = await db
    .from('service_env_vars')
    .select('key, value')
    .eq('service_id', serviceId)
    .in('value_type', ['literal', 'input', 'connection_ref']);
  if (envError) throw new Error(`Failed to load service env: ${envError.message}`);

  for (const row of envRows ?? []) {
    const val = row.value as { value?: string } | null;
    if (typeof val?.value === 'string') env[row.key] = val.value;
  }

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) return env;

  const { data: secretRows, error: secretError } = await db
    .from('service_secrets')
    .select('key, value_ciphertext')
    .eq('service_id', serviceId);
  if (secretError) throw new Error(`Failed to load service secrets: ${secretError.message}`);

  for (const row of secretRows ?? []) {
    if (!row.value_ciphertext) continue;
    const decrypted = Encryption.decrypt(JSON.parse(row.value_ciphertext) as EncryptedData, encryptionKey);
    env[row.key] = decrypted;
  }

  return env;
}

function buildPublicUrls(spec: TemplateSpec, namespace: string) {
  const urls = new Map<string, string>();
  if (!INGRESS_DOMAIN) return urls;
  for (const service of spec.services) {
    if (!service.ports.some(p => p.public)) continue;
    const suffix = namespace.length > 8 ? namespace.slice(-8) : namespace;
    urls.set(service.id, `https://${service.name}-${suffix}.${INGRESS_DOMAIN}`);
  }
  return urls;
}

function validatePublicUrlRefs(spec: TemplateSpec, publicUrlsBySpecId: Map<string, string>) {
  const missing: string[] = [];
  for (const service of spec.services) {
    for (const [key, value] of Object.entries(service.env)) {
      if (value.kind === 'serviceRef' && value.field === 'publicUrl' && !publicUrlsBySpecId.has(value.serviceId)) {
        missing.push(`${service.id}.${key} -> ${value.serviceId}.publicUrl`);
      }
      if (value.kind === 'computed') {
        const pattern = /\$\{\s*services\.([a-z0-9-]+)\.publicUrl\s*\}/g;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(value.template))) {
          if (!publicUrlsBySpecId.has(match[1])) missing.push(`${service.id}.${key} -> ${match[1]}.publicUrl`);
        }
      }
    }
  }
  if (missing.length > 0) throw new Error(`Public URL refs require INGRESS_DOMAIN + public service: ${missing.join(', ')}`);
}

// ── K8s helpers (template deploy path — multi-port ClusterIP stays here) ───

async function ensureNamespace(core: CoreV1Api, namespace: string) {
  try {
    await core.readNamespace({ name: namespace });
  } catch {
    await core.createNamespace({
      body: { metadata: { name: namespace, labels: { 'managed-by': 'cloud-services-platform' } } },
    });
  }
}

async function upsertSecret(core: CoreV1Api, namespace: string, manifest: ReturnType<typeof buildSecret>) {
  const name = manifest.metadata!.name!;
  try {
    await core.replaceNamespacedSecret({ name, namespace, body: manifest });
  } catch {
    await core.createNamespacedSecret({ namespace, body: manifest });
  }
}

async function upsertK8sService(core: CoreV1Api, namespace: string, manifest: NonNullable<ReturnType<typeof buildK8sService>>) {
  const name = manifest.metadata!.name!;
  try {
    const existing = await core.readNamespacedService({ name, namespace });
    (manifest.metadata as Record<string, unknown>).resourceVersion = existing.metadata?.resourceVersion;
    (manifest.spec as Record<string, unknown>).clusterIP = existing.spec?.clusterIP;
    await core.replaceNamespacedService({ name, namespace, body: manifest });
  } catch (err) {
    if ((err as { code?: number }).code === 404) {
      await core.createNamespacedService({ namespace, body: manifest });
    } else { throw err; }
  }
}

async function upsertDeployment(apps: AppsV1Api, namespace: string, manifest: ReturnType<typeof buildDeployment>) {
  const name = manifest.metadata!.name!;
  try {
    const existing = await apps.readNamespacedDeployment({ name, namespace });
    (manifest.metadata as Record<string, unknown>).resourceVersion = existing.metadata?.resourceVersion;
    await apps.replaceNamespacedDeployment({ name, namespace, body: manifest });
  } catch (err) {
    if ((err as { code?: number }).code === 404) {
      await apps.createNamespacedDeployment({ namespace, body: manifest });
    } else { throw err; }
  }
}

async function upsertStatefulSet(apps: AppsV1Api, namespace: string, manifest: ReturnType<typeof buildStatefulSet>) {
  const name = manifest.metadata!.name!;
  try {
    const existing = await apps.readNamespacedStatefulSet({ name, namespace });
    (manifest.metadata as Record<string, unknown>).resourceVersion = existing.metadata?.resourceVersion;
    await apps.replaceNamespacedStatefulSet({ name, namespace, body: manifest });
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 404) {
      await apps.createNamespacedStatefulSet({ namespace, body: manifest });
    } else if (code === 422) {
      throw new Error(
        `StatefulSet "${name}" has immutable field changes. Refusing destructive delete+create; create an explicit recreate/migration operation instead.`,
      );
    } else { throw err; }
  }
}

async function upsertIngress(networking: NetworkingV1Api, namespace: string, manifest: NonNullable<ReturnType<typeof buildIngress>>['manifest']) {
  const name = manifest.metadata!.name!;
  try {
    const existing = await networking.readNamespacedIngress({ name, namespace });
    (manifest.metadata as Record<string, unknown>).resourceVersion = existing.metadata?.resourceVersion;
    await networking.replaceNamespacedIngress({ name, namespace, body: manifest });
  } catch (err) {
    if ((err as { code?: number }).code === 404) {
      await networking.createNamespacedIngress({ namespace, body: manifest });
    } else { throw err; }
  }
}

// ── Health check ───────────────────────────────────────────────────────────

type EmitFn = (stage: string, status: 'running' | 'success' | 'failed' | 'skipped', pct: number, msg: string, serviceId?: string) => Promise<void>;

async function waitForAllHealthy(
  core: CoreV1Api,
  namespace: string,
  services: { name: string }[],
  emit: EmitFn,
  startedAt: number,
) {
  const deadline = startedAt + HEALTH_TIMEOUT_MS;
  const pending = new Set(services.map(s => s.name));

  while (Date.now() < deadline) {
    const checks = await Promise.all(
      [...pending].map(async name => ({ name, ready: await isPodReady(core, namespace, name) }))
    );
    for (const { name, ready } of checks) {
      if (ready) pending.delete(name);
    }
    if (pending.size === 0) return;
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    await emit('health', 'running', 72, `Waiting: ${[...pending].join(', ')} (${elapsed}s)`);
    await sleep(HEALTH_POLL_MS);
  }
  throw new Error(`Health timeout after ${HEALTH_TIMEOUT_MS / 1000}s — still waiting: ${[...pending].join(', ')}`);
}

async function isPodReady(core: CoreV1Api, namespace: string, serviceName: string): Promise<boolean> {
  try {
    const { items } = await core.listNamespacedPod({ namespace, labelSelector: `app=${serviceName}` });
    return items.some(pod => pod.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True'));
  } catch {
    return false;
  }
}

// ── Operation DB helpers ────────────────────────────────────────────────────

async function markOperationRunning(
  db: Awaited<ReturnType<typeof createWorkerClient>>,
  operationId: string,
  stage: string,
  pct: number,
) {
  await db.from('operations').update({
    status: 'running',
    current_stage: stage,
    progress_pct: pct,
    started_at: new Date().toISOString(),
    last_heartbeat_at: new Date().toISOString(),
  }).eq('id', operationId);
}

async function markOperationSucceeded(
  db: Awaited<ReturnType<typeof createWorkerClient>>,
  operationId: string,
) {
  await db.from('operations').update({
    status: 'succeeded',
    current_stage: 'complete',
    progress_pct: 100,
    finished_at: new Date().toISOString(),
    last_heartbeat_at: new Date().toISOString(),
  }).eq('id', operationId);
}

// ── Event emitter ──────────────────────────────────────────────────────────

function makeEmitter(operationId: string, db: Awaited<ReturnType<typeof createWorkerClient>>): EmitFn {
  return async function emit(stage, status, progressPct, message, serviceId?) {
    await Promise.all([
      OperationEventService.emit({
        operationId, stage, status: status as Parameters<typeof OperationEventService.emit>[0]['status'],
        progressPct, message, serviceId: serviceId ?? null,
      }),
      db.from('operations').update({ current_stage: stage, progress_pct: progressPct }).eq('id', operationId),
    ]);
  };
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}
