import { describe, it, expect } from 'vitest';
import { resolveServiceLayers, inferDependenciesFromEnv } from '@/lib/templates/domain/dag';
import type { TemplateServiceSpec, TemplateSpec } from '@/lib/templates/domain/spec-schema';

const imageSource = { kind: 'image' as const, image: 'nginx:latest', pinDigest: true };

function svc(id: string, dependsOn: string[] = []): TemplateServiceSpec {
  return {
    id,
    name: id,
    type: 'web',
    engine: 'generic',
    source: imageSource,
    dependsOn,
    env: {},
    ports: [],
    volumes: [],
  };
}

describe('resolveServiceLayers', () => {
  it('returns empty layers for empty input', () => {
    const result = resolveServiceLayers([]);
    expect(result).toEqual({ ok: true, layers: [] });
  });

  it('puts a single service in one layer', () => {
    const result = resolveServiceLayers([svc('web')]);
    expect(result).toEqual({ ok: true, layers: [[svc('web')]] });
  });

  it('puts parallel independent services in one layer', () => {
    const services = [svc('api'), svc('worker'), svc('db')];
    const result = resolveServiceLayers(services);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.layers).toHaveLength(1);
      expect(result.layers[0]).toHaveLength(3);
    }
  });

  it('sequences a linear dependency chain into separate layers', () => {
    const services = [svc('api', ['db']), svc('db')];
    const result = resolveServiceLayers(services);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.layers).toHaveLength(2);
      expect(result.layers[0].map(s => s.id)).toEqual(['db']);
      expect(result.layers[1].map(s => s.id)).toEqual(['api']);
    }
  });

  it('handles a diamond dependency (A→B, A→C, B→D, C→D)', () => {
    const services = [svc('b', ['d']), svc('c', ['d']), svc('a', ['b', 'c']), svc('d')];
    const result = resolveServiceLayers(services);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.layers).toHaveLength(3);
      expect(result.layers[0].map(s => s.id)).toEqual(['d']);
      const layer1Ids = result.layers[1].map(s => s.id).sort();
      expect(layer1Ids).toEqual(['b', 'c']);
      expect(result.layers[2].map(s => s.id)).toEqual(['a']);
    }
  });

  it('detects a direct cycle', () => {
    const services = [svc('a', ['b']), svc('b', ['a'])];
    const result = resolveServiceLayers(services);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/cycle/i);
    }
  });

  it('detects a self-dependency', () => {
    const services = [svc('a', ['a'])];
    const result = resolveServiceLayers(services);
    expect(result.ok).toBe(false);
  });

  it('returns an error for an unknown dependency', () => {
    const services = [svc('a', ['missing'])];
    const result = resolveServiceLayers(services);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/missing/);
    }
  });

  it('handles a 3-tier architecture (db → api → frontend)', () => {
    const services = [svc('db'), svc('api', ['db']), svc('frontend', ['api'])];
    const result = resolveServiceLayers(services);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.layers.map(layer => layer.map(s => s.id))).toEqual([
        ['db'],
        ['api'],
        ['frontend'],
      ]);
    }
  });
});

// ── inferDependenciesFromEnv ───────────────────────────────────────────────

function makeSpec(overrides: Partial<TemplateSpec> & { services: TemplateServiceSpec[] }): TemplateSpec {
  return { schemaVersion: 1, kind: overrides.services.length > 1 ? 'multi' : 'single', ...overrides };
}

const imgSrc = { kind: 'image' as const, image: 'nginx:latest', pinDigest: true };

function webSvc(id: string, env: TemplateServiceSpec['env'] = {}, dependsOn: string[] = []): TemplateServiceSpec {
  return { id, name: id, type: 'web', engine: 'generic', source: imgSrc, dependsOn, env, ports: [], volumes: [] };
}

function dbSvc(id: string, dependsOn: string[] = []): TemplateServiceSpec {
  return {
    id, name: id, type: 'database', engine: 'postgres', source: imgSrc, dependsOn,
    env: { POSTGRES_PASSWORD: { kind: 'generatedSecret', length: 32 } },
    ports: [{ internal: 5432, public: false, protocol: 'tcp', name: 'db' }],
    volumes: [{ name: 'data', mountPath: '/var/lib/postgresql/data', sizeGb: 10 }],
  };
}

describe('inferDependenciesFromEnv', () => {
  it('adds missing dep when serviceRef references a service not in dependsOn', () => {
    const spec = makeSpec({
      services: [
        dbSvc('db'),
        webSvc('app', {
          DB_HOST: { kind: 'serviceRef', serviceId: 'db', field: 'privateHost' },
        }),
        // app.dependsOn is [] — missing 'db'
      ],
    });
    const result = inferDependenciesFromEnv(spec);
    expect(result.services.find(s => s.id === 'app')!.dependsOn).toContain('db');
  });

  it('does not duplicate deps already declared', () => {
    const spec = makeSpec({
      services: [
        dbSvc('db'),
        webSvc('app', {
          DB_HOST: { kind: 'serviceRef', serviceId: 'db', field: 'privateHost' },
        }, ['db']),
      ],
    });
    const result = inferDependenciesFromEnv(spec);
    const appDeps = result.services.find(s => s.id === 'app')!.dependsOn;
    expect(appDeps.filter(d => d === 'db')).toHaveLength(1);
  });

  it('infers dep from secretRef', () => {
    const spec = makeSpec({
      services: [
        dbSvc('db'),
        webSvc('app', {
          DB_PASS: { kind: 'secretRef', serviceId: 'db', key: 'POSTGRES_PASSWORD' },
        }),
      ],
    });
    const result = inferDependenciesFromEnv(spec);
    expect(result.services.find(s => s.id === 'app')!.dependsOn).toContain('db');
  });

  it('infers dep from computed template referencing another service', () => {
    const spec = makeSpec({
      services: [
        dbSvc('db'),
        webSvc('app', {
          DATABASE_URL: { kind: 'computed', template: 'postgresql://postgres@${services.db.privateHost}/mydb' },
        }),
      ],
    });
    const result = inferDependenciesFromEnv(spec);
    expect(result.services.find(s => s.id === 'app')!.dependsOn).toContain('db');
  });

  it('does not add self as a dependency', () => {
    const spec = makeSpec({
      services: [
        webSvc('app', {
          SELF: { kind: 'serviceRef', serviceId: 'app', field: 'publicUrl' },
        }),
      ],
    });
    const result = inferDependenciesFromEnv(spec);
    expect(result.services[0].dependsOn).not.toContain('app');
  });

  it('returns same spec object when no changes needed', () => {
    const spec = makeSpec({
      services: [
        dbSvc('db'),
        webSvc('app', {
          DB_HOST: { kind: 'serviceRef', serviceId: 'db', field: 'privateHost' },
        }, ['db']),
      ],
    });
    const result = inferDependenciesFromEnv(spec);
    // app service should be the same reference
    expect(result.services.find(s => s.id === 'app')).toBe(spec.services.find(s => s.id === 'app'));
  });

  it('infers multi-hop deps in a 3-service chain', () => {
    const spec = makeSpec({
      services: [
        dbSvc('db'),
        webSvc('api', { DB_HOST: { kind: 'serviceRef', serviceId: 'db', field: 'privateHost' } }),
        webSvc('frontend', { API_URL: { kind: 'serviceRef', serviceId: 'api', field: 'publicUrl' } }),
      ],
    });
    const result = inferDependenciesFromEnv(spec);
    expect(result.services.find(s => s.id === 'api')!.dependsOn).toContain('db');
    expect(result.services.find(s => s.id === 'frontend')!.dependsOn).toContain('api');
    // After inference the layers should be db → api → frontend
    const dag = resolveServiceLayers(result.services);
    expect(dag.ok).toBe(true);
    if (dag.ok) {
      expect(dag.layers.map(l => l.map(s => s.id))).toEqual([['db'], ['api'], ['frontend']]);
    }
  });
});
