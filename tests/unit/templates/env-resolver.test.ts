import { describe, it, expect } from 'vitest';
import { resolveAllEnvs } from '@/lib/templates/operations/env-resolver';
import type { TemplateSpec } from '@/lib/templates/domain/spec-schema';

const imageSource = { kind: 'image' as const, image: 'nginx:latest', pinDigest: true };
const NAMESPACE = 'proj-abc123def456';

function makeSpec(services: TemplateSpec['services'], inputs?: TemplateSpec['inputs']): TemplateSpec {
  return { schemaVersion: 1, kind: services.length === 1 ? 'single' : 'multi', services, inputs };
}

describe('resolveAllEnvs', () => {
  describe('literal values', () => {
    it('resolves a literal env var', () => {
      const spec = makeSpec([{
        id: 'web', name: 'web', type: 'web', engine: 'generic', source: imageSource,
        dependsOn: [], env: { PORT: { kind: 'literal', value: '3000' } }, ports: [], volumes: [],
      }]);
      const result = resolveAllEnvs(spec, new Map(), NAMESPACE);
      expect(result.get('web')?.PORT).toBe('3000');
    });

    it('resolves multiple literal vars', () => {
      const spec = makeSpec([{
        id: 'web', name: 'web', type: 'web', engine: 'generic', source: imageSource,
        dependsOn: [], env: {
          HOST: { kind: 'literal', value: '0.0.0.0' },
          PORT: { kind: 'literal', value: '8080' },
        }, ports: [], volumes: [],
      }]);
      const result = resolveAllEnvs(spec, new Map(), NAMESPACE);
      expect(result.get('web')?.HOST).toBe('0.0.0.0');
      expect(result.get('web')?.PORT).toBe('8080');
    });
  });

  describe('generatedSecret values', () => {
    it('generates a string of the correct length', () => {
      const spec = makeSpec([{
        id: 'db', name: 'db', type: 'database', engine: 'postgres', source: imageSource,
        dependsOn: [], env: { POSTGRES_PASSWORD: { kind: 'generatedSecret', length: 32 } },
        ports: [], volumes: [],
      }]);
      const result = resolveAllEnvs(spec, new Map(), NAMESPACE);
      expect(result.get('db')?.POSTGRES_PASSWORD).toHaveLength(32);
    });

    it('uses a pre-materialized secret when provided', () => {
      const spec = makeSpec([{
        id: 'db', name: 'db', type: 'database', engine: 'postgres', source: imageSource,
        dependsOn: [], env: { POSTGRES_PASSWORD: { kind: 'generatedSecret', length: 32 } },
        ports: [], volumes: [],
      }]);
      const secretsBySpecId = new Map([['db', { POSTGRES_PASSWORD: 'already-generated' }]]);
      const result = resolveAllEnvs(spec, new Map(), NAMESPACE, secretsBySpecId);
      expect(result.get('db')?.POSTGRES_PASSWORD).toBe('already-generated');
    });
  });

  describe('secretRef values', () => {
    it('resolves a secretRef to the generated value of another service', () => {
      const spec = makeSpec([
        {
          id: 'db', name: 'db', type: 'database', engine: 'postgres', source: imageSource,
          dependsOn: [], env: { POSTGRES_PASSWORD: { kind: 'generatedSecret', length: 32 } },
          ports: [], volumes: [],
        },
        {
          id: 'web', name: 'web', type: 'web', engine: 'generic', source: imageSource,
          dependsOn: ['db'], env: {
            DB_PASS: { kind: 'secretRef', serviceId: 'db', key: 'POSTGRES_PASSWORD' },
          }, ports: [], volumes: [],
        },
      ]);
      const secretsBySpecId = new Map([['db', { POSTGRES_PASSWORD: 'known-secret' }]]);
      const result = resolveAllEnvs(spec, new Map(), NAMESPACE, secretsBySpecId);
      expect(result.get('web')?.DB_PASS).toBe('known-secret');
    });
  });

  describe('serviceRef values', () => {
    it('resolves privateHost for a service', () => {
      const spec = makeSpec([
        {
          id: 'db', name: 'db', type: 'database', engine: 'postgres', source: imageSource,
          dependsOn: [], env: {}, ports: [], volumes: [],
        },
        {
          id: 'web', name: 'web', type: 'web', engine: 'generic', source: imageSource,
          dependsOn: ['db'], env: {
            DB_HOST: { kind: 'serviceRef', serviceId: 'db', field: 'privateHost' },
          }, ports: [], volumes: [],
        },
      ]);
      const result = resolveAllEnvs(spec, new Map(), NAMESPACE);
      expect(result.get('web')?.DB_HOST).toBe(`db.${NAMESPACE}.svc.cluster.local`);
    });

    it('resolves publicUrl from publicUrlsBySpecId', () => {
      const spec = makeSpec([
        {
          id: 'api', name: 'api', type: 'web', engine: 'generic', source: imageSource,
          dependsOn: [], env: {}, ports: [{ internal: 3000, public: true, protocol: 'http', name: 'http' }], volumes: [],
        },
        {
          id: 'web', name: 'web', type: 'web', engine: 'generic', source: imageSource,
          dependsOn: [], env: {
            API_URL: { kind: 'serviceRef', serviceId: 'api', field: 'publicUrl' },
          }, ports: [], volumes: [],
        },
      ]);
      const publicUrls = new Map([['api', 'https://api-abc123.cloud.example.com']]);
      const result = resolveAllEnvs(spec, new Map(), NAMESPACE, new Map(), publicUrls);
      expect(result.get('web')?.API_URL).toBe('https://api-abc123.cloud.example.com');
    });

    it('returns empty string for publicUrl when no public URL is mapped', () => {
      const spec = makeSpec([{
        id: 'web', name: 'web', type: 'web', engine: 'generic', source: imageSource,
        dependsOn: [], env: {
          SELF_URL: { kind: 'serviceRef', serviceId: 'web', field: 'publicUrl' },
        }, ports: [], volumes: [],
      }]);
      const result = resolveAllEnvs(spec, new Map(), NAMESPACE);
      expect(result.get('web')?.SELF_URL).toBe('');
    });
  });

  describe('input values', () => {
    it('resolves an input value from inputsBySpecId', () => {
      const spec = makeSpec([{
        id: 'web', name: 'web', type: 'web', engine: 'generic', source: imageSource,
        dependsOn: [], env: { MY_KEY: { kind: 'input', inputKey: 'api_key' } }, ports: [], volumes: [],
      }], { api_key: { label: 'API Key', required: true, secret: false } });
      const inputs = new Map([['web', { api_key: 'user-provided-key' }]]);
      const result = resolveAllEnvs(spec, inputs, NAMESPACE);
      expect(result.get('web')?.MY_KEY).toBe('user-provided-key');
    });

    it('falls back to defaultValue when no input provided', () => {
      const spec = makeSpec([{
        id: 'web', name: 'web', type: 'web', engine: 'generic', source: imageSource,
        dependsOn: [], env: {
          LOG_LEVEL: { kind: 'input', inputKey: 'log_level', defaultValue: 'info' },
        }, ports: [], volumes: [],
      }], { log_level: { label: 'Log Level', required: false, secret: false, defaultValue: 'info' } });
      const result = resolveAllEnvs(spec, new Map(), NAMESPACE);
      expect(result.get('web')?.LOG_LEVEL).toBe('info');
    });

    it('returns empty string when no input and no default', () => {
      const spec = makeSpec([{
        id: 'web', name: 'web', type: 'web', engine: 'generic', source: imageSource,
        dependsOn: [], env: { MY_KEY: { kind: 'input', inputKey: 'some_key' } }, ports: [], volumes: [],
      }], { some_key: { label: 'Key', required: false, secret: false } });
      const result = resolveAllEnvs(spec, new Map(), NAMESPACE);
      expect(result.get('web')?.MY_KEY).toBe('');
    });
  });

  describe('computed values', () => {
    it('resolves service env references in computed templates', () => {
      const spec = makeSpec([
        {
          id: 'db', name: 'db', type: 'database', engine: 'postgres', source: imageSource,
          dependsOn: [], env: { POSTGRES_USER: { kind: 'literal', value: 'app' } }, ports: [], volumes: [],
        },
        {
          id: 'web', name: 'web', type: 'web', engine: 'generic', source: imageSource,
          dependsOn: ['db'], env: {
            DATABASE_URL: {
              kind: 'computed',
              template: 'postgresql://${services.db.env.POSTGRES_USER}@${services.db.privateHost}/appdb',
            },
          }, ports: [], volumes: [],
        },
      ]);
      const result = resolveAllEnvs(spec, new Map(), NAMESPACE);
      expect(result.get('web')?.DATABASE_URL).toBe(
        `postgresql://app@db.${NAMESPACE}.svc.cluster.local/appdb`,
      );
    });

    it('resolves publicUrl in computed templates', () => {
      const spec = makeSpec([
        {
          id: 'api', name: 'api', type: 'web', engine: 'generic', source: imageSource,
          dependsOn: [], env: {}, ports: [{ internal: 3000, public: true, protocol: 'http', name: 'http' }], volumes: [],
        },
        {
          id: 'web', name: 'web', type: 'web', engine: 'generic', source: imageSource,
          dependsOn: [], env: {
            VITE_API: { kind: 'computed', template: '${services.api.publicUrl}/v1' },
          }, ports: [], volumes: [],
        },
      ]);
      const publicUrls = new Map([['api', 'https://api-abc.example.com']]);
      const result = resolveAllEnvs(spec, new Map(), NAMESPACE, new Map(), publicUrls);
      expect(result.get('web')?.VITE_API).toBe('https://api-abc.example.com/v1');
    });
  });

  describe('dependency ordering', () => {
    it('resolves services in dependency order so downstream refs are correct', () => {
      const spec = makeSpec([
        {
          id: 'web', name: 'web', type: 'web', engine: 'generic', source: imageSource,
          dependsOn: ['db'], env: {
            DB_HOST: { kind: 'serviceRef', serviceId: 'db', field: 'privateHost' },
          }, ports: [], volumes: [],
        },
        {
          id: 'db', name: 'db', type: 'database', engine: 'postgres', source: imageSource,
          dependsOn: [], env: {}, ports: [], volumes: [],
        },
      ]);
      const result = resolveAllEnvs(spec, new Map(), NAMESPACE);
      expect(result.get('web')?.DB_HOST).toBe(`db.${NAMESPACE}.svc.cluster.local`);
    });
  });
});
