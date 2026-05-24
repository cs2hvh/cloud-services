import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { authenticateUser } from '@/lib/auth/server-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { OperationEventService } from '@/lib/templates/services/operation-event-service';
import { enqueueProjectDeploy } from '@/lib/workers/project-deploy-worker';
import { Encryption } from '@/config/functions';
import { buildEndpointUrl, getServiceDefinition, resolveEndpointProtocol } from '@/lib/services/registry';

type RouteCtx = { params: Promise<{ id: string }> };

const AddServiceSchema = z.object({
  name: z.string().min(1).max(63).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Must be lowercase letters, numbers, and hyphens'),
  engine: z.string().default('generic'),
  image: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  isPublic: z.boolean().default(false),
  startCommand: z.string().optional(),
  storage: z.number().int().min(1).max(1000).optional(),
  env: z.record(z.string()).default({}),
  volumes: z.array(z.object({
    name: z.string().min(1),
    mountPath: z.string().min(1),
    sizeGb: z.number().int().min(1).max(1000),
  })).optional(),
  resources: z.object({
    cpuRequest: z.string().optional(),
    memoryRequest: z.string().optional(),
    cpuLimit: z.string().optional(),
    memoryLimit: z.string().optional(),
  }).optional(),
});

// ── GET — list services in a project ─────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;
  const db = await createServiceClient();

  const { data: project } = await db
    .from('stacks')
    .select('id, services(id, name, type, engine, status, source, runtime, networking, health, dependencies)')
    .eq('id', id)
    .eq('user_id', auth.user!.id)
    .single();

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  return NextResponse.json({ services: project.services ?? [] });
}

// ── POST — add a standalone service to an existing project ────────────────────

export async function POST(req: NextRequest, { params }: RouteCtx) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = AddServiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400 });
  }

  const { id } = await params;
  const input = parsed.data;
  const db = await createServiceClient();

  // ── Ownership + namespace ─────────────────────────────────────────────────

  const { data: project } = await db
    .from('stacks')
    .select('id, namespace, status')
    .eq('id', id)
    .eq('user_id', auth.user!.id)
    .single();

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  // ── Check name uniqueness ─────────────────────────────────────────────────

  const { data: existing } = await db
    .from('services')
    .select('id')
    .eq('project_id', id)
    .eq('name', input.name)
    .maybeSingle();

  if (existing) return NextResponse.json({ error: `A service named "${input.name}" already exists in this project` }, { status: 409 });

  // ── Determine service type from engine ────────────────────────────────────

  const def = getServiceDefinition(input.engine);
  const namespace = project.namespace as string;

  // Resolve image and port from registry defaults if not supplied
  const resolvedImage = input.image ?? def.defaultImage;
  const resolvedPort = input.port ?? def.defaultPort;
  if (!resolvedImage) {
    return NextResponse.json({ error: `No default image for engine "${input.engine}". Supply an image explicitly.` }, { status: 400 });
  }

  // Build volumes from storage shorthand or explicit list
  const resolvedVolumes: Array<{ name: string; mountPath: string; sizeGb: number }> =
    input.volumes ??
    (input.storage && def.mountPath
      ? [{ name: 'data', mountPath: def.mountPath, sizeGb: input.storage }]
      : []);

  // ── Create service row ────────────────────────────────────────────────────

  const { data: service, error: svcError } = await db
    .from('services')
    .insert({
      project_id: id,
      name: input.name,
      type: def.category,
      engine: input.engine,
      status: 'pending',
      source: { kind: 'image', image: resolvedImage, startCommand: input.startCommand },
      runtime: {
        ports: [{ internal: resolvedPort, public: input.isPublic, protocol: 'tcp' }],
        volumes: resolvedVolumes,
        resources: input.resources ?? {},
        scaling: { minReplicas: 1, maxReplicas: 1 },
      },
      networking: {
        privateHost: `${input.name}.${namespace}.svc.cluster.local`,
        ...(input.isPublic ? { publicPorts: [{ internal: resolvedPort }] } : {}),
      },
      dependencies: [],
    })
    .select('id')
    .single();

  if (svcError || !service) {
    return NextResponse.json({ error: svcError?.message ?? 'Failed to create service row' }, { status: 500 });
  }

  // ── Persist endpoint + env metadata ───────────────────────────────────────

  const protocol = resolveEndpointProtocol(input.engine, 'tcp');
  const privateHost = `${input.name}.${namespace}.svc.cluster.local`;
  const endpointRows: object[] = [{
    project_id: id,
    service_id: service.id,
    name: 'default',
    kind: 'private',
    protocol,
    host: privateHost,
    port: resolvedPort,
    url: buildEndpointUrl(privateHost, resolvedPort, protocol),
    status: 'planned',
  }];
  if (input.isPublic) {
    endpointRows.push({
      project_id: id,
      service_id: service.id,
      name: 'default',
      kind: 'public',
      protocol,
      host: privateHost,
      port: resolvedPort,
      url: null,
      status: 'planned',
    });
  }

  const defaultEnv = def.defaultEnv as Record<string, { kind: string; value?: string; length?: number }>;
  const userEnvKeys = new Set(Object.keys(input.env));
  const envRows: object[] = [];
  const secretRows: object[] = [];
  const encryptionKey = process.env.ENCRYPTION_KEY;

  for (const [key, value] of Object.entries(defaultEnv)) {
    if (userEnvKeys.has(key)) continue;
    if (value.kind === 'generatedSecret') {
      if (!encryptionKey) {
        await db.from('services').delete().eq('id', service.id);
        return NextResponse.json({ error: `ENCRYPTION_KEY is required to create generated secret "${key}"` }, { status: 500 });
      }
      const length = value.length ?? 32;
      const secret = randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
      envRows.push({
        project_id: id,
        service_id: service.id,
        key,
        value_type: 'generated_secret',
        value: { kind: 'generatedSecret', length },
        managed_by: 'system',
      });
      secretRows.push({
        project_id: id,
        service_id: service.id,
        key,
        value_ciphertext: JSON.stringify(Encryption.encrypt(secret, encryptionKey)),
      });
      continue;
    }
    if (value.kind === 'literal') {
      envRows.push({
        project_id: id,
        service_id: service.id,
        key,
        value_type: 'literal',
        value: { kind: 'literal', value: value.value ?? '' },
        managed_by: 'system',
      });
    }
  }

  for (const [key, value] of Object.entries(input.env)) {
    envRows.push({
      project_id: id,
      service_id: service.id,
      key,
      value_type: 'literal',
      value: { kind: 'literal', value },
      managed_by: 'user',
    });
  }

  const { error: endpointError } = await db.from('service_endpoints').insert(endpointRows);
  if (endpointError) {
    await db.from('services').delete().eq('id', service.id);
    return NextResponse.json({ error: `Failed to save endpoint metadata: ${endpointError.message}` }, { status: 500 });
  }

  if (envRows.length > 0) {
    const { error: envError } = await db.from('service_env_vars').insert(envRows);
    if (envError) {
      await db.from('services').delete().eq('id', service.id);
      return NextResponse.json({ error: `Failed to save env metadata: ${envError.message}` }, { status: 500 });
    }
  }

  if (secretRows.length > 0) {
    const { error: secretError } = await db.from('service_secrets').insert(secretRows);
    if (secretError) {
      await db.from('services').delete().eq('id', service.id);
      return NextResponse.json({ error: `Failed to save generated secrets: ${secretError.message}` }, { status: 500 });
    }
  }

  // ── Create and enqueue the operation ─────────────────────────────────────

  const { data: operation, error: opError } = await db
    .from('operations')
    .insert({
      project_id: id,
      service_id: service.id,
      user_id: auth.user!.id,
      type: 'create_service',
      status: 'queued',
      current_stage: 'queued',
      progress_pct: 0,
    })
    .select('id')
    .single();

  if (opError || !operation) {
    // Roll back the service row
    await db.from('services').delete().eq('id', service.id);
    return NextResponse.json({ error: opError?.message ?? 'Failed to create operation' }, { status: 500 });
  }

  await OperationEventService.emit({
    operationId: operation.id,
    serviceId: service.id,
    stage: 'queued',
    status: 'success',
    progressPct: 0,
    message: `${input.name} deploy queued`,
  });

  await enqueueProjectDeploy({
    operationId: operation.id,
    projectId: id,
    namespace,
  });

  return NextResponse.json({
    service: { id: service.id, name: input.name },
    operationId: operation.id,
  }, { status: 202 });
}
