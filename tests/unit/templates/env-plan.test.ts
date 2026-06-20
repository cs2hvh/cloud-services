import { describe, it, expect } from 'vitest';
import { planEnvironment } from '@/lib/templates/domain/env-plan';
import type { TemplateSpec } from '@/lib/templates/domain/spec-schema';

const imageSource = { kind: 'image' as const, image: 'nginx:latest', pinDigest: true };

function makeSpec(overrides: Partial<TemplateSpec> = {}): TemplateSpec {
  return {
    schemaVersion: 1,
    kind: 'single',
    services: [{
      id: 'web',
      name: 'web',
      type: 'web',
      engine: 'generic',
      source: imageSource,
      dependsOn: [],
      env: {
        PORT: { kind: 'literal', value: '3000' },
      },
      ports: [],
      volumes: [],
    }],
    ...overrides,
  };
}

describe('planEnvironment', () => {
  it('returns no errors for a literal env var', () => {
    const plan = planEnvironment(makeSpec());
    expect(plan.errors).toHaveLength(0);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({ serviceId: 'web', key: 'PORT', secret: false });
  });

  it('marks generatedSecret items as secret', () => {
    const plan = planEnvironment(makeSpec({
      services: [{
        id: 'db',
        name: 'db',
        type: 'database',
        engine: 'postgres',
        source: imageSource,
        dependsOn: [],
        env: {
          POSTGRES_PASSWORD: { kind: 'generatedSecret', length: 32 },
        },
        ports: [],
        volumes: [{ name: 'data', mountPath: '/data', sizeGb: 10 }],
      }],
    }));
    expect(plan.errors).toHaveLength(0);
    expect(plan.items[0].secret).toBe(true);
  });

  it('marks secretRef items as secret', () => {
    const plan = planEnvironment({
      schemaVersion: 1,
      kind: 'multi',
      services: [
        {
          id: 'db',
          name: 'db',
          type: 'database',
          engine: 'postgres',
          source: imageSource,
          dependsOn: [],
          env: {
            POSTGRES_PASSWORD: { kind: 'generatedSecret', length: 32 },
          },
          ports: [],
          volumes: [{ name: 'data', mountPath: '/data', sizeGb: 10 }],
        },
        {
          id: 'web',
          name: 'web',
          type: 'web',
          engine: 'generic',
          source: imageSource,
          dependsOn: ['db'],
          env: {
            DB_PASS: { kind: 'secretRef', serviceId: 'db', key: 'POSTGRES_PASSWORD' },
          },
          ports: [],
          volumes: [],
        },
      ],
    });
    expect(plan.errors).toHaveLength(0);
    const secretRefItem = plan.items.find(i => i.key === 'DB_PASS');
    expect(secretRefItem?.secret).toBe(true);
    expect(secretRefItem?.dependencies).toEqual(['db']);
  });

  it('records dependencies for serviceRef', () => {
    const plan = planEnvironment({
      schemaVersion: 1,
      kind: 'multi',
      services: [
        {
          id: 'db',
          name: 'db',
          type: 'database',
          engine: 'postgres',
          source: imageSource,
          dependsOn: [],
          env: {},
          ports: [],
          volumes: [],
        },
        {
          id: 'web',
          name: 'web',
          type: 'web',
          engine: 'generic',
          source: imageSource,
          dependsOn: ['db'],
          env: {
            DB_HOST: { kind: 'serviceRef', serviceId: 'db', field: 'privateHost' },
          },
          ports: [],
          volumes: [],
        },
      ],
    });
    expect(plan.errors).toHaveLength(0);
    const item = plan.items.find(i => i.key === 'DB_HOST');
    expect(item?.dependencies).toEqual(['db']);
    expect(item?.secret).toBe(false);
  });

  it('errors on serviceRef to unknown service', () => {
    const plan = planEnvironment(makeSpec({
      services: [{
        id: 'web',
        name: 'web',
        type: 'web',
        engine: 'generic',
        source: imageSource,
        dependsOn: [],
        env: {
          DB_HOST: { kind: 'serviceRef', serviceId: 'nonexistent', field: 'privateHost' },
        },
        ports: [],
        volumes: [],
      }],
    }));
    expect(plan.errors.length).toBeGreaterThan(0);
    expect(plan.errors[0].field).toContain('web');
  });

  it('errors on secretRef with key not defined on target service', () => {
    const plan = planEnvironment({
      schemaVersion: 1,
      kind: 'multi',
      services: [
        {
          id: 'db',
          name: 'db',
          type: 'database',
          engine: 'postgres',
          source: imageSource,
          dependsOn: [],
          env: {},
          ports: [],
          volumes: [],
        },
        {
          id: 'web',
          name: 'web',
          type: 'web',
          engine: 'generic',
          source: imageSource,
          dependsOn: ['db'],
          env: {
            DB_PASS: { kind: 'secretRef', serviceId: 'db', key: 'NONEXISTENT_KEY' },
          },
          ports: [],
          volumes: [],
        },
      ],
    });
    expect(plan.errors.length).toBeGreaterThan(0);
    expect(plan.errors[0].message).toMatch(/NONEXISTENT_KEY/);
  });

  it('extracts dependencies from computed template strings', () => {
    const plan = planEnvironment({
      schemaVersion: 1,
      kind: 'multi',
      services: [
        {
          id: 'db',
          name: 'db',
          type: 'database',
          engine: 'postgres',
          source: imageSource,
          dependsOn: [],
          env: { POSTGRES_USER: { kind: 'literal', value: 'app' } },
          ports: [],
          volumes: [],
        },
        {
          id: 'web',
          name: 'web',
          type: 'web',
          engine: 'generic',
          source: imageSource,
          dependsOn: ['db'],
          env: {
            DATABASE_URL: {
              kind: 'computed',
              template: 'postgresql://${services.db.env.POSTGRES_USER}@${services.db.privateHost}/app',
            },
          },
          ports: [],
          volumes: [],
        },
      ],
    });
    expect(plan.errors).toHaveLength(0);
    const item = plan.items.find(i => i.key === 'DATABASE_URL');
    expect(item?.dependencies).toContain('db');
  });
});
