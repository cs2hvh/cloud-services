import { describe, it, expect } from 'vitest';
import { validateTemplateSpec, parseTemplateSpec } from '@/lib/templates/domain/spec-schema';

const imageSource = { kind: 'image' as const, image: 'nginx:latest' };

const webService = {
  id: 'web',
  name: 'web',
  type: 'web' as const,
  source: imageSource,
};

const dbService = {
  id: 'db',
  name: 'db',
  type: 'database' as const,
  engine: 'postgres' as const,
  source: { kind: 'image' as const, image: 'postgres:16' },
};

describe('validateTemplateSpec', () => {
  describe('valid specs', () => {
    it('accepts a minimal single-service spec', () => {
      const result = validateTemplateSpec({
        kind: 'single',
        services: [webService],
      });
      expect(result.valid).toBe(true);
    });

    it('accepts a multi-service spec', () => {
      const result = validateTemplateSpec({
        kind: 'multi',
        services: [webService, dbService],
      });
      expect(result.valid).toBe(true);
    });

    it('accepts a spec with inputs', () => {
      const result = validateTemplateSpec({
        kind: 'single',
        services: [{
          ...webService,
          env: {
            API_KEY: { kind: 'input', inputKey: 'api_key' },
          },
        }],
        inputs: {
          api_key: { label: 'API Key', required: true },
        },
      });
      expect(result.valid).toBe(true);
    });

    it('accepts a postgres database service', () => {
      const result = validateTemplateSpec({
        kind: 'single',
        services: [dbService],
      });
      expect(result.valid).toBe(true);
    });

    it('accepts a redis cache service', () => {
      const result = validateTemplateSpec({
        kind: 'single',
        services: [{
          id: 'cache',
          name: 'cache',
          type: 'cache',
          engine: 'redis',
          source: { kind: 'image', image: 'redis:7' },
        }],
      });
      expect(result.valid).toBe(true);
    });

    it('accepts a service with dependsOn referencing another service', () => {
      const result = validateTemplateSpec({
        kind: 'multi',
        services: [
          dbService,
          { ...webService, dependsOn: ['db'] },
        ],
      });
      expect(result.valid).toBe(true);
    });

    it('accepts a generatedSecret env value', () => {
      const result = validateTemplateSpec({
        kind: 'single',
        services: [{
          ...dbService,
          env: {
            POSTGRES_PASSWORD: { kind: 'generatedSecret', length: 32 },
          },
        }],
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('semantic validation errors', () => {
    it('rejects single kind with more than one service', () => {
      const result = validateTemplateSpec({
        kind: 'single',
        services: [webService, dbService],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects multi kind with only one service', () => {
      const result = validateTemplateSpec({
        kind: 'multi',
        services: [webService],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects duplicate service IDs', () => {
      const result = validateTemplateSpec({
        kind: 'multi',
        services: [webService, { ...webService, name: 'web2' }],
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some(e => e.field === 'services.id')).toBe(true);
      }
    });

    it('rejects duplicate service names', () => {
      const result = validateTemplateSpec({
        kind: 'multi',
        services: [webService, { ...dbService, name: 'web' }],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects an unknown dependency in dependsOn', () => {
      const result = validateTemplateSpec({
        kind: 'single',
        services: [{ ...webService, dependsOn: ['nonexistent'] }],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects a database service with wrong engine', () => {
      const result = validateTemplateSpec({
        kind: 'single',
        services: [{
          id: 'db',
          name: 'db',
          type: 'database',
          engine: 'generic',
          source: imageSource,
        }],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects a cache service with wrong engine', () => {
      const result = validateTemplateSpec({
        kind: 'single',
        services: [{
          id: 'cache',
          name: 'cache',
          type: 'cache',
          engine: 'generic',
          source: imageSource,
        }],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects a web service with non-generic engine', () => {
      const result = validateTemplateSpec({
        kind: 'single',
        services: [{
          id: 'web',
          name: 'web',
          type: 'web',
          engine: 'postgres',
          source: imageSource,
        }],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects a secretRef to an unknown service', () => {
      const result = validateTemplateSpec({
        kind: 'single',
        services: [{
          ...webService,
          env: {
            DB_PASS: { kind: 'secretRef', serviceId: 'nonexistent', key: 'POSTGRES_PASSWORD' },
          },
        }],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects a serviceRef to an unknown service', () => {
      const result = validateTemplateSpec({
        kind: 'single',
        services: [{
          ...webService,
          env: {
            DB_HOST: { kind: 'serviceRef', serviceId: 'nonexistent', field: 'privateHost' },
          },
        }],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects an input env var referencing an undeclared input key', () => {
      const result = validateTemplateSpec({
        kind: 'single',
        services: [{
          ...webService,
          env: {
            MY_KEY: { kind: 'input', inputKey: 'undeclared_key' },
          },
        }],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects a cyclic dependency', () => {
      const result = validateTemplateSpec({
        kind: 'multi',
        services: [
          { ...webService, dependsOn: ['db'] },
          { id: 'db', name: 'db', type: 'database', engine: 'postgres', source: imageSource, dependsOn: ['web'] },
        ],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('schema validation errors', () => {
    it('rejects an invalid service ID format', () => {
      const result = validateTemplateSpec({
        kind: 'single',
        services: [{ ...webService, id: 'My Service!' }],
      });
      expect(result.valid).toBe(false);
    });

    it('rejects missing required fields', () => {
      const result = validateTemplateSpec({ kind: 'single' });
      expect(result.valid).toBe(false);
    });

    it('rejects a non-object input', () => {
      const result = validateTemplateSpec(null);
      expect(result.valid).toBe(false);
    });
  });
});

describe('parseTemplateSpec', () => {
  it('parses and returns a valid spec with defaults applied', () => {
    const spec = parseTemplateSpec({
      kind: 'single',
      services: [webService],
    });
    expect(spec.schemaVersion).toBe(1);
    expect(spec.services[0].engine).toBe('generic');
    expect(spec.services[0].dependsOn).toEqual([]);
    expect(spec.services[0].env).toEqual({});
    expect(spec.services[0].ports).toEqual([]);
    expect(spec.services[0].volumes).toEqual([]);
  });

  it('throws on invalid input', () => {
    expect(() => parseTemplateSpec({ kind: 'single' })).toThrow();
  });
});
