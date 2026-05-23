import type { EnvValue, TemplateServiceSpec, TemplateSpec } from './spec-schema';

export type EnvPlanItem = {
  serviceId: string;
  key: string;
  value: EnvValue;
  secret: boolean;
  dependencies: string[];
};

export type EnvPlan = {
  items: EnvPlanItem[];
  errors: { field: string; message: string }[];
};

export function planEnvironment(spec: TemplateSpec): EnvPlan {
  const serviceIds = new Set(spec.services.map(service => service.id));
  const serviceEnvKeys = new Map<string, Set<string>>(
    spec.services.map(s => [s.id, new Set(Object.keys(s.env))]),
  );
  const items: EnvPlanItem[] = [];
  const errors: EnvPlan['errors'] = [];

  for (const service of spec.services) {
    for (const [key, value] of Object.entries(service.env)) {
      const dependencies = getEnvDependencies(value);
      for (const dependency of dependencies) {
        if (!serviceIds.has(dependency)) {
          errors.push({
            field: `services.${service.id}.env.${key}`,
            message: `Unknown env dependency "${dependency}"`,
          });
        }
      }

      // Validate secretRef.key exists in the referenced service's env
      if (value.kind === 'secretRef' && serviceIds.has(value.serviceId)) {
        const refKeys = serviceEnvKeys.get(value.serviceId);
        if (refKeys && !refKeys.has(value.key)) {
          errors.push({
            field: `services.${service.id}.env.${key}`,
            message: `secretRef key "${value.key}" does not exist on service "${value.serviceId}"`,
          });
        }
      }

      items.push({
        serviceId: service.id,
        key,
        value,
        secret: value.kind === 'generatedSecret' || value.kind === 'secretRef',
        dependencies,
      });
    }
  }

  return { items, errors };
}

function getEnvDependencies(value: EnvValue): string[] {
  if (value.kind === 'secretRef' || value.kind === 'serviceRef') return [value.serviceId];
  if (value.kind !== 'computed') return [];

  const dependencies = new Set<string>();
  // Match services.<id>.env.<KEY>, services.<id>.privateHost, services.<id>.publicUrl
  // The previous regex matched ".env" as a prefix which caused false positives like ".envfoo".
  const serviceRefPattern = /\$\{\s*services\.([a-z0-9-]+)\.(?:env\.[A-Za-z_][A-Za-z0-9_]*|privateHost|publicUrl)/g;
  let match: RegExpExecArray | null;
  while ((match = serviceRefPattern.exec(value.template))) {
    dependencies.add(match[1]);
  }
  return [...dependencies];
}

export function getServiceImage(service: TemplateServiceSpec): string | null {
  return service.source.kind === 'image' ? service.source.image : null;
}
