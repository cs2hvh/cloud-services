import type { TemplateServiceSpec } from './spec-schema';

export type DagResult =
  | { ok: true; layers: TemplateServiceSpec[][] }
  | { ok: false; error: string };

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
