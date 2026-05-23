/**
 * Pure domain logic for resolving template env values at deploy time.
 * No I/O — fully testable without K8s or Supabase.
 */
import type { TemplateSpec, EnvValue } from '@/lib/templates/domain/spec-schema';
import { resolveServiceLayers } from '@/lib/templates/domain/dag';
import { generateTemplateSecret } from '@/lib/templates/domain/secrets';

export type ResolvedEnv = Record<string, string>;

/**
 * User-supplied input values keyed by template input key.
 * Comes from service_env_vars rows where value_type = 'input'.
 */
export type InputValues = Record<string, string>;

/**
 * Resolve all env vars for every service in the spec.
 *
 * @param spec           The template spec (defines what each env var should be)
 * @param inputsBySpecId Map of specServiceId → { inputKey: userValue } for 'input' kind vars
 * @param namespace      K8s namespace (used for privateHost resolution)
 * @returns              Map of specServiceId → resolved env record
 */
export function resolveAllEnvs(
  spec: TemplateSpec,
  inputsBySpecId: Map<string, InputValues>,
  namespace: string,
  secretsBySpecId: Map<string, Record<string, string>> = new Map(),
  publicUrlsBySpecId: Map<string, string> = new Map(),
): Map<string, ResolvedEnv> {
  const serviceNameById = new Map(spec.services.map(s => [s.id, s.name]));

  // Pass 1: generate all secrets up-front so secretRefs can be resolved cross-service
  const generatedSecrets = new Map<string, Map<string, string>>();
  for (const svc of spec.services) {
    const secrets = new Map<string, string>();
    const materialized = secretsBySpecId.get(svc.id) ?? {};
    for (const [key, value] of Object.entries(svc.env)) {
      if (value.kind === 'generatedSecret') {
        const existing = materialized[key];
        if (existing) {
          secrets.set(key, existing);
        } else {
          const len = value.length ?? 32;
          secrets.set(key, generateTemplateSecret(len, value.alphabet));
        }
      }
    }
    generatedSecrets.set(svc.id, secrets);
  }

  // Pass 2: resolve in dependency order so serviceRef / computed lookups see complete values
  const dagResult = resolveServiceLayers(spec.services);
  const ordered = dagResult.ok ? dagResult.layers.flat() : spec.services;

  const result = new Map<string, ResolvedEnv>();
  for (const svc of ordered) {
    const resolved: ResolvedEnv = {};
    const inputs = inputsBySpecId.get(svc.id) ?? {};
    for (const [key, value] of Object.entries(svc.env)) {
      resolved[key] = resolveValue(value, svc.id, key, {
        generatedSecrets,
        serviceNameById,
        resolved: result,
        namespace,
        inputs,
        publicUrlsBySpecId,
      });
    }
    result.set(svc.id, resolved);
  }

  return result;
}

type ResolveCtx = {
  generatedSecrets: Map<string, Map<string, string>>;
  serviceNameById: Map<string, string>;
  resolved: Map<string, ResolvedEnv>;
  namespace: string;
  inputs: InputValues;
  publicUrlsBySpecId: Map<string, string>;
};

function resolveValue(value: EnvValue, serviceId: string, key: string, ctx: ResolveCtx): string {
  switch (value.kind) {
    case 'literal':
      return value.value;

    case 'generatedSecret':
      return ctx.generatedSecrets.get(serviceId)?.get(key) ?? '';

    case 'secretRef':
      return ctx.generatedSecrets.get(value.serviceId)?.get(value.key) ?? '';

    case 'serviceRef': {
      const name = ctx.serviceNameById.get(value.serviceId) ?? value.serviceId;
      if (value.field === 'privateHost') {
        return `${name}.${ctx.namespace}.svc.cluster.local`;
      }
      return ctx.publicUrlsBySpecId.get(value.serviceId) ?? '';
    }

    case 'computed': {
      return value.template
        .replace(/\$\{\s*services\.([a-z0-9-]+)\.env\.([A-Z0-9_]+)\s*\}/g,
          (_m, svcId: string, envKey: string) => ctx.resolved.get(svcId)?.[envKey] ?? '')
        .replace(/\$\{\s*services\.([a-z0-9-]+)\.privateHost\s*\}/g,
          (_m, svcId: string) => {
            const name = ctx.serviceNameById.get(svcId) ?? svcId;
            return `${name}.${ctx.namespace}.svc.cluster.local`;
          })
        .replace(/\$\{\s*services\.([a-z0-9-]+)\.publicUrl\s*\}/g,
          (_m, svcId: string) => ctx.publicUrlsBySpecId.get(svcId) ?? '');
    }

    case 'input':
      return ctx.inputs[value.inputKey] ?? value.defaultValue ?? '';

    default:
      return '';
  }
}
