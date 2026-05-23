import { z } from 'zod';
import { resolveServiceLayers } from './dag';

export const ServiceIdSchema = z.string()
  .min(1)
  .max(64)
  // Allows single-char IDs (e.g. "a") as well as multi-char with internal hyphens.
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Use lowercase letters, numbers, and hyphens');

export const ServiceSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('image'),
    image: z.string().min(1),
    registrySecretRef: z.string().optional(),
    pinDigest: z.boolean().default(true).optional(),
    startCommand: z.string().optional(),
    builtFrom: z.object({
      kind: z.literal('github'),
      repoUrl: z.string().url(),
      branch: z.string().min(1),
      rootDir: z.string(),
      commitSha: z.string().optional(),
    }).optional(),
  }),
  z.object({
    kind: z.literal('github'),
    repoUrl: z.string().url(),
    branch: z.string().min(1).default('main'),
    rootDir: z.string().default('.'),
    buildStrategy: z.enum(['dockerfile', 'nixpacks', 'buildpack']).default('dockerfile'),
    dockerfilePath: z.string().optional(),
    buildCommand: z.string().optional(),
    startCommand: z.string().optional(),
  }),
]);

export const EnvValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('literal'), value: z.string(), description: z.string().optional() }),
  z.object({ kind: z.literal('generatedSecret'), length: z.number().int().min(16).max(128).default(32), alphabet: z.string().min(1).optional(), description: z.string().optional() }),
  z.object({ kind: z.literal('secretRef'), serviceId: ServiceIdSchema, key: z.string().min(1), description: z.string().optional() }),
  z.object({ kind: z.literal('serviceRef'), serviceId: ServiceIdSchema, field: z.enum(['privateHost', 'publicUrl']), description: z.string().optional() }),
  z.object({ kind: z.literal('computed'), template: z.string().min(1), description: z.string().optional() }),
  z.object({ kind: z.literal('input'), inputKey: z.string().min(1), defaultValue: z.string().optional(), description: z.string().optional() }),
]);

export const PortSchema = z.object({
  name: z.string().min(1).default('http').optional(),
  internal: z.number().int().min(1).max(65535),
  public: z.boolean().default(false).optional(),
  protocol: z.enum(['tcp', 'udp', 'http']).default('tcp').optional(),
});

export const VolumeSchema = z.object({
  name: ServiceIdSchema,
  mountPath: z.string().min(1),
  sizeGb: z.number().int().min(1).max(1024),
  backupPolicy: z.enum(['none', 'daily', 'weekly']).default('none').optional(),
});

export const HealthCheckSchema = z.object({
  type: z.enum(['http', 'tcp']),
  path: z.string().optional(),
  port: z.number().int().min(1).max(65535),
  timeoutSeconds: z.number().int().min(1).max(120).default(5).optional(),
  maxRetries: z.number().int().min(1).max(120).default(30).optional(),
  intervalSeconds: z.number().int().min(1).max(120).default(10).optional(),
}).refine(
  v => v.type !== 'http' || (typeof v.path === 'string' && v.path.length > 0),
  { message: 'HTTP health checks require a path', path: ['path'] },
);

export const ScalingSchema = z.object({
  minReplicas: z.number().int().min(1).default(1),
  maxReplicas: z.number().int().min(1).default(1),
}).refine(v => v.maxReplicas >= v.minReplicas, {
  message: 'maxReplicas must be greater than or equal to minReplicas',
  path: ['maxReplicas'],
});

export const TemplateServiceSpecSchema = z.object({
  id: ServiceIdSchema,
  name: ServiceIdSchema,
  type: z.enum(['web', 'worker', 'database', 'cache', 'queue']),
  engine: z.enum(['generic', 'postgres', 'mysql', 'mongodb', 'redis', 'valkey', 'rabbitmq', 'clickhouse']).default('generic'),
  source: ServiceSourceSchema,
  dependsOn: z.array(ServiceIdSchema).default([]),
  env: z.record(EnvValueSchema).default({}),
  ports: z.array(PortSchema).default([]),
  volumes: z.array(VolumeSchema).default([]),
  healthCheck: HealthCheckSchema.optional(),
  scaling: ScalingSchema.optional(),
  resources: z.object({
    cpuRequest: z.string().optional(),
    cpuLimit: z.string().optional(),
    memoryRequest: z.string().optional(),
    memoryLimit: z.string().optional(),
  }).default({}).optional(),
});

export const TemplateSpecSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  kind: z.enum(['single', 'multi']),
  services: z.array(TemplateServiceSpecSchema).min(1),
  inputs: z.record(z.object({
    label: z.string(),
    description: z.string().optional(),
    required: z.boolean().default(false),
    defaultValue: z.string().optional(),
    secret: z.boolean().default(false),
  })).default({}).optional(),
});

export type ServiceSource = z.infer<typeof ServiceSourceSchema>;
export type EnvValue = z.infer<typeof EnvValueSchema>;
export type TemplateServiceSpec = z.infer<typeof TemplateServiceSpecSchema>;
export type TemplateSpec = z.infer<typeof TemplateSpecSchema>;

export type ValidationIssue = { field: string; message: string };

export function parseTemplateSpec(input: unknown): TemplateSpec {
  return TemplateSpecSchema.parse(input);
}

export function validateTemplateSpec(input: unknown): { valid: true; spec: TemplateSpec } | { valid: false; errors: ValidationIssue[] } {
  const parsed = TemplateSpecSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  const errors = validateTemplateSemantics(parsed.data);
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, spec: parsed.data };
}

function validateTemplateSemantics(spec: TemplateSpec): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  const ids = spec.services.map(service => service.id);
  const names = spec.services.map(service => service.name);
  const idSet = new Set(ids);

  if (idSet.size !== ids.length) {
    errors.push({ field: 'services.id', message: 'Service IDs must be unique' });
  }
  if (new Set(names).size !== names.length) {
    errors.push({ field: 'services.name', message: 'Service names must be unique within a deployment' });
  }

  for (const service of spec.services) {
    if (service.type === 'database' && !['postgres', 'mysql', 'mongodb', 'clickhouse'].includes(service.engine)) {
      errors.push({
        field: `services.${service.id}.engine`,
        message: 'Database services must use a database engine',
      });
    }

    if (service.type === 'cache' && !['redis', 'valkey'].includes(service.engine)) {
      errors.push({
        field: `services.${service.id}.engine`,
        message: 'Cache services must use a cache engine',
      });
    }

    if ((service.type === 'web' || service.type === 'worker') && service.engine !== 'generic') {
      errors.push({
        field: `services.${service.id}.engine`,
        message: 'Application services must use the generic engine',
      });
    }

    if (service.type === 'queue' && !['rabbitmq'].includes(service.engine)) {
      errors.push({
        field: `services.${service.id}.engine`,
        message: 'Queue services must use a queue engine',
      });
    }

    for (const dependency of service.dependsOn) {
      if (!idSet.has(dependency)) {
        errors.push({
          field: `services.${service.id}.dependsOn`,
          message: `Unknown dependency "${dependency}"`,
        });
      }
    }

    for (const [key, value] of Object.entries(service.env)) {
      if ((value.kind === 'secretRef' || value.kind === 'serviceRef') && !idSet.has(value.serviceId)) {
        errors.push({
          field: `services.${service.id}.env.${key}`,
          message: `Unknown referenced service "${value.serviceId}"`,
        });
      }
      if (value.kind === 'input' && !spec.inputs?.[value.inputKey]) {
        errors.push({
          field: `services.${service.id}.env.${key}`,
          message: `Unknown deploy input "${value.inputKey}"`,
        });
      }
    }
  }

  const dag = resolveServiceLayers(spec.services);
  if (!dag.ok) errors.push({ field: 'services.dependsOn', message: dag.error });

  if (spec.kind === 'single' && spec.services.length !== 1) {
    errors.push({ field: 'kind', message: 'Single templates must define exactly one service' });
  }
  if (spec.kind === 'multi' && spec.services.length < 2) {
    errors.push({ field: 'kind', message: 'Multi-service templates must define at least two services' });
  }

  return errors;
}
