/**
 * K8s primitives for a single service — no template schema dependency, no DB.
 *
 * Both single-service flows and the multi-service orchestrator call these.
 * Callers supply already-resolved env and already-loaded K8s clients.
 */
import { CoreV1Api, AppsV1Api, NetworkingV1Api } from '@kubernetes/client-node';

const PLATFORM_LABEL = 'cloud-services-platform';
const CERT_MANAGER_ISSUER = process.env.CERT_MANAGER_CLUSTER_ISSUER ?? 'letsencrypt-prod';

// ── Public types ──────────────────────────────────────────────────────────────

export type ServiceRunSpec = {
  name: string;
  namespace: string;
  projectId: string;
  image: string;
  startCommand?: string;
  port: number;
  isPublic: boolean;
  volumes: { name: string; mountPath: string; sizeGb: number }[];
  replicas?: number;
  resources?: {
    cpuRequest?: string;
    memoryRequest?: string;
    cpuLimit?: string;
    memoryLimit?: string;
  };
};

export type K8sClients = {
  core: CoreV1Api;
  apps: AppsV1Api;
  networking?: NetworkingV1Api;
};

export type ApplyResult = {
  privateHost: string;
  publicUrl: string | null;
};

// ── Core operations ───────────────────────────────────────────────────────────

/**
 * Apply (create-or-replace) all K8s resources for one service:
 * secret → ClusterIP → Deployment/StatefulSet → optional Ingress.
 */
export async function applyService(
  spec: ServiceRunSpec,
  env: Record<string, string>,
  clients: K8sClients,
  ingressDomain = process.env.INGRESS_DOMAIN ?? '',
): Promise<ApplyResult> {
  const { name, namespace } = spec;

  await applySecret(clients.core, namespace, `${name}-env`, env);
  await applyClusterIPService(clients.core, namespace, name, spec.port);

  if (spec.volumes.length > 0) {
    await applyStatefulSet(clients.apps, spec, env);
  } else {
    await applyDeployment(clients.apps, spec, env);
  }

  const privateHost = `${name}.${namespace}.svc.cluster.local`;
  let publicUrl: string | null = null;

  if (spec.isPublic && ingressDomain && clients.networking) {
    const suffix = namespace.length > 8 ? namespace.slice(-8) : namespace;
    const host = `${name}-${suffix}.${ingressDomain}`;
    await applyIngress(clients.networking, namespace, name, host, spec.port);
    publicUrl = `https://${host}`;
  }

  return { privateHost, publicUrl };
}

/**
 * Merge env updates into the service's secret and rolling-restart.
 * Preserves existing keys not included in `updates`.
 */
export async function applyEnvUpdate(
  name: string,
  namespace: string,
  updates: Record<string, string>,
  clients: K8sClients,
): Promise<void> {
  const current = await readSecretEnv(clients.core, namespace, `${name}-env`);
  await applySecret(clients.core, namespace, `${name}-env`, { ...current, ...updates });
  await rollingRestart(name, namespace, clients);
}

/**
 * Remove specific keys from the service's secret and rolling-restart.
 */
export async function removeEnvKeys(
  name: string,
  namespace: string,
  keys: string[],
  clients: K8sClients,
): Promise<void> {
  const current = await readSecretEnv(clients.core, namespace, `${name}-env`);
  const removeSet = new Set(keys);
  const remaining = Object.fromEntries(
    Object.entries(current).filter(([k]) => !removeSet.has(k)),
  );
  await applySecret(clients.core, namespace, `${name}-env`, remaining);
  await rollingRestart(name, namespace, clients);
}

/**
 * Rolling restart via the restartedAt annotation (works for Deployment and StatefulSet).
 */
export async function rollingRestart(
  name: string,
  namespace: string,
  clients: K8sClients,
): Promise<void> {
  const restartedAt = new Date().toISOString();
  if (await isStatefulSet(clients.apps, namespace, name)) {
    const existing = await clients.apps.readNamespacedStatefulSet({ name, namespace });
    const hasAnnotations = existing.spec?.template?.metadata?.annotations != null;
    const patch = hasAnnotations
      ? [{ op: 'add', path: '/spec/template/metadata/annotations/kubectl.kubernetes.io~1restartedAt', value: restartedAt }]
      : [{ op: 'add', path: '/spec/template/metadata/annotations', value: { 'kubectl.kubernetes.io/restartedAt': restartedAt } }];
    await clients.apps.patchNamespacedStatefulSet({ name, namespace, body: patch });
  } else {
    const existing = await clients.apps.readNamespacedDeployment({ name, namespace });
    const hasAnnotations = existing.spec?.template?.metadata?.annotations != null;
    const patch = hasAnnotations
      ? [{ op: 'add', path: '/spec/template/metadata/annotations/kubectl.kubernetes.io~1restartedAt', value: restartedAt }]
      : [{ op: 'add', path: '/spec/template/metadata/annotations', value: { 'kubectl.kubernetes.io/restartedAt': restartedAt } }];
    await clients.apps.patchNamespacedDeployment({ name, namespace, body: patch });
  }
}

/**
 * Patch the container image and rolling-restart.
 */
export async function patchImage(
  name: string,
  namespace: string,
  image: string,
  clients: K8sClients,
): Promise<void> {
  const patch = [{ op: 'replace', path: '/spec/template/spec/containers/0/image', value: image }];
  if (await isStatefulSet(clients.apps, namespace, name)) {
    await clients.apps.patchNamespacedStatefulSet({ name, namespace, body: patch });
  } else {
    await clients.apps.patchNamespacedDeployment({ name, namespace, body: patch });
  }
}

/**
 * Scale a stateless workload. StatefulSet scaling is intentionally rejected
 * until storage semantics are modeled explicitly.
 */
export async function scaleStatelessWorkload(
  name: string,
  namespace: string,
  replicas: number,
  clients: K8sClients,
): Promise<void> {
  if (await isStatefulSet(clients.apps, namespace, name)) {
    throw new Error('Scaling StatefulSet-backed services is not supported yet');
  }
  await clients.apps.patchNamespacedDeployment({
    name,
    namespace,
    body: [{ op: 'replace', path: '/spec/replicas', value: replicas }],
  });
}

// ── Internal K8s primitives ───────────────────────────────────────────────────

async function applySecret(
  core: CoreV1Api,
  namespace: string,
  name: string,
  env: Record<string, string>,
): Promise<void> {
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    data[k] = Buffer.from(v).toString('base64');
  }
  const manifest = {
    apiVersion: 'v1' as const,
    kind: 'Secret' as const,
    metadata: { name, namespace, labels: { 'managed-by': PLATFORM_LABEL } },
    type: 'Opaque',
    data,
  };
  try {
    await core.replaceNamespacedSecret({ name, namespace, body: manifest });
  } catch {
    await core.createNamespacedSecret({ namespace, body: manifest });
  }
}

/**
 * Read the current env vars from a K8s Secret.
 *
 * IMPORTANT: Only 404 is treated as "secret does not exist yet" and returns {}.
 * Any other error (5xx, network failure) is re-thrown so callers do NOT
 * silently overwrite secrets with partial data, which would delete existing keys.
 */
async function readSecretEnv(
  core: CoreV1Api,
  namespace: string,
  secretName: string,
): Promise<Record<string, string>> {
  try {
    const secret = await core.readNamespacedSecret({ name: secretName, namespace });
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(secret.data ?? {})) {
      result[k] = Buffer.from(v, 'base64').toString('utf8');
    }
    return result;
  } catch (err) {
    const statusCode = (err as { code?: number }).code;
    if (statusCode === 404) return {};
    // Re-throw: a K8s API error must not silently produce an empty env map,
    // because applyEnvUpdate would then overwrite the secret with only the new
    // keys, destroying all existing env vars.
    throw new Error(
      `Failed to read secret "${secretName}" in namespace "${namespace}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/**
 * Apply a ClusterIP service using replace-or-create (no delete gap).
 * Reads the current resourceVersion to satisfy K8s optimistic locking.
 */
async function applyClusterIPService(
  core: CoreV1Api,
  namespace: string,
  name: string,
  port: number,
): Promise<void> {
  const manifest = {
    apiVersion: 'v1' as const,
    kind: 'Service' as const,
    metadata: { name, namespace, labels: { app: name, 'managed-by': PLATFORM_LABEL } },
    spec: {
      selector: { app: name },
      type: 'ClusterIP',
      ports: [{ name: 'main', port, protocol: 'TCP' as const }],
    },
  };
  try {
    const existing = await core.readNamespacedService({ name, namespace });
    // Preserve clusterIP (immutable) and resourceVersion (required for replace)
    manifest.metadata = {
      ...manifest.metadata,
      resourceVersion: existing.metadata?.resourceVersion,
    } as typeof manifest.metadata;
    (manifest.spec as Record<string, unknown>).clusterIP = existing.spec?.clusterIP;
    await core.replaceNamespacedService({ name, namespace, body: manifest });
  } catch (err) {
    const statusCode = (err as { code?: number }).code;
    if (statusCode === 404) {
      await core.createNamespacedService({ namespace, body: manifest });
    } else {
      throw err;
    }
  }
}

function makeLabels(name: string, projectId: string): Record<string, string> {
  return { app: name, 'managed-by': PLATFORM_LABEL, 'project-id': projectId.slice(0, 32) };
}

function makeEnvFromSecret(secretName: string, keys: string[]) {
  return keys.map(key => ({
    name: key,
    valueFrom: { secretKeyRef: { name: `${secretName}-env`, key } },
  }));
}

function makeResources(r?: ServiceRunSpec['resources']) {
  if (!r) return undefined;
  const req: Record<string, string> = {};
  const lim: Record<string, string> = {};
  if (r.cpuRequest)    req.cpu    = r.cpuRequest;
  if (r.memoryRequest) req.memory = r.memoryRequest;
  if (r.cpuLimit)      lim.cpu    = r.cpuLimit;
  if (r.memoryLimit)   lim.memory = r.memoryLimit;
  return { requests: req, limits: lim };
}

/**
 * Apply a Deployment using replace-or-create.
 * Reading the current resource first avoids the outage window of delete+create
 * and preserves the rolling update behaviour.
 */
async function applyDeployment(
  apps: AppsV1Api,
  spec: ServiceRunSpec,
  env: Record<string, string>,
): Promise<void> {
  const { name, namespace, projectId, image, port, replicas = 1 } = spec;
  const labels = makeLabels(name, projectId);
  const manifest = {
    apiVersion: 'apps/v1' as const,
    kind: 'Deployment' as const,
    metadata: { name, namespace, labels },
    spec: {
      replicas,
      selector: { matchLabels: { app: name } },
      template: {
        metadata: { labels },
        spec: {
          securityContext: {},
          containers: [{
            name,
            image,
            imagePullPolicy: 'Always' as const,
            ...(spec.startCommand ? { command: ['/bin/sh', '-c', spec.startCommand] } : {}),
            ports: [{ containerPort: port }],
            env: makeEnvFromSecret(name, Object.keys(env)),
            resources: makeResources(spec.resources),
            securityContext: { allowPrivilegeEscalation: false },
          }],
        },
      },
    },
  };

  try {
    const existing = await apps.readNamespacedDeployment({ name, namespace });
    (manifest.metadata as Record<string, unknown>).resourceVersion =
      existing.metadata?.resourceVersion;
    await apps.replaceNamespacedDeployment({ name, namespace, body: manifest });
  } catch (err) {
    const statusCode = (err as { code?: number }).code;
    if (statusCode === 404) {
      await apps.createNamespacedDeployment({ namespace, body: manifest });
    } else {
      throw err;
    }
  }
}

/**
 * Apply a StatefulSet using replace-or-create.
 * Falls back to delete+create only when K8s rejects the update (422) due to
 * immutable fields like volumeClaimTemplates changing — an explicit choice that
 * risks data loss, logged clearly.
 */
async function applyStatefulSet(
  apps: AppsV1Api,
  spec: ServiceRunSpec,
  env: Record<string, string>,
): Promise<void> {
  const { name, namespace, projectId, image, port, volumes, replicas = 1 } = spec;
  const labels = makeLabels(name, projectId);
  const manifest = {
    apiVersion: 'apps/v1' as const,
    kind: 'StatefulSet' as const,
    metadata: { name, namespace, labels },
    spec: {
      serviceName: name,
      replicas,
      selector: { matchLabels: { app: name } },
      template: {
        metadata: { labels },
        spec: {
          securityContext: {},
          containers: [{
            name,
            image,
            imagePullPolicy: 'Always' as const,
            ...(spec.startCommand ? { command: ['/bin/sh', '-c', spec.startCommand] } : {}),
            ports: [{ containerPort: port }],
            env: makeEnvFromSecret(name, Object.keys(env)),
            resources: makeResources(spec.resources),
            securityContext: { allowPrivilegeEscalation: false },
            volumeMounts: volumes.map(v => ({ name: v.name, mountPath: v.mountPath })),
          }],
        },
      },
      volumeClaimTemplates: volumes.map(v => ({
        metadata: { name: v.name },
        spec: {
          accessModes: ['ReadWriteOnce' as const],
          resources: { requests: { storage: `${v.sizeGb}Gi` } },
        },
      })),
    },
  };

  try {
    const existing = await apps.readNamespacedStatefulSet({ name, namespace });
    (manifest.metadata as Record<string, unknown>).resourceVersion =
      existing.metadata?.resourceVersion;
    await apps.replaceNamespacedStatefulSet({ name, namespace, body: manifest });
  } catch (err) {
    const statusCode = (err as { code?: number }).code;
    if (statusCode === 404) {
      await apps.createNamespacedStatefulSet({ namespace, body: manifest });
    } else if (statusCode === 422) {
      throw new Error(
        `StatefulSet "${name}" has immutable field changes. Refusing destructive delete+create; create an explicit recreate/migration operation instead.`,
      );
    } else {
      throw err;
    }
  }
}

async function applyIngress(
  networking: NetworkingV1Api,
  namespace: string,
  name: string,
  host: string,
  port: number,
): Promise<void> {
  const ingressName = `${name}-ingress`;
  const tlsSecretName = `${name}-tls`;
  const manifest = {
    apiVersion: 'networking.k8s.io/v1' as const,
    kind: 'Ingress' as const,
    metadata: {
      name: ingressName,
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
            pathType: 'Prefix' as const,
            backend: { service: { name, port: { number: port } } },
          }],
        },
      }],
    },
  };

  try {
    const existing = await networking.readNamespacedIngress({ name: ingressName, namespace });
    (manifest.metadata as Record<string, unknown>).resourceVersion =
      existing.metadata?.resourceVersion;
    await networking.replaceNamespacedIngress({ name: ingressName, namespace, body: manifest });
  } catch (err) {
    const statusCode = (err as { code?: number }).code;
    if (statusCode === 404) {
      await networking.createNamespacedIngress({ namespace, body: manifest });
    } else {
      throw err;
    }
  }
}

/**
 * Determine whether a named workload is a StatefulSet by querying the K8s API.
 * This replaces the previous fragile pod-name regex heuristic.
 */
async function isStatefulSet(
  apps: AppsV1Api,
  namespace: string,
  name: string,
): Promise<boolean> {
  try {
    await apps.readNamespacedStatefulSet({ name, namespace });
    return true;
  } catch {
    return false;
  }
}
