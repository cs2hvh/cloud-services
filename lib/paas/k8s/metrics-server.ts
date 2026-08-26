/**
 * metrics-server — the source of pod and node CPU/memory readings.
 *
 * WHY IT IS HAND-AUTHORED
 *
 * Upstream ships a 202-line multi-document YAML. Every other component here
 * (Traefik, the registry, the gVisor installer, the publisher Job) is a
 * TypeScript object applied through the same Server-Side Apply path, and there
 * is no YAML parser in this repo. Transcribing it keeps one apply path, one
 * place to pin the version, and no new dependency.
 *
 * PINNED, deliberately. The upstream URL is `.../releases/latest/download/`,
 * which silently changes what it serves. A cluster component that can change
 * underneath a redeploy is how you get a working platform that stops working
 * on a Tuesday for no reason visible in your own history.
 *
 * THE LKE-SPECIFIC PART
 *
 * `--kubelet-insecure-tls`. LKE kubelets serve their metrics endpoint with a
 * self-signed certificate that the cluster CA does not sign, so the default
 * verification fails and every node reports as unreachable — metrics-server
 * runs, reports healthy, and returns no metrics at all. app-deploy-3 predicted
 * exactly this before it was installed.
 *
 * This weakens verification of the metrics scrape only. It is not a tenant-
 * facing path: the connection is control-plane to kubelet, inside the cluster
 * network, and it carries CPU and memory numbers rather than credentials. It is
 * the standard flag for managed clusters that do not issue kubelet serving
 * certs, and it is written down here so nobody has to rediscover why.
 */

export const METRICS_SERVER_VERSION = "v0.9.0";
const NS = "kube-system";
const APP = { "k8s-app": "metrics-server" };

export function metricsServerServiceAccount() {
  return {
    apiVersion: "v1",
    kind: "ServiceAccount",
    metadata: { name: "metrics-server", namespace: NS, labels: APP },
  };
}

export function metricsServerAggregatedReader() {
  return {
    apiVersion: "rbac.authorization.k8s.io/v1",
    kind: "ClusterRole",
    metadata: {
      name: "system:aggregated-metrics-reader",
      labels: {
        ...APP,
        "rbac.authorization.k8s.io/aggregate-to-admin": "true",
        "rbac.authorization.k8s.io/aggregate-to-edit": "true",
        "rbac.authorization.k8s.io/aggregate-to-view": "true",
      },
    },
    rules: [
      { apiGroups: ["metrics.k8s.io"], resources: ["pods", "nodes"], verbs: ["get", "list", "watch"] },
    ],
  };
}

export function metricsServerClusterRole() {
  return {
    apiVersion: "rbac.authorization.k8s.io/v1",
    kind: "ClusterRole",
    metadata: { name: "system:metrics-server", labels: APP },
    rules: [
      // nodes/metrics is the scrape target itself. Traefik 404'd everything for
      // an afternoon because its ClusterRole was missing `nodes`; a forbidden
      // informer never syncs and the component looks healthy while doing
      // nothing. Same failure mode lives here.
      { apiGroups: [""], resources: ["nodes/metrics"], verbs: ["get"] },
      { apiGroups: [""], resources: ["pods", "nodes"], verbs: ["get", "list", "watch"] },
    ],
  };
}

export function metricsServerAuthReaderBinding() {
  return {
    apiVersion: "rbac.authorization.k8s.io/v1",
    kind: "RoleBinding",
    metadata: { name: "metrics-server-auth-reader", namespace: NS, labels: APP },
    roleRef: {
      apiGroup: "rbac.authorization.k8s.io",
      kind: "Role",
      name: "extension-apiserver-authentication-reader",
    },
    subjects: [{ kind: "ServiceAccount", name: "metrics-server", namespace: NS }],
  };
}

export function metricsServerAuthDelegatorBinding() {
  return {
    apiVersion: "rbac.authorization.k8s.io/v1",
    kind: "ClusterRoleBinding",
    metadata: { name: "metrics-server:system:auth-delegator", labels: APP },
    roleRef: {
      apiGroup: "rbac.authorization.k8s.io",
      kind: "ClusterRole",
      name: "system:auth-delegator",
    },
    subjects: [{ kind: "ServiceAccount", name: "metrics-server", namespace: NS }],
  };
}

export function metricsServerClusterRoleBinding() {
  return {
    apiVersion: "rbac.authorization.k8s.io/v1",
    kind: "ClusterRoleBinding",
    metadata: { name: "system:metrics-server", labels: APP },
    roleRef: {
      apiGroup: "rbac.authorization.k8s.io",
      kind: "ClusterRole",
      name: "system:metrics-server",
    },
    subjects: [{ kind: "ServiceAccount", name: "metrics-server", namespace: NS }],
  };
}

export function metricsServerService() {
  return {
    apiVersion: "v1",
    kind: "Service",
    metadata: { name: "metrics-server", namespace: NS, labels: APP },
    spec: {
      selector: APP,
      ports: [{ name: "https", port: 443, protocol: "TCP", targetPort: "https", appProtocol: "https" }],
    },
  };
}

export function metricsServerDeployment() {
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name: "metrics-server", namespace: NS, labels: APP },
    spec: {
      selector: { matchLabels: APP },
      strategy: { rollingUpdate: { maxUnavailable: 0 } },
      template: {
        metadata: { labels: APP },
        spec: {
          serviceAccountName: "metrics-server",
          priorityClassName: "system-cluster-critical",
          nodeSelector: { "kubernetes.io/os": "linux" },
          containers: [
            {
              name: "metrics-server",
              image: `registry.k8s.io/metrics-server/metrics-server:${METRICS_SERVER_VERSION}`,
              imagePullPolicy: "IfNotPresent",
              args: [
                "--cert-dir=/tmp",
                "--secure-port=10250",
                "--kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname",
                "--kubelet-use-node-status-port",
                "--metric-resolution=15s",
                // See the header. Without this, LKE nodes all report unreachable
                // and the component serves no metrics while looking healthy.
                "--kubelet-insecure-tls",
              ],
              ports: [{ name: "https", containerPort: 10250, protocol: "TCP" }],
              livenessProbe: {
                httpGet: { path: "/livez", port: "https", scheme: "HTTPS" },
                periodSeconds: 10,
                failureThreshold: 3,
              },
              readinessProbe: {
                httpGet: { path: "/readyz", port: "https", scheme: "HTTPS" },
                initialDelaySeconds: 20,
                periodSeconds: 10,
                failureThreshold: 3,
              },
              resources: { requests: { cpu: "100m", memory: "200Mi" } },
              securityContext: {
                allowPrivilegeEscalation: false,
                capabilities: { drop: ["ALL"] },
                readOnlyRootFilesystem: true,
                runAsNonRoot: true,
                // Numeric, always. Kubernetes rejects a named user under
                // runAsNonRoot because it cannot resolve the name to a uid.
                runAsUser: 1000,
                seccompProfile: { type: "RuntimeDefault" },
              },
              volumeMounts: [{ name: "tmp-dir", mountPath: "/tmp" }],
            },
          ],
          volumes: [{ name: "tmp-dir", emptyDir: {} }],
        },
      },
    },
  };
}

export function metricsServerApiService() {
  return {
    apiVersion: "apiregistration.k8s.io/v1",
    kind: "APIService",
    metadata: { name: "v1beta1.metrics.k8s.io", labels: APP },
    spec: {
      group: "metrics.k8s.io",
      version: "v1beta1",
      groupPriorityMinimum: 100,
      versionPriority: 100,
      insecureSkipTLSVerify: true,
      service: { name: "metrics-server", namespace: NS },
    },
  };
}
