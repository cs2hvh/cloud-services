/**
 * Kubernetes manifests, as typed JSON.
 *
 * The API accepts JSON, so nothing here is ever templated into YAML or handed
 * to a shell. v1 built manifests as YAML heredocs inside generated Jenkins
 * pipeline XML, where a tenant-controlled app name reached `kubectl` through a
 * `grep` sink. Objects here are constructed from validated values, and every
 * name derives from an immutable `ref` rather than a mutable display name.
 */

export const PAAS_NAMESPACE = "ahura-system";
export const TENANT_NAMESPACE_PREFIX = "app-";

/** Every object we own carries these, so ownership is queryable and cleanup is exact. */
export function ownerLabels(extra: Record<string, string> = {}): Record<string, string> {
  return { "app.kubernetes.io/managed-by": "ahura-paas", ...extra };
}

export function namespaceManifest(name: string, labels: Record<string, string> = {}) {
  return {
    apiVersion: "v1",
    kind: "Namespace",
    metadata: { name, labels: ownerLabels(labels) },
  };
}

// ── registry ────────────────────────────────────────────────────────────────

/**
 * Docker Distribution backed by R2.
 *
 * Runs in the platform namespace, never exposed publicly. Only the in-cluster
 * publisher pushes to it; nodes pull from it over ClusterIP. A build VM has no
 * route to it at all, which is the point: v1 handed every build push
 * credentials to one shared Docker Hub namespace.
 */
export function registrySecret(accessKey: string, secretKey: string) {
  return {
    apiVersion: "v1",
    kind: "Secret",
    metadata: { name: "registry-r2", namespace: PAAS_NAMESPACE, labels: ownerLabels() },
    type: "Opaque",
    stringData: { accessKey, secretKey },
  };
}

export function registryDeployment(opts: { endpoint: string; bucket: string }) {
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name: "registry", namespace: PAAS_NAMESPACE, labels: ownerLabels({ "ahura.cloud/component": "registry" }) },
    spec: {
      replicas: 1,
      selector: { matchLabels: { "ahura.cloud/component": "registry" } },
      template: {
        metadata: { labels: ownerLabels({ "ahura.cloud/component": "registry" }) },
        spec: {
          securityContext: { runAsNonRoot: true, runAsUser: 1000, fsGroup: 1000, seccompProfile: { type: "RuntimeDefault" } },
          containers: [
            {
              name: "registry",
              image: "registry:3",
              ports: [{ containerPort: 5000, name: "http" }],
              env: [
                { name: "REGISTRY_STORAGE", value: "s3" },
                { name: "REGISTRY_STORAGE_S3_REGION", value: "auto" },
                { name: "REGISTRY_STORAGE_S3_REGIONENDPOINT", value: opts.endpoint },
                { name: "REGISTRY_STORAGE_S3_BUCKET", value: opts.bucket },
                { name: "REGISTRY_STORAGE_S3_ROOTDIRECTORY", value: "registry" },
                { name: "REGISTRY_STORAGE_S3_FORCEPATHSTYLE", value: "true" },
                { name: "REGISTRY_STORAGE_S3_CHUNKSIZE", value: "10485760" },
                {
                  name: "REGISTRY_STORAGE_S3_ACCESSKEY",
                  valueFrom: { secretKeyRef: { name: "registry-r2", key: "accessKey" } },
                },
                {
                  name: "REGISTRY_STORAGE_S3_SECRETKEY",
                  valueFrom: { secretKeyRef: { name: "registry-r2", key: "secretKey" } },
                },
                { name: "REGISTRY_HTTP_ADDR", value: ":5000" },
                // Plain HTTP inside the cluster only; nothing routes here from outside.
                { name: "REGISTRY_HTTP_SECRET", value: "ahura-in-cluster" },
              ],
              readinessProbe: { httpGet: { path: "/v2/", port: 5000 }, initialDelaySeconds: 5, periodSeconds: 5 },
              livenessProbe: { httpGet: { path: "/v2/", port: 5000 }, initialDelaySeconds: 15, periodSeconds: 20 },
              resources: { requests: { cpu: "100m", memory: "256Mi" }, limits: { cpu: "1", memory: "1Gi" } },
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: false,
                capabilities: { drop: ["ALL"] },
              },
            },
          ],
        },
      },
    },
  };
}

export function registryService() {
  return {
    apiVersion: "v1",
    kind: "Service",
    metadata: { name: "registry", namespace: PAAS_NAMESPACE, labels: ownerLabels() },
    spec: {
      selector: { "ahura.cloud/component": "registry" },
      ports: [{ name: "http", port: 5000, targetPort: 5000 }],
      type: "ClusterIP",
    },
  };
}

/**
 * Push and pull addresses differ, deliberately.
 *
 * The publisher runs inside the cluster and reaches the registry by Service
 * DNS. The kubelet does NOT: containerd resolves image hostnames using the
 * node's resolver, which cannot see *.svc.cluster.local, and it defaults to
 * HTTPS — so an in-cluster address fails with
 * "lookup registry.ahura-system.svc.cluster.local: no such host".
 *
 * A DaemonSet binds 127.0.0.1:5000 on every node and forwards to the registry
 * Service. containerd treats localhost as an insecure registry by default, so
 * the pull works over plain HTTP without touching node configuration — which
 * LKE does not let us do anyway.
 *
 * Both addresses point at the same registry, and a registry keys storage on the
 * repository path rather than the host, so an image pushed via one address
 * pulls cleanly via the other.
 */
export const REGISTRY_PUSH = `registry.${PAAS_NAMESPACE}.svc.cluster.local:5000`;
export const REGISTRY_PULL = "localhost:5000";

/** Node-local loopback proxy so the kubelet can pull from the in-cluster registry. */
export function registryProxyDaemonSet() {
  return {
    apiVersion: "apps/v1",
    kind: "DaemonSet",
    metadata: {
      name: "registry-proxy",
      namespace: PAAS_NAMESPACE,
      labels: ownerLabels({ "ahura.cloud/component": "registry-proxy" }),
    },
    spec: {
      selector: { matchLabels: { "ahura.cloud/component": "registry-proxy" } },
      template: {
        metadata: { labels: ownerLabels({ "ahura.cloud/component": "registry-proxy" }) },
        spec: {
          // Must run on every node that can host a tenant pod, including the
          // tainted runtime pool.
          tolerations: [{ operator: "Exists" }],
          containers: [
            {
              name: "socat",
              image: "alpine/socat:1.8.0.0",
              // `fork` re-resolves per connection, so the proxy survives a
              // registry pod being rescheduled to a new ClusterIP endpoint.
              args: [`TCP-LISTEN:5000,fork,reuseaddr`, `TCP:registry.${PAAS_NAMESPACE}.svc.cluster.local:5000`],
              ports: [{ name: "registry", containerPort: 5000, hostPort: 5000, hostIP: "127.0.0.1" }],
              resources: { requests: { cpu: "10m", memory: "16Mi" }, limits: { cpu: "200m", memory: "128Mi" } },
              securityContext: {
                allowPrivilegeEscalation: false,
                runAsNonRoot: true,
                runAsUser: 65532,
                capabilities: { drop: ["ALL"] },
              },
            },
          ],
        },
      },
    },
  };
}

// ── publisher job ───────────────────────────────────────────────────────────

/**
 * The trusted publisher.
 *
 * Runs IN the cluster, so it can reach the registry over ClusterIP. It receives
 * a presigned R2 GET URL valid for one object and pushes that tarball into the
 * registry. This is the seam that stops a compromised build from planting an
 * image: the build produces an artifact, something trusted decides whether it
 * becomes a runnable image.
 */
export function publisherJob(opts: {
  deploymentRef: string;
  presignedTarUrl: string;
  imageRef: string;
}) {
  const name = `pub-${opts.deploymentRef.replace(/[^a-z0-9-]/gi, "").toLowerCase().slice(0, 40)}`;
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name,
      namespace: PAAS_NAMESPACE,
      labels: ownerLabels({ "ahura.cloud/component": "publisher", "ahura.cloud/deployment": opts.deploymentRef }),
    },
    spec: {
      backoffLimit: 1,
      // Publisher pods are transient; do not accumulate them.
      ttlSecondsAfterFinished: 900,
      activeDeadlineSeconds: 900,
      template: {
        metadata: { labels: ownerLabels({ "ahura.cloud/component": "publisher" }) },
        spec: {
          restartPolicy: "Never",
          securityContext: { runAsNonRoot: true, runAsUser: 1000, fsGroup: 1000 },
          volumes: [
            { name: "work", emptyDir: { sizeLimit: "8Gi" } },
            // skopeo stages blobs here while converting; without a writable
            // /var/tmp it fails as a non-root user.
            { name: "tmp", emptyDir: { sizeLimit: "8Gi" } },
          ],
          initContainers: [
            {
              name: "fetch",
              image: "curlimages/curl:8.11.0",
              // The URL is a single-object, time-limited grant. It is passed via
              // env, not argv, so it does not appear in `ps` output.
              env: [{ name: "TAR_URL", value: opts.presignedTarUrl }],
              command: ["sh", "-c", 'curl -fsSL "$TAR_URL" -o /work/image.tar && ls -l /work/image.tar'],
              volumeMounts: [{ name: "work", mountPath: "/work" }],
              securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] } },
            },
          ],
          containers: [
            {
              name: "push",
              // skopeo, not crane: BuildKit emits an OCI-layout archive and
              // `crane push` only reads docker-archive (it fails with
              // "manifest.json not found in tar"). skopeo reads oci-archive
              // natively, and keeping the OCI format preserves multi-arch and
              // annotations for later.
              image: "quay.io/skopeo/stable:v1.16.1",
              command: [
                "skopeo",
                "copy",
                "--dest-tls-verify=false",
                "oci-archive:/work/image.tar",
                `docker://${opts.imageRef}`,
              ],
              volumeMounts: [
                { name: "work", mountPath: "/work" },
                { name: "tmp", mountPath: "/var/tmp" },
              ],
              resources: { requests: { cpu: "200m", memory: "512Mi" }, limits: { cpu: "2", memory: "2Gi" } },
              securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] } },
            },
          ],
        },
      },
    },
  };
}

// ── tenant workload ─────────────────────────────────────────────────────────

export interface AppDeploymentInput {
  /** Immutable deployment ref. Every K8s object name derives from this. */
  deploymentRef: string;
  projectRef: string;
  namespace: string;
  /** Digest-pinned. A tag would let the underlying image change beneath us. */
  image: string;
  port: number;
  replicas?: number;
  envSecretName?: string;
  cpuRequest?: string;
  cpuLimit?: string;
  memRequest?: string;
  memLimit?: string;
  /**
   * Sandbox. Defaults to gVisor: tenant code is untrusted, and three runC
   * escape CVEs in November 2025 mean a plain container is a resource
   * boundary, not a security boundary. Pass null ONLY to deliberately opt out.
   */
  runtimeClassName?: string | null;
  /** Numeric UID the image runs as. Required: Kubernetes cannot verify a named user. */
  runAsUser?: number;
  /**
   * Hash of the runtime env content, stamped onto the POD TEMPLATE.
   *
   * Kubernetes does NOT restart pods when a Secret referenced by envFrom
   * changes — those values are read once at container start. So updating the
   * Secret alone leaves the running container on its old configuration, and
   * nothing reports a problem. Changing this annotation changes the pod
   * template, which rolls the pods and actually applies the new values.
   */
  envHash?: string;
}

export function appDeployment(i: AppDeploymentInput) {
  const name = i.deploymentRef;
  const labels = ownerLabels({
    "ahura.cloud/deployment": i.deploymentRef,
    "ahura.cloud/project": i.projectRef,
  });

  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name, namespace: i.namespace, labels },
    spec: {
      replicas: i.replicas ?? 1,
      selector: { matchLabels: { "ahura.cloud/deployment": i.deploymentRef } },
      strategy: { type: "RollingUpdate", rollingUpdate: { maxUnavailable: 0, maxSurge: 1 } },
      template: {
        metadata: {
          labels,
          // Kubernetes does NOT restart pods when a Secret referenced by
          // envFrom changes — those values are read once at container start.
          // Updating the Secret alone leaves the running container on its old
          // configuration with nothing reporting a problem. Stamping the hash
          // here changes the pod template, which rolls the pods and actually
          // applies the new values.
          ...(i.envHash ? { annotations: { "ahura.cloud/env-hash": i.envHash } } : {}),
        },
        spec: {
          // Sandboxed by default. Opting out requires passing null explicitly,
          // so an omission fails safe rather than silently unsandboxing a tenant.
          ...(i.runtimeClassName === null ? {} : { runtimeClassName: i.runtimeClassName ?? "gvisor" }),
          // Tenant workloads only ever land on the tainted runtime pool.
          nodeSelector: { "ahura.cloud/pool": "runtime" },
          tolerations: [
            { key: "ahura.cloud/runtime", operator: "Equal", value: "true", effect: "NoSchedule" },
          ],
          automountServiceAccountToken: false,
          securityContext: {
            runAsNonRoot: true,
            ...(i.runAsUser ? { runAsUser: i.runAsUser, runAsGroup: i.runAsUser, fsGroup: i.runAsUser } : {}),
            seccompProfile: { type: "RuntimeDefault" },
          },
          containers: [
            {
              name: "app",
              image: i.image,
              ports: [{ containerPort: i.port, name: "http" }],
              ...(i.envSecretName ? { envFrom: [{ secretRef: { name: i.envSecretName } }] } : {}),
              env: [{ name: "PORT", value: String(i.port) }],
              resources: {
                requests: { cpu: i.cpuRequest ?? "100m", memory: i.memRequest ?? "256Mi" },
                limits: { cpu: i.cpuLimit ?? "1", memory: i.memLimit ?? "512Mi" },
              },
              // TCP probes only until a health path is actually configured.
              // v1 stored healthcheck_path and silently ignored it, so a
              // 500-ing app read as healthy — the UI claimed otherwise.
              readinessProbe: { tcpSocket: { port: i.port }, initialDelaySeconds: 5, periodSeconds: 5, failureThreshold: 6 },
              livenessProbe: { tcpSocket: { port: i.port }, initialDelaySeconds: 30, periodSeconds: 20 },
              securityContext: {
                allowPrivilegeEscalation: false,
                capabilities: { drop: ["ALL"] },
              },
            },
          ],
        },
      },
    },
  };
}

export function appService(i: {
  deploymentRef: string;
  projectRef: string;
  namespace: string;
  port: number;
  /**
   * Service name. Defaults to the project ref — one Service per project, whose
   * selector production moves.
   *
   * Pass the deployment ref to get a Service per DEPLOYMENT, which is what lets
   * two hostnames on one project serve two different builds. With only the
   * project-level Service, every alias resolves to whatever production points
   * at, so a branch preview silently serves production's build while the
   * database records that it serves its own.
   */
  name?: string;
}) {
  return {
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      name: i.name ?? i.projectRef,
      namespace: i.namespace,
      labels: ownerLabels({ "ahura.cloud/project": i.projectRef }),
    },
    spec: {
      // The selector is what promotion and rollback move. Repointing it at a
      // different deployment ref is the entire operation: one write, no
      // rebuild, no image retag.
      selector: { "ahura.cloud/deployment": i.deploymentRef },
      ports: [{ name: "http", port: 80, targetPort: i.port }],
      type: "ClusterIP",
    },
  };
}

/** Default-deny egress except DNS, so a hostile tenant cannot reach the cluster. */
export function tenantNetworkPolicy(namespace: string) {
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: { name: "tenant-isolation", namespace, labels: ownerLabels() },
    spec: {
      podSelector: {},
      policyTypes: ["Ingress", "Egress"],
      ingress: [
        // Only the platform namespace may reach tenant pods (the gateway).
        {
          from: [{ namespaceSelector: { matchLabels: { "kubernetes.io/metadata.name": PAAS_NAMESPACE } } }],
        },
      ],
      egress: [
        { to: [{ namespaceSelector: {} }], ports: [{ protocol: "UDP", port: 53 }, { protocol: "TCP", port: 53 }] },
        // Public internet, but explicitly NOT cluster-internal ranges or the
        // cloud metadata endpoint at 169.254.169.254.
        {
          to: [
            {
              ipBlock: {
                cidr: "0.0.0.0/0",
                except: ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16"],
              },
            },
          ],
        },
      ],
    },
  };
}

/**
 * Runtime environment Secret for one deployment.
 *
 * Named for the DEPLOYMENT ref, not the project: each deployment gets its own
 * immutable Secret, so rolling back to an older deployment restores the
 * configuration it was built and tested against. A single project-wide Secret
 * would mean a rollback silently ran old code against new config, which is a
 * different app than the one that was known good.
 *
 * PUBLIC-prefixed variables are deliberately EXCLUDED. Those are baked into
 * image layers as build args; injecting them again at runtime would let a
 * runtime edit silently disagree with what the bundle already contains.
 */
export function envSecret(i: {
  deploymentRef: string;
  projectRef: string;
  namespace: string;
  values: Record<string, string>;
}) {
  return {
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name: `${i.deploymentRef}-env`,
      namespace: i.namespace,
      labels: ownerLabels({
        "ahura.cloud/deployment": i.deploymentRef,
        "ahura.cloud/project": i.projectRef,
      }),
    },
    type: "Opaque",
    stringData: i.values,
  };
}

/** The Secret name a deployment's pods mount via envFrom. */
export function envSecretName(deploymentRef: string): string {
  return `${deploymentRef}-env`;
}
