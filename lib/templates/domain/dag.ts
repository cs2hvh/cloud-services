import type { TemplateServiceSpec, TemplateSpec } from './spec-schema';

export type DagResult =
  | { ok: true; layers: TemplateServiceSpec[][] }
  | { ok: false; error: string };

/**
 * Returns the set of service IDs that a service implicitly depends on via its env vars
 * (serviceRef, secretRef, or computed template references) — not counting self-references.
 */
export function getEnvImpliedDeps(svc: TemplateServiceSpec): Set<string> {
  const deps = new Set<string>();
  for (const value of Object.values(svc.env)) {
    if (value.kind === 'serviceRef' || value.kind === 'secretRef') {
      if (value.serviceId !== svc.id) deps.add(value.serviceId);
    } else if (value.kind === 'computed') {
      // Matches ${services.{id}.env.KEY}, ${services.{id}.privateHost}, ${services.{id}.publicUrl}
      const rx = /\$\{\s*services\.([a-z0-9-]+)\./g;
      let m: RegExpExecArray | null;
      while ((m = rx.exec(value.template))) {
        if (m[1] !== svc.id) deps.add(m[1]);
      }
    }
  }
  return deps;
}

/**
 * Returns a new spec with missing `dependsOn` entries added automatically
 * based on what each service references in its env vars.
 *
 * This ensures the DAG layer ordering is always correct even when a template
 * creator forgets to declare an explicit dependency.
 */
export function inferDependenciesFromEnv(spec: TemplateSpec): TemplateSpec {
  const validIds = new Set(spec.services.map(s => s.id));
  return {
    ...spec,
    services: spec.services.map(svc => {
      const declared = new Set(svc.dependsOn);
      const implied = getEnvImpliedDeps(svc);
      const missing = [...implied].filter(id => validIds.has(id) && !declared.has(id));
      if (missing.length === 0) return svc;
      return { ...svc, dependsOn: [...svc.dependsOn, ...missing] };
    }),
  };
}

export function resolveServiceLayers(services: TemplateServiceSpec[]): DagResult {
  const byId = new Map(services.map(service => [service.id, service]));
  const remaining = new Set(services.map(service => service.id));
  const resolved = new Set<string>();
  const layers: TemplateServiceSpec[][] = [];

  for (const service of services) {
    for (const dependency of service.dependsOn) {
      if (!byId.has(dependency)) {
        return { ok: false, error: `Service "${service.id}" depends on unknown service "${dependency}"` };
      }
    }
  }

  while (remaining.size > 0) {
    const layerIds = [...remaining].filter(id => {
      const service = byId.get(id);
      return service?.dependsOn.every(dependency => resolved.has(dependency)) ?? false;
    });

    if (layerIds.length === 0) {
      return { ok: false, error: `Dependency cycle detected among: ${[...remaining].join(', ')}` };
    }

    layers.push(layerIds.map(id => byId.get(id)!));
    for (const id of layerIds) {
      remaining.delete(id);
      resolved.add(id);
    }
  }

  return { ok: true, layers };
}
