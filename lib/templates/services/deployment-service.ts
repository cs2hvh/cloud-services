import { createHash, randomUUID } from 'crypto';
import { Encryption } from '@/config/functions';
import { createServiceClient } from '@/lib/supabase/server';
import { validateTemplateSpec, type TemplateSpec } from '../domain/spec-schema';
import { resolveEndpointProtocol, buildEndpointUrl } from '@/lib/services/registry';
import { resolveServiceLayers } from '../domain/dag';
import { planEnvironment } from '../domain/env-plan';
import { OperationEventService } from './operation-event-service';
import { enqueueProjectDeploy } from '@/lib/workers/project-deploy-worker';

type CreateDeploymentInput = {
  slug: string;
  projectName: string;
  userId: string;
  idempotencyKey?: string;
  serviceOverrides?: Record<string, { name?: string; image?: string }>;
  inputValues?: Record<string, string>;
  serviceInputs?: Record<string, Record<string, string>>;
};

type CreateDeploymentResult = {
  deploymentId: string;
  operationId: string;
  namespace: string;
};

export async function deployFromTemplate(input: CreateDeploymentInput): Promise<CreateDeploymentResult> {
  const db = await createServiceClient();
  const loaded = await loadTemplateSpec(input.slug, db);
  if (!loaded) throw new Error(`Template "${input.slug}" not found`);

  const desiredSpec = applyImageAndNameOverrides(loaded.spec, input.serviceOverrides ?? {});
  const validation = validateTemplateSpec(desiredSpec);
  if (!validation.valid) {
    throw new Error(validation.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }
  assertSupportedDeploySources(validation.spec);

  const dag = resolveServiceLayers(validation.spec.services);
  if (!dag.ok) throw new Error(dag.error);

  const envPlan = planEnvironment(validation.spec);
  if (envPlan.errors.length > 0) {
    throw new Error(envPlan.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }
  validateDeployInputs(validation.spec, input.inputValues ?? {}, input.serviceInputs ?? {});

  const fingerprint = fingerprintRequest(
    input.slug,
    input.projectName,
    validation.spec,
    input.inputValues ?? {},
    input.serviceInputs ?? {},
  );

  // Idempotency: return the existing operation if the same key was used before
  if (input.idempotencyKey) {
    const { data: existing } = await db
      .from('operations')
      .select('id, request_fingerprint, projects(id, namespace)')
      .eq('user_id', input.userId)
      .eq('idempotency_key', input.idempotencyKey)
      .maybeSingle();

    const existingProject = Array.isArray(existing?.projects)
      ? existing?.projects[0]
      : existing?.projects;

    if (existing && existingProject) {
      if (existing.request_fingerprint && existing.request_fingerprint !== fingerprint) {
        throw new Error('Idempotency key was already used for a different deployment request');
      }
      return { deploymentId: existingProject.id, operationId: existing.id, namespace: existingProject.namespace };
    }
  }

  const namespace = `proj-${randomUUID().replace(/-/g, '').slice(0, 12)}`;

  const { data: project, error: projectError } = await db
    .from('stacks')
    .insert({
      template_id: loaded.templateId,
      template_version_id: loaded.templateVersionId,
      user_id: input.userId,
      name: input.projectName,
      namespace,
      status: 'creating',
      desired_spec: validation.spec,
    })
    .select('id')
    .single();

  if (projectError || !project) {
    throw new Error(`Failed to create project: ${projectError?.message ?? 'unknown error'}`);
  }

  try {
    const serviceRows = validation.spec.services.map(svc => ({
      project_id: project.id,
      spec_service_id: svc.id,
      name: svc.name,
      type: svc.type,
      engine: svc.engine,
      status: svc.source.kind === 'github' ? 'building' : 'pending',
      source: svc.source,
      runtime: { ports: svc.ports, volumes: svc.volumes, scaling: svc.scaling ?? null, resources: svc.resources ?? {} },
      networking: {
        privateHost: `${svc.name}.${namespace}.svc.cluster.local`,
        publicPorts: svc.ports.filter(p => p.public),
      },
      health: svc.healthCheck ?? null,
      dependencies: svc.dependsOn,
    }));

    const { data: services, error: servicesError } = await db
      .from('services')
      .insert(serviceRows)
      .select('id, spec_service_id, name, type, engine, runtime, networking');
    if (servicesError) throw new Error(`Failed to create services: ${servicesError.message}`);

    const { data: operation, error: operationError } = await db
      .from('operations')
      .insert({
        project_id: project.id,
        user_id: input.userId,
        type: 'create_project',
        status: 'queued',
        idempotency_key: input.idempotencyKey ?? null,
        request_fingerprint: fingerprint,
        current_stage: 'queued',
        progress_pct: 0,
      })
      .select('id')
      .single();

    if (operationError || !operation) {
      throw new Error(`Failed to create operation: ${operationError?.message ?? 'unknown error'}`);
    }

    // Persist endpoint + env-var rows using the same db connection
    await saveServiceMetadata(
      db,
      project.id,
      validation.spec,
      services ?? [],
      input.inputValues ?? {},
      input.serviceInputs ?? {},
    );

    await OperationEventService.emit({
      operationId: operation.id,
      stage: 'queued',
      status: 'success',
      progressPct: 0,
      message: 'Deployment queued',
      data: {
        serviceCount: validation.spec.services.length,
        dependencyLayers: dag.layers.map(layer => layer.map(s => s.id)),
      },
    });

    await enqueueProjectDeploy({ operationId: operation.id, projectId: project.id, namespace });
    await db.rpc('increment_template_deploy_count', { p_template_id: loaded.templateId });

    return { deploymentId: project.id, operationId: operation.id, namespace };
  } catch (err) {
    // Roll back the project row so the user can try again cleanly
    await db.from('stacks').delete().eq('id', project.id);
    throw err;
  }
}

// ── Private helpers ────────────────────────────────────────────────────────

type ServiceRow = {
  id: string;
  spec_service_id: string | null;
  name: string;
  type: string;
  engine: string | null;
  runtime: { ports?: Array<{ name?: string; internal: number; public?: boolean; protocol?: string }> } | null;
  networking: { privateHost?: string } | null;
};

async function saveServiceMetadata(
  db: Awaited<ReturnType<typeof createServiceClient>>,
  projectId: string,
  spec: TemplateSpec,
  services: ServiceRow[],
  globalInputValues: Record<string, string>,
  serviceInputs: Record<string, Record<string, string>>,
) {
  const bySpecId = new Map(services.map(s => [s.spec_service_id, s]));
  const endpointRows: object[] = [];
  const envRows: object[] = [];
  const secretRows: object[] = [];
  const encryptionKey = process.env.ENCRYPTION_KEY;

  for (const svcSpec of spec.services) {
    const svc = bySpecId.get(svcSpec.id);
    if (!svc) continue;

    const host = svc.networking?.privateHost ?? `${svc.name}.svc.cluster.local`;
    for (const port of svcSpec.ports) {
      const protocol = resolveEndpointProtocol(svcSpec.engine, port.protocol);
      const endpointName = port.name ?? String(port.internal);
      endpointRows.push({
        project_id: projectId,
        service_id: svc.id,
        name: endpointName,
        kind: 'private',
        protocol,
        host,
        port: port.internal,
        url: buildEndpointUrl(host, port.internal, protocol),
        status: 'planned',
      });
      if (port.public) {
        endpointRows.push({
          project_id: projectId,
          service_id: svc.id,
          name: endpointName,
          kind: 'public',
          protocol,
          host,
          port: port.internal,
          url: null,
          status: 'planned',
        });
      }
    }

    for (const [key, value] of Object.entries(svcSpec.env)) {
      const inputValue = value.kind === 'input'
        ? serviceInputs[svcSpec.id]?.[value.inputKey]
          ?? serviceInputs[svcSpec.name]?.[value.inputKey]
          ?? globalInputValues[value.inputKey]
          ?? value.defaultValue
          ?? ''
        : null;
      const isSecretInput = value.kind === 'input' && spec.inputs?.[value.inputKey]?.secret === true;
      if (isSecretInput && !encryptionKey) {
        throw new Error(`ENCRYPTION_KEY is required for secret deploy input "${value.inputKey}"`);
      }

      const valueForStorage = value.kind === 'input'
        ? isSecretInput
          ? { ...value, secret: true }
          : { ...value, value: inputValue ?? '' }
        : value;

      envRows.push({
        project_id: projectId,
        service_id: svc.id,
        key,
        value_type: envValueType(value.kind),
        value: valueForStorage,
        managed_by: 'template',
      });

      if (isSecretInput) {
        secretRows.push({
          project_id: projectId,
          service_id: svc.id,
          key,
          value_ciphertext: JSON.stringify(Encryption.encrypt(inputValue ?? '', encryptionKey!)),
        });
      }
    }
  }

  if (endpointRows.length > 0) {
    const { error } = await db.from('service_endpoints').insert(endpointRows);
    if (error) throw new Error(`Failed to save endpoints: ${error.message}`);
  }
  if (envRows.length > 0) {
    const { error } = await db.from('service_env_vars').insert(envRows);
    if (error) throw new Error(`Failed to save env vars: ${error.message}`);
  }
  if (secretRows.length > 0) {
    const { error } = await db.from('service_secrets').upsert(secretRows, { onConflict: 'service_id,key' });
    if (error) throw new Error(`Failed to save secret inputs: ${error.message}`);
  }
}


function envValueType(kind: string): string {
  if (kind === 'generatedSecret') return 'generated_secret';
  if (kind === 'secretRef') return 'secret_ref';
  if (kind === 'serviceRef') return 'service_ref';
  return kind;
}

function fingerprintRequest(
  slug: string,
  projectName: string,
  spec: TemplateSpec,
  inputValues: Record<string, string>,
  serviceInputs: Record<string, Record<string, string>>,
): string {
  return createHash('sha256')
    .update(JSON.stringify({ slug, projectName, spec, inputValues, serviceInputs }))
    .digest('hex');
}

function validateDeployInputs(
  spec: TemplateSpec,
  globalInputValues: Record<string, string>,
  serviceInputs: Record<string, Record<string, string>>,
) {
  const missing: string[] = [];

  for (const svc of spec.services) {
    for (const [envKey, value] of Object.entries(svc.env)) {
      if (value.kind !== 'input') continue;
      const raw = serviceInputs[svc.id]?.[value.inputKey]
        ?? serviceInputs[svc.name]?.[value.inputKey]
        ?? globalInputValues[value.inputKey]
        ?? value.defaultValue;
      const declared = spec.inputs?.[value.inputKey];
      const required = declared?.required ?? value.defaultValue === undefined;
      if (required && (raw === undefined || raw === '')) {
        missing.push(`${svc.id}.${envKey} (${value.inputKey})`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required deploy input values: ${missing.join(', ')}`);
  }
}

function assertSupportedDeploySources(spec: TemplateSpec) {
  const githubServices = spec.services.filter(service => service.source.kind === 'github');
  if (githubServices.length === 0) return;

  throw new Error(
    `GitHub source deployment must use the platform build adapter before provisioning. Use Docker image sources for now: ${
      githubServices.map(service => service.id).join(', ')
    }`
  );
}

type LoadedTemplate = {
  templateId: string;
  templateVersionId: string | null;
  deployCount: number;
  spec: TemplateSpec;
};

async function loadTemplateSpec(slug: string, db: Awaited<ReturnType<typeof createServiceClient>>): Promise<LoadedTemplate | null> {
  const { data } = await db
    .from('templates')
    .select('id, visibility, latest_version_id, latest_published_version_id, deploy_count, template_versions!template_id(id, spec, status)')
    .eq('slug', slug)
    .in('visibility', ['published', 'unlisted'])
    .maybeSingle();

  const version = selectDeployableVersion(data);

  if (data && version) {
    return {
      templateId: data.id,
      templateVersionId: version.id,
      deployCount: data.deploy_count ?? 0,
      spec: version.spec as TemplateSpec,
    };
  }
  return null;
}

function selectDeployableVersion(data: {
  visibility: string;
  latest_version_id: string | null;
  latest_published_version_id: string | null;
  template_versions: Array<{ id: string; spec: unknown; status: string }> | null;
} | null) {
  const versions = Array.isArray(data?.template_versions) ? data.template_versions : [];
  if (!data) return null;

  if (data.visibility === 'published') {
    return versions.find(version =>
      version.id === data.latest_published_version_id && version.status === 'published'
    ) ?? null;
  }

  if (data.visibility === 'unlisted') {
    return versions.find(version =>
      version.id === data.latest_version_id && ['draft', 'tested', 'published'].includes(version.status)
    ) ?? null;
  }

  return null;
}

function applyImageAndNameOverrides(
  spec: TemplateSpec,
  overrides: Record<string, { name?: string; image?: string }>,
): TemplateSpec {
  return {
    ...spec,
    services: spec.services.map(svc => {
      const override = overrides[svc.id] ?? overrides[svc.name];
      if (!override) return svc;
      return {
        ...svc,
        name: override.name ?? svc.name,
        source: override.image && svc.source.kind === 'image'
          ? { ...svc.source, image: override.image }
          : svc.source,
      };
    }),
  };
}
