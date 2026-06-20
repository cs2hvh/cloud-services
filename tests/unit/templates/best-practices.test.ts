import { describe, it, expect } from 'vitest';
import { evaluateTemplateBestPractices, splitPracticeIssues } from '@/lib/templates/domain/best-practices';
import type { TemplateSpec } from '@/lib/templates/domain/spec-schema';

const imageSource = { kind: 'image' as const, image: 'nginx:latest', pinDigest: true };

function webSpec(overrides: Partial<TemplateSpec['services'][0]> = {}): TemplateSpec {
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
      env: {},
      ports: [{ internal: 80, public: true, protocol: 'http', name: 'http' }],
      volumes: [],
      ...overrides,
    }],
  };
}

function dbSpec(overrides: Partial<TemplateSpec['services'][0]> = {}): TemplateSpec {
  return {
    schemaVersion: 1,
    kind: 'single',
    services: [{
      id: 'db',
      name: 'db',
      type: 'database',
      engine: 'postgres',
      source: imageSource,
      dependsOn: [],
      env: {},
      ports: [],
      volumes: [{ name: 'data', mountPath: '/data', sizeGb: 10 }],
      ...overrides,
    }],
  };
}

describe('evaluateTemplateBestPractices', () => {
  describe('no issues for well-formed specs', () => {
    it('returns no issues for a web service with health check and env descriptions', () => {
      const issues = evaluateTemplateBestPractices(webSpec({
        healthCheck: { type: 'http', path: '/health', port: 80 },
        env: {
          PORT: { kind: 'literal', value: '80', description: 'The port the server listens on' },
        },
      }));
      expect(issues).toHaveLength(0);
    });

    it('returns no issues for a well-configured database service', () => {
      const issues = evaluateTemplateBestPractices(dbSpec({
        env: {
          POSTGRES_PASSWORD: { kind: 'generatedSecret', length: 32, description: 'DB password' },
        },
      }));
      expect(issues).toHaveLength(0);
    });
  });

  describe('stateful service rules', () => {
    it('flags a database without a volume as error', () => {
      const issues = evaluateTemplateBestPractices({
        schemaVersion: 1,
        kind: 'single',
        services: [{
          id: 'db',
          name: 'db',
          type: 'database',
          engine: 'postgres',
          source: imageSource,
          dependsOn: [],
          env: { POSTGRES_PASSWORD: { kind: 'generatedSecret', length: 32, description: 'pw' } },
          ports: [],
          volumes: [],
        }],
      });
      const codes = issues.map(i => i.code);
      expect(codes).toContain('stateful_service_missing_volume');
      const issue = issues.find(i => i.code === 'stateful_service_missing_volume');
      expect(issue?.severity).toBe('error');
    });

    it('warns when a stateful service has no auth credentials', () => {
      const issues = evaluateTemplateBestPractices(dbSpec());
      const codes = issues.map(i => i.code);
      expect(codes).toContain('stateful_service_auth_not_configured');
    });

    it('warns when a stateful service exposes a public endpoint', () => {
      const issues = evaluateTemplateBestPractices(dbSpec({
        ports: [{ internal: 5432, public: true, protocol: 'tcp', name: 'db' }],
        env: { POSTGRES_PASSWORD: { kind: 'generatedSecret', length: 32, description: 'pw' } },
      }));
      const codes = issues.map(i => i.code);
      expect(codes).toContain('stateful_service_public_endpoint');
    });
  });

  describe('web service rules', () => {
    it('warns when a public web service has no health check', () => {
      const issues = evaluateTemplateBestPractices(webSpec());
      const codes = issues.map(i => i.code);
      expect(codes).toContain('public_web_missing_healthcheck');
    });

    it('does not warn about health check for private-only web services', () => {
      const issues = evaluateTemplateBestPractices(webSpec({
        ports: [{ internal: 80, public: false, protocol: 'http', name: 'http' }],
      }));
      const codes = issues.map(i => i.code);
      expect(codes).not.toContain('public_web_missing_healthcheck');
    });
  });

  describe('env var rules', () => {
    it('flags a hardcoded secret value as error', () => {
      const issues = evaluateTemplateBestPractices(webSpec({
        env: {
          API_SECRET: { kind: 'literal', value: 'super-secret-value', description: 'Secret key' },
        },
        healthCheck: { type: 'http', path: '/health', port: 80 },
      }));
      const codes = issues.map(i => i.code);
      expect(codes).toContain('hardcoded_secret');
      const issue = issues.find(i => i.code === 'hardcoded_secret');
      expect(issue?.severity).toBe('error');
    });

    it('does not flag a hardcoded secret with empty value', () => {
      const issues = evaluateTemplateBestPractices(webSpec({
        env: {
          API_KEY: { kind: 'literal', value: '', description: 'Key' },
        },
        healthCheck: { type: 'http', path: '/health', port: 80 },
      }));
      expect(issues.find(i => i.code === 'hardcoded_secret')).toBeUndefined();
    });

    it('warns when env vars are missing descriptions', () => {
      const issues = evaluateTemplateBestPractices(webSpec({
        env: {
          PORT: { kind: 'literal', value: '80' },
        },
        healthCheck: { type: 'http', path: '/health', port: 80 },
      }));
      const codes = issues.map(i => i.code);
      expect(codes).toContain('env_missing_description');
    });

    it('warns when a serviceRef uses publicUrl', () => {
      const issues = evaluateTemplateBestPractices({
        schemaVersion: 1,
        kind: 'multi',
        services: [
          {
            id: 'api',
            name: 'api',
            type: 'web',
            engine: 'generic',
            source: imageSource,
            dependsOn: [],
            env: {},
            ports: [{ internal: 3000, public: true, protocol: 'http', name: 'http' }],
            volumes: [],
            healthCheck: { type: 'http', path: '/health', port: 3000 },
          },
          {
            id: 'web',
            name: 'web',
            type: 'web',
            engine: 'generic',
            source: imageSource,
            dependsOn: ['api'],
            env: {
              API_URL: { kind: 'serviceRef', serviceId: 'api', field: 'publicUrl', description: 'Public URL' },
            },
            ports: [{ internal: 80, public: true, protocol: 'http', name: 'http' }],
            volumes: [],
            healthCheck: { type: 'http', path: '/', port: 80 },
          },
        ],
      });
      const codes = issues.map(i => i.code);
      expect(codes).toContain('service_ref_uses_public_url');
    });
  });

  describe('input rules', () => {
    it('warns when an input has no description', () => {
      const issues = evaluateTemplateBestPractices({
        schemaVersion: 1,
        kind: 'single',
        services: [{ ...webSpec().services[0], env: {} }],
        inputs: {
          my_key: { label: 'My Key', required: true, secret: false },
        },
      });
      const codes = issues.map(i => i.code);
      expect(codes).toContain('input_missing_description');
    });

    it('does not warn when an input has a description', () => {
      const issues = evaluateTemplateBestPractices({
        schemaVersion: 1,
        kind: 'single',
        services: [{ ...webSpec().services[0], env: {}, healthCheck: { type: 'http', path: '/', port: 80 } }],
        inputs: {
          my_key: { label: 'My Key', required: true, secret: false, description: 'Your API key' },
        },
      });
      const codes = issues.map(i => i.code);
      expect(codes).not.toContain('input_missing_description');
    });
  });
});

  describe('cross-service dependency rules', () => {
    it('warns when serviceRef target is not in dependsOn', () => {
      const issues = evaluateTemplateBestPractices({
        schemaVersion: 1,
        kind: 'multi',
        services: [
          {
            id: 'db', name: 'db', type: 'database', engine: 'postgres', source: imageSource,
            dependsOn: [], env: { POSTGRES_PASSWORD: { kind: 'generatedSecret', length: 32, description: 'pw' } },
            ports: [{ internal: 5432, public: false, protocol: 'tcp', name: 'db' }],
            volumes: [{ name: 'data', mountPath: '/data', sizeGb: 10 }],
          },
          {
            id: 'app', name: 'app', type: 'web', engine: 'generic', source: imageSource,
            dependsOn: [],  // missing 'db'
            env: { DB_HOST: { kind: 'serviceRef', serviceId: 'db', field: 'privateHost', description: 'db dns' } },
            ports: [{ internal: 3000, public: true, protocol: 'http', name: 'http' }],
            volumes: [],
            healthCheck: { type: 'http', path: '/health', port: 3000 },
          },
        ],
      });
      const codes = issues.map(i => i.code);
      expect(codes).toContain('env_ref_missing_dependency');
      const issue = issues.find(i => i.code === 'env_ref_missing_dependency');
      expect(issue?.severity).toBe('warning');
    });

    it('does not warn when serviceRef target IS in dependsOn', () => {
      const issues = evaluateTemplateBestPractices({
        schemaVersion: 1,
        kind: 'multi',
        services: [
          {
            id: 'db', name: 'db', type: 'database', engine: 'postgres', source: imageSource,
            dependsOn: [], env: { POSTGRES_PASSWORD: { kind: 'generatedSecret', length: 32, description: 'pw' } },
            ports: [{ internal: 5432, public: false, protocol: 'tcp', name: 'db' }],
            volumes: [{ name: 'data', mountPath: '/data', sizeGb: 10 }],
          },
          {
            id: 'app', name: 'app', type: 'web', engine: 'generic', source: imageSource,
            dependsOn: ['db'],  // correctly declared
            env: { DB_HOST: { kind: 'serviceRef', serviceId: 'db', field: 'privateHost', description: 'db dns' } },
            ports: [{ internal: 3000, public: true, protocol: 'http', name: 'http' }],
            volumes: [],
            healthCheck: { type: 'http', path: '/health', port: 3000 },
          },
        ],
      });
      const codes = issues.map(i => i.code);
      expect(codes).not.toContain('env_ref_missing_dependency');
    });

    it('errors when a service referenced via privateHost has no ports', () => {
      const issues = evaluateTemplateBestPractices({
        schemaVersion: 1,
        kind: 'multi',
        services: [
          {
            id: 'db', name: 'db', type: 'database', engine: 'postgres', source: imageSource,
            dependsOn: [], env: { POSTGRES_PASSWORD: { kind: 'generatedSecret', length: 32, description: 'pw' } },
            ports: [],  // no ports — K8s ClusterIP Service won't be created
            volumes: [{ name: 'data', mountPath: '/data', sizeGb: 10 }],
          },
          {
            id: 'app', name: 'app', type: 'web', engine: 'generic', source: imageSource,
            dependsOn: ['db'],
            env: { DB_HOST: { kind: 'serviceRef', serviceId: 'db', field: 'privateHost', description: 'dns' } },
            ports: [{ internal: 3000, public: true, protocol: 'http', name: 'http' }],
            volumes: [],
            healthCheck: { type: 'http', path: '/', port: 3000 },
          },
        ],
      });
      const codes = issues.map(i => i.code);
      expect(codes).toContain('referenced_service_no_ports');
      const issue = issues.find(i => i.code === 'referenced_service_no_ports');
      expect(issue?.severity).toBe('error');
    });

    it('does not error when referenced-via-privateHost service has ports', () => {
      const issues = evaluateTemplateBestPractices({
        schemaVersion: 1,
        kind: 'multi',
        services: [
          {
            id: 'db', name: 'db', type: 'database', engine: 'postgres', source: imageSource,
            dependsOn: [], env: { POSTGRES_PASSWORD: { kind: 'generatedSecret', length: 32, description: 'pw' } },
            ports: [{ internal: 5432, public: false, protocol: 'tcp', name: 'db' }],
            volumes: [{ name: 'data', mountPath: '/data', sizeGb: 10 }],
          },
          {
            id: 'app', name: 'app', type: 'web', engine: 'generic', source: imageSource,
            dependsOn: ['db'],
            env: { DB_HOST: { kind: 'serviceRef', serviceId: 'db', field: 'privateHost', description: 'dns' } },
            ports: [{ internal: 3000, public: true, protocol: 'http', name: 'http' }],
            volumes: [],
            healthCheck: { type: 'http', path: '/', port: 3000 },
          },
        ],
      });
      const codes = issues.map(i => i.code);
      expect(codes).not.toContain('referenced_service_no_ports');
    });

    it('warns for secretRef target missing from dependsOn', () => {
      const issues = evaluateTemplateBestPractices({
        schemaVersion: 1,
        kind: 'multi',
        services: [
          {
            id: 'db', name: 'db', type: 'database', engine: 'postgres', source: imageSource,
            dependsOn: [], env: { POSTGRES_PASSWORD: { kind: 'generatedSecret', length: 32, description: 'pw' } },
            ports: [{ internal: 5432, public: false, protocol: 'tcp', name: 'db' }],
            volumes: [{ name: 'data', mountPath: '/data', sizeGb: 10 }],
          },
          {
            id: 'app', name: 'app', type: 'web', engine: 'generic', source: imageSource,
            dependsOn: [],  // missing 'db'
            env: { DB_PASS: { kind: 'secretRef', serviceId: 'db', key: 'POSTGRES_PASSWORD', description: 'pass' } },
            ports: [],
            volumes: [],
          },
        ],
      });
      const codes = issues.map(i => i.code);
      expect(codes).toContain('env_ref_missing_dependency');
    });
  });

describe('splitPracticeIssues', () => {
  it('separates errors from warnings', () => {
    const issues = [
      { code: 'a', severity: 'error' as const, field: 'x', message: 'err' },
      { code: 'b', severity: 'warning' as const, field: 'y', message: 'warn' },
      { code: 'c', severity: 'error' as const, field: 'z', message: 'err2' },
    ];
    const { errors, warnings } = splitPracticeIssues(issues);
    expect(errors).toHaveLength(2);
    expect(warnings).toHaveLength(1);
  });

  it('returns empty arrays when no issues', () => {
    const { errors, warnings } = splitPracticeIssues([]);
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });
});
