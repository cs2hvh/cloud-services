/**
 * Pure functions that build typed K8s manifest objects.
 * No API calls — fully testable without a cluster.
 */
import type {
  V1Deployment, V1StatefulSet, V1Service, V1Ingress, V1Secret, V1Probe,
} from '@kubernetes/client-node';
import type { TemplateServiceSpec } from '@/lib/templates/domain/spec-schema';
import type { ResolvedEnv } from './env-resolver';

const PLATFORM_LABEL = 'cloud-services-platform';

// Annotation used by cert-manager to issue TLS certificates per ingress
const CERT_MANAGER_ISSUER = process.env.CERT_MANAGER_CLUSTER_ISSUER ?? 'letsencrypt-prod';

export function buildSecret(
  name: string,
  namespace: string,
  env: ResolvedEnv,
): V1Secret {
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    data[k] = Buffer.from(v).toString('base64');
  }
  return {
    metadata: { name, namespace, labels: { 'managed-by': PLATFORM_LABEL } },
    type: 'Opaque',
    data,
  };
}

export function buildK8sService(
  svc: TemplateServiceSpec,
  namespace: string,
): V1Service | null {
  if (svc.ports.length === 0) return null;
  return {
    metadata: { name: svc.name, namespace, labels: { app: svc.name, 'managed-by': PLATFORM_LABEL } },
    spec: {
      selector: { app: svc.name },
      type: 'ClusterIP',
      ports: svc.ports.map(p => ({
        name: p.name ?? `port-${p.internal}`,
        port: p.internal,
        protocol: p.protocol === 'udp' ? 'UDP' : 'TCP',
      })),
    },
  };
}

export function buildDeployment(
  svc: TemplateServiceSpec,
  namespace: string,
  projectId: string,
  env: ResolvedEnv,
): V1Deployment {
  if (svc.source.kind !== 'image') {
    throw new Error(`buildDeployment called for non-image source (${svc.id}): use a build stage first`);
  }
  const labels = commonLabels(svc.name, projectId);
  const readinessProbe = buildProbe(svc);
  const livenessProbe = buildLivenessProbe(svc);
  return {
    metadata: { name: svc.name, namespace, labels },
    spec: {
      replicas: svc.scaling?.minReplicas ?? 1,
      selector: { matchLabels: { app: svc.name } },
      template: {
        metadata: { labels },
        spec: {
          securityContext: {},
          containers: [{
            name: svc.name,
            image: svc.source.image,
            imagePullPolicy: svc.source.pinDigest ? 'IfNotPresent' : 'Always',
            command: buildCommand(svc.source.startCommand),
            ports: svc.ports.map(p => ({ containerPort: p.internal })),
            env: buildEnvRefs(svc.name, env),
            resources: buildResources(svc.resources),
            readinessProbe,
            livenessProbe,
            securityContext: {
              allowPrivilegeEscalation: false,
              readOnlyRootFilesystem: false,
            },
          }],
        },
      },
    },
  };
}

export function buildStatefulSet(
  svc: TemplateServiceSpec,
  namespace: string,
  projectId: string,
  env: ResolvedEnv,
): V1StatefulSet {
  if (svc.source.kind !== 'image') {
    throw new Error(`buildStatefulSet called for non-image source (${svc.id}): use a build stage first`);
  }
  const labels = commonLabels(svc.name, projectId);
  const readinessProbe = buildProbe(svc);
  const livenessProbe = buildLivenessProbe(svc);
  return {
    metadata: { name: svc.name, namespace, labels },
    spec: {
      serviceName: svc.name,
      replicas: svc.scaling?.minReplicas ?? 1,
      selector: { matchLabels: { app: svc.name } },
      template: {
        metadata: { labels },
        spec: {
          securityContext: {},
          containers: [{
            name: svc.name,
            image: svc.source.image,
            imagePullPolicy: svc.source.pinDigest ? 'IfNotPresent' : 'Always',
            command: buildCommand(svc.source.startCommand),
            ports: svc.ports.map(p => ({ containerPort: p.internal })),
            env: buildEnvRefs(svc.name, env),
            resources: buildResources(svc.resources),
            readinessProbe,
            livenessProbe,
            securityContext: {
              allowPrivilegeEscalation: false,
              readOnlyRootFilesystem: false,
            },
            volumeMounts: svc.volumes.map(v => ({ name: v.name, mountPath: v.mountPath })),
          }],
        },
      },
      volumeClaimTemplates: svc.volumes.map(v => ({
        metadata: { name: v.name },
        spec: {
          accessModes: ['ReadWriteOnce'],
          resources: { requests: { storage: `${v.sizeGb}Gi` } },
        },
      })),
    },
  };
}

export function buildIngress(
  svc: TemplateServiceSpec,
  namespace: string,
  ingressDomain: string,
): { manifest: V1Ingress; host: string } | null {
  const publicPort = svc.ports.find(p => p.public);
  if (!publicPort || !ingressDomain) return null;

  const suffix = namespace.length > 8 ? namespace.slice(-8) : namespace;
  const host = `${svc.name}-${suffix}.${ingressDomain}`;
  const tlsSecretName = `${svc.name}-tls`;

  const manifest: V1Ingress = {
    metadata: {
      name: `${svc.name}-ingress`,
      namespace,
      annotations: {
        'nginx.ingress.kubernetes.io/ssl-redirect': 'true',
        'cert-manager.io/cluster-issuer': CERT_MANAGER_ISSUER,
      },
      labels: { 'managed-by': PLATFORM_LABEL },
    },
    spec: {
      tls: [{ hosts: [host], secretName: tlsSecretName }],
      rules: [{
        host,
        http: {
          paths: [{
            path: '/',
            pathType: 'Prefix',
            backend: { service: { name: svc.name, port: { number: publicPort.internal } } },
          }],
        },
      }],
    },
  };
  return { manifest, host };
}

// ── Private helpers ───────────────────────────────────────────────────────

function commonLabels(name: string, projectId: string): Record<string, string> {
  return { app: name, 'managed-by': PLATFORM_LABEL, 'project-id': projectId.slice(0, 32) };
}

function buildEnvRefs(secretName: string, env: ResolvedEnv) {
  return Object.keys(env).map(key => ({
    name: key,
    valueFrom: { secretKeyRef: { name: `${secretName}-env`, key } },
  }));
}

function buildResources(r?: TemplateServiceSpec['resources']) {
  if (!r) return undefined;
  const requests: Record<string, string> = {};
  const limits: Record<string, string> = {};
  if (r.cpuRequest)    requests.cpu    = r.cpuRequest;
  if (r.memoryRequest) requests.memory = r.memoryRequest;
  if (r.cpuLimit)      limits.cpu      = r.cpuLimit;
  if (r.memoryLimit)   limits.memory   = r.memoryLimit;
  return { requests, limits };
}

/**
 * Build a readiness probe from the HealthCheckSchema.
 * If no healthCheck is defined, returns undefined — K8s marks the pod ready
 * immediately on container start, which is acceptable for services without
 * an explicit health endpoint.
 */
function buildProbe(svc: TemplateServiceSpec): V1Probe | undefined {
  const hc = svc.healthCheck;
  if (!hc) return undefined;

  const base: V1Probe = {
    timeoutSeconds: hc.timeoutSeconds ?? 5,
    failureThreshold: hc.maxRetries ?? 30,
    periodSeconds: hc.intervalSeconds ?? 10,
    initialDelaySeconds: 5,
  };

  if (hc.type === 'http') {
    return { ...base, httpGet: { path: hc.path!, port: hc.port } };
  }
  return { ...base, tcpSocket: { port: hc.port } };
}

/**
 * Liveness probe is intentionally more lenient than readiness:
 * higher failure threshold and longer initial delay to avoid restart loops.
 */
function buildLivenessProbe(svc: TemplateServiceSpec): V1Probe | undefined {
  const hc = svc.healthCheck;
  if (!hc) return undefined;

  const base: V1Probe = {
    timeoutSeconds: hc.timeoutSeconds ?? 5,
    failureThreshold: 5,
    periodSeconds: hc.intervalSeconds ?? 10,
    initialDelaySeconds: 15,
  };

  if (hc.type === 'http') {
    return { ...base, httpGet: { path: hc.path!, port: hc.port } };
  }
  return { ...base, tcpSocket: { port: hc.port } };
}

/**
 * Build container command from start command string.
 * Uses sh -c (no -l: skips profile loading) to run the command.
 * The command is passed as a single argument to prevent splitting issues,
 * but we intentionally do NOT execute arbitrary user input via -lc.
 */
function buildCommand(startCommand?: string): string[] | undefined {
  if (!startCommand) return undefined;
  // -c without -l: skip profile loading. The start command is from the
  // template developer (not end-user), validated at template creation time.
  return ['/bin/sh', '-c', startCommand];
}
