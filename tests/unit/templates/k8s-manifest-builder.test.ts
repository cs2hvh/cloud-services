import { describe, it, expect } from 'vitest';
import {
  buildSecret,
  buildK8sService,
  buildDeployment,
  buildStatefulSet,
  buildIngress,
} from '@/lib/templates/operations/k8s-manifest-builder';
import type { TemplateServiceSpec } from '@/lib/templates/domain/spec-schema';

const NAMESPACE = 'proj-abc123def456';
const PROJECT_ID = 'project-uuid-1234';

const imageSource = { kind: 'image' as const, image: 'nginx:latest', pinDigest: true };

function svc(overrides: Partial<TemplateServiceSpec> = {}): TemplateServiceSpec {
  return {
    id: 'web',
    name: 'web',
    type: 'web',
    engine: 'generic',
    source: imageSource,
    dependsOn: [],
    env: {},
    ports: [{ internal: 80, public: false, protocol: 'http', name: 'http' }],
    volumes: [],
    ...overrides,
  };
}

describe('buildSecret', () => {
  it('base64-encodes each env value', () => {
    const secret = buildSecret('my-secret', NAMESPACE, { FOO: 'bar', BAZ: 'qux' });
    expect(secret.data?.FOO).toBe(Buffer.from('bar').toString('base64'));
    expect(secret.data?.BAZ).toBe(Buffer.from('qux').toString('base64'));
  });

  it('sets the correct name and namespace', () => {
    const secret = buildSecret('test-secret', NAMESPACE, {});
    expect(secret.metadata?.name).toBe('test-secret');
    expect(secret.metadata?.namespace).toBe(NAMESPACE);
  });

  it('sets type to Opaque', () => {
    const secret = buildSecret('s', NAMESPACE, {});
    expect(secret.type).toBe('Opaque');
  });

  it('produces empty data for empty env', () => {
    const secret = buildSecret('s', NAMESPACE, {});
    expect(secret.data).toEqual({});
  });
});

describe('buildK8sService', () => {
  it('returns null when the service has no ports', () => {
    const manifest = buildK8sService(svc({ ports: [] }), NAMESPACE);
    expect(manifest).toBeNull();
  });

  it('builds a ClusterIP service manifest', () => {
    const manifest = buildK8sService(svc(), NAMESPACE);
    expect(manifest).not.toBeNull();
    expect(manifest?.spec?.type).toBe('ClusterIP');
  });

  it('sets the correct service name', () => {
    const manifest = buildK8sService(svc({ name: 'api' }), NAMESPACE);
    expect(manifest?.metadata?.name).toBe('api');
  });

  it('maps all ports', () => {
    const service = svc({
      ports: [
        { internal: 80, name: 'http', protocol: 'http', public: false },
        { internal: 443, name: 'https', protocol: 'tcp', public: true },
      ],
    });
    const manifest = buildK8sService(service, NAMESPACE);
    expect(manifest?.spec?.ports).toHaveLength(2);
    expect(manifest?.spec?.ports?.map(p => p.port)).toEqual([80, 443]);
  });

  it('uses UDP protocol for udp ports', () => {
    const service = svc({
      ports: [{ internal: 53, name: 'dns', protocol: 'udp', public: false }],
    });
    const manifest = buildK8sService(service, NAMESPACE);
    expect(manifest?.spec?.ports?.[0].protocol).toBe('UDP');
  });

  it('uses TCP protocol for http and tcp ports', () => {
    const service = svc({
      ports: [{ internal: 80, name: 'http', protocol: 'http', public: false }],
    });
    const manifest = buildK8sService(service, NAMESPACE);
    expect(manifest?.spec?.ports?.[0].protocol).toBe('TCP');
  });
});

describe('buildDeployment', () => {
  it('builds a Deployment with correct name', () => {
    const manifest = buildDeployment(svc(), NAMESPACE, PROJECT_ID, { PORT: '80' });
    expect(manifest.metadata?.name).toBe('web');
  });

  it('sets the correct image', () => {
    const manifest = buildDeployment(svc(), NAMESPACE, PROJECT_ID, {});
    const container = manifest.spec?.template?.spec?.containers?.[0];
    expect(container?.image).toBe('nginx:latest');
  });

  it('defaults to 1 replica', () => {
    const manifest = buildDeployment(svc(), NAMESPACE, PROJECT_ID, {});
    expect(manifest.spec?.replicas).toBe(1);
  });

  it('uses scaling.minReplicas for replicas', () => {
    const manifest = buildDeployment(svc({ scaling: { minReplicas: 3, maxReplicas: 5 } }), NAMESPACE, PROJECT_ID, {});
    expect(manifest.spec?.replicas).toBe(3);
  });

  it('creates secretKeyRef env vars from the resolved env', () => {
    const env = { FOO: 'bar', BAZ: 'qux' };
    const manifest = buildDeployment(svc(), NAMESPACE, PROJECT_ID, env);
    const container = manifest.spec?.template?.spec?.containers?.[0];
    const keys = container?.env?.map(e => e.name).sort();
    expect(keys).toEqual(['BAZ', 'FOO']);
    const foo = container?.env?.find(e => e.name === 'FOO');
    expect(foo?.valueFrom?.secretKeyRef?.name).toBe('web-env');
    expect(foo?.valueFrom?.secretKeyRef?.key).toBe('FOO');
  });

  it('sets imagePullPolicy to IfNotPresent when pinDigest is true', () => {
    const manifest = buildDeployment(svc({ source: { kind: 'image', image: 'nginx:latest', pinDigest: true } }), NAMESPACE, PROJECT_ID, {});
    const container = manifest.spec?.template?.spec?.containers?.[0];
    expect(container?.imagePullPolicy).toBe('IfNotPresent');
  });

  it('sets imagePullPolicy to Always when pinDigest is false', () => {
    const manifest = buildDeployment(svc({ source: { kind: 'image', image: 'nginx:latest', pinDigest: false } }), NAMESPACE, PROJECT_ID, {});
    const container = manifest.spec?.template?.spec?.containers?.[0];
    expect(container?.imagePullPolicy).toBe('Always');
  });

  it('builds a readiness probe for http healthCheck', () => {
    const service = svc({ healthCheck: { type: 'http', path: '/health', port: 80 } });
    const manifest = buildDeployment(service, NAMESPACE, PROJECT_ID, {});
    const container = manifest.spec?.template?.spec?.containers?.[0];
    expect(container?.readinessProbe?.httpGet?.path).toBe('/health');
    expect(container?.readinessProbe?.httpGet?.port).toBe(80);
  });

  it('builds a tcpSocket readiness probe for tcp healthCheck', () => {
    const service = svc({ healthCheck: { type: 'tcp', port: 5432 } });
    const manifest = buildDeployment(service, NAMESPACE, PROJECT_ID, {});
    const container = manifest.spec?.template?.spec?.containers?.[0];
    expect(container?.readinessProbe?.tcpSocket?.port).toBe(5432);
  });

  it('throws for non-image source', () => {
    const githubSvc = svc({
      source: { kind: 'github', repoUrl: 'https://github.com/user/repo', branch: 'main', rootDir: '.', buildStrategy: 'dockerfile' },
    });
    expect(() => buildDeployment(githubSvc, NAMESPACE, PROJECT_ID, {})).toThrow();
  });

  it('applies start command via sh -c', () => {
    const service = svc({ source: { kind: 'image', image: 'node:20', startCommand: 'npm start' } });
    const manifest = buildDeployment(service, NAMESPACE, PROJECT_ID, {});
    const container = manifest.spec?.template?.spec?.containers?.[0];
    expect(container?.command).toEqual(['/bin/sh', '-c', 'npm start']);
  });

  it('omits command when no startCommand', () => {
    const manifest = buildDeployment(svc(), NAMESPACE, PROJECT_ID, {});
    const container = manifest.spec?.template?.spec?.containers?.[0];
    expect(container?.command).toBeUndefined();
  });
});

describe('buildStatefulSet', () => {
  const dbSvc = svc({
    id: 'db',
    name: 'db',
    type: 'database',
    engine: 'postgres',
    volumes: [{ name: 'data', mountPath: '/var/lib/postgresql/data', sizeGb: 20 }],
  });

  it('builds a StatefulSet manifest', () => {
    const manifest = buildStatefulSet(dbSvc, NAMESPACE, PROJECT_ID, {});
    expect(manifest.metadata?.name).toBe('db');
  });

  it('includes volumeClaimTemplates for each volume', () => {
    const manifest = buildStatefulSet(dbSvc, NAMESPACE, PROJECT_ID, {});
    const vcTemplates = manifest.spec?.volumeClaimTemplates;
    expect(vcTemplates).toHaveLength(1);
    expect(vcTemplates?.[0].metadata?.name).toBe('data');
    expect(vcTemplates?.[0].spec?.resources?.requests?.storage).toBe('20Gi');
  });

  it('mounts volumes in the container', () => {
    const manifest = buildStatefulSet(dbSvc, NAMESPACE, PROJECT_ID, {});
    const mounts = manifest.spec?.template?.spec?.containers?.[0]?.volumeMounts;
    expect(mounts).toHaveLength(1);
    expect(mounts?.[0]).toMatchObject({ name: 'data', mountPath: '/var/lib/postgresql/data' });
  });

  it('throws for non-image source', () => {
    const githubDb = svc({
      source: { kind: 'github', repoUrl: 'https://github.com/user/repo', branch: 'main', rootDir: '.', buildStrategy: 'dockerfile' },
      volumes: [{ name: 'data', mountPath: '/data', sizeGb: 10 }],
    });
    expect(() => buildStatefulSet(githubDb, NAMESPACE, PROJECT_ID, {})).toThrow();
  });
});

describe('buildIngress', () => {
  const publicSvc = svc({
    name: 'api',
    ports: [{ internal: 3000, public: true, protocol: 'http', name: 'http' }],
  });

  it('returns null when the service has no public ports', () => {
    const result = buildIngress(svc({ ports: [{ internal: 80, public: false, protocol: 'http', name: 'http' }] }), NAMESPACE, 'cloud.example.com');
    expect(result).toBeNull();
  });

  it('returns null when ingressDomain is empty', () => {
    const result = buildIngress(publicSvc, NAMESPACE, '');
    expect(result).toBeNull();
  });

  it('builds an ingress with the correct host', () => {
    const result = buildIngress(publicSvc, NAMESPACE, 'cloud.example.com');
    expect(result).not.toBeNull();
    const suffix = NAMESPACE.slice(-8);
    expect(result?.host).toBe(`api-${suffix}.cloud.example.com`);
  });

  it('includes TLS configuration', () => {
    const result = buildIngress(publicSvc, NAMESPACE, 'cloud.example.com');
    expect(result?.manifest.spec?.tls).toHaveLength(1);
    expect(result?.manifest.spec?.tls?.[0].hosts?.[0]).toBe(result?.host);
  });

  it('routes traffic to the correct backend service and port', () => {
    const result = buildIngress(publicSvc, NAMESPACE, 'cloud.example.com');
    const backend = result?.manifest.spec?.rules?.[0].http?.paths?.[0].backend;
    expect(backend?.service?.name).toBe('api');
    expect(backend?.service?.port?.number).toBe(3000);
  });

  it('includes ssl-redirect annotation', () => {
    const result = buildIngress(publicSvc, NAMESPACE, 'cloud.example.com');
    expect(result?.manifest.metadata?.annotations?.['nginx.ingress.kubernetes.io/ssl-redirect']).toBe('true');
  });
});
