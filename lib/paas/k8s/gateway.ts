/**
 * The edge gateway: Traefik v3, driven by plain Kubernetes Ingress.
 *
 * WHY TRAEFIK AND NOT THE OBVIOUS ALTERNATIVES
 *
 *   - ingress-nginx is RETIRED. Its repository was archived read-only on
 *     2026-03-24 and receives no further security patches. Building on it now
 *     would be adopting an unmaintained component on day one.
 *   - Envoy Gateway is the architecture's long-term choice, but it is driven by
 *     Gateway API CRDs. Traefik reads the built-in `networking.k8s.io/v1`
 *     Ingress type, so the whole gateway installs as ordinary JSON objects with
 *     no CRDs and no Helm — which matters because this control plane speaks to
 *     the API directly and never shells out to kubectl.
 *
 * Traefik also reads Gateway API when the CRDs are present, so moving to
 * Gateway API later is a configuration change rather than a replacement.
 *
 * TLS: Cloudflare terminates public TLS at its edge, and the zone is on Full
 * (Strict) — verified empirically, a self-signed origin returned HTTP 526. The
 * origin therefore serves a Cloudflare Origin CA certificate covering
 * ahurasense.com and *.ahurasense.com — ONE cert for every app and preview.
 * Deliberately NOT doing per-app ACME here: issuing one certificate per app on a
 * shared apex is exactly what capped v1 at roughly 50 new apps a week.
 */

import { PAAS_NAMESPACE, ownerLabels } from "./manifests.ts";

const NAME = "traefik";

/** The middleware's name in Traefik's file provider. */
export const TENANT_RATELIMIT_NAME = "tenant-ratelimit";

/**
 * Router reference for the per-tenant rate limit.
 *
 * The `@file` suffix is the PROVIDER QUALIFIER and is not optional. Without it
 * Traefik looks in the Kubernetes CRD provider — which is not enabled here — and
 * a router referencing a middleware that does not resolve simply has no
 * middleware. No error, no limit, no difference visible on the object.
 *
 * A named constant because the manifest and its test must agree on the exact
 * string. Two literals is a rename waiting to detach the limit from every route
 * while both sides still look correct.
 */
export const TENANT_RATELIMIT_MIDDLEWARE = `${TENANT_RATELIMIT_NAME}@file`;

/** Requests per second per client, and the burst allowed above it. */
export const TENANT_RATELIMIT_AVERAGE = 50;
export const TENANT_RATELIMIT_BURST = 100;

export function gatewayServiceAccount() {
  return {
    apiVersion: "v1",
    kind: "ServiceAccount",
    metadata: { name: NAME, namespace: PAAS_NAMESPACE, labels: ownerLabels() },
  };
}

/** Read-only across the cluster: the gateway observes, it never mutates. */
export function gatewayClusterRole() {
  return {
    apiVersion: "rbac.authorization.k8s.io/v1",
    kind: "ClusterRole",
    metadata: { name: "ahura-traefik", labels: ownerLabels() },
    rules: [
      {
        apiGroups: [""],
        // `nodes` and `namespaces` are not optional, despite the gateway never
        // needing to act on them directly: Traefik starts informers for both,
        // and a forbidden informer never syncs, which silently prevents it from
        // processing ANY Ingress. The symptom is a healthy pod answering 404 for
        // every host, with the real cause only visible in its logs.
        resources: ["services", "endpoints", "secrets", "nodes", "namespaces"],
        verbs: ["get", "list", "watch"],
      },
      {
        apiGroups: ["discovery.k8s.io"],
        resources: ["endpointslices"],
        verbs: ["get", "list", "watch"],
      },
      {
        apiGroups: ["networking.k8s.io"],
        resources: ["ingresses", "ingressclasses"],
        verbs: ["get", "list", "watch"],
      },
      {
        apiGroups: ["networking.k8s.io"],
        resources: ["ingresses/status"],
        verbs: ["update"],
      },
    ],
  };
}

export function gatewayClusterRoleBinding() {
  return {
    apiVersion: "rbac.authorization.k8s.io/v1",
    kind: "ClusterRoleBinding",
    metadata: { name: "ahura-traefik", labels: ownerLabels() },
    roleRef: { apiGroup: "rbac.authorization.k8s.io", kind: "ClusterRole", name: "ahura-traefik" },
    subjects: [{ kind: "ServiceAccount", name: NAME, namespace: PAAS_NAMESPACE }],
  };
}

/**
 * The platform's origin certificate — a Cloudflare Origin CA cert covering
 * `ahurasense.com` and `*.ahurasense.com`.
 *
 * Cloudflare's zone is on Full (Strict), which rejects a self-signed origin
 * with HTTP 526. An Origin CA certificate is trusted by Cloudflare
 * specifically, is free, and lasts up to 15 years.
 *
 * ONE certificate serves every app and preview hostname. That is the whole
 * point: v1 issued one Let's Encrypt certificate per app on a shared apex,
 * which capped growth at roughly 50 new apps a week.
 *
 * It lives ONLY in the platform namespace. Copying a wildcard private key into
 * every tenant namespace — which is what Ingress `spec.tls` would require —
 * would put the platform's key one container escape away from a tenant.
 */
export function gatewayTlsSecret(certPem: string, keyPem: string) {
  return {
    apiVersion: "v1",
    kind: "Secret",
    metadata: { name: "origin-cert", namespace: PAAS_NAMESPACE, labels: ownerLabels() },
    type: "kubernetes.io/tls",
    stringData: { "tls.crt": certPem, "tls.key": keyPem },
  };
}

/**
 * Traefik file-provider config: the default certificate AND the tenant rate
 * limit.
 *
 * BOTH KEYS BELONG HERE. The rate limit was first applied by editing this
 * ConfigMap in the cluster by hand, which works exactly once — the next
 * `install-gateway.ts --apply` regenerates the object from this function and
 * would have removed the middleware from every route on the platform. Nothing
 * would have failed: the routers keep their annotation, the reference stops
 * resolving, and an unresolved middleware is silently no middleware.
 *
 * That is the same defect shape as everything else on this project, arriving
 * through the installer rather than through the code: an object that is correct
 * until something regenerates it from a source that never knew about the change.
 */
export function gatewayTlsConfigMap() {
  return {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: { name: "traefik-tls", namespace: PAAS_NAMESPACE, labels: ownerLabels() },
    data: {
      "tls.yml": [
        "tls:",
        "  stores:",
        "    default:",
        "      defaultCertificate:",
        "        certFile: /certs/tls.crt",
        "        keyFile: /certs/tls.key",
        "",
      ].join("\n"),
      "middlewares.yml": [
        "# Per-tenant inbound rate limit. Generated — edit gateway.ts, not the cluster.",
        "#",
        "# SOURCE IDENTIFICATION IS THE PART THAT MATTERS. Behind Cloudflare the",
        "# socket peer is always a Cloudflare edge address, so limiting on it would",
        "# put every visitor of every tenant in ONE bucket and let a single busy app",
        "# throttle the whole platform — a rate limiter causing the outage it exists",
        "# to prevent. CF-Connecting-IP is the real client.",
        "#",
        "# Bypass, stated rather than hidden: a request arriving DIRECTLY at the",
        "# origin IP carries no CF-Connecting-IP and shares one bucket with every",
        "# other such request. The complementary control is restricting the origin",
        "# to Cloudflare's ranges. Not done yet.",
        "#",
        "# This bounds traffic INTO an app. It does nothing about a tenant running a",
        "# miner or a spam relay, which is outbound and never passes through here.",
        "http:",
        "  middlewares:",
        `    ${TENANT_RATELIMIT_NAME}:`,
        "      rateLimit:",
        `        average: ${TENANT_RATELIMIT_AVERAGE}`,
        `        burst: ${TENANT_RATELIMIT_BURST}`,
        "        period: 1s",
        "        sourceCriterion:",
        "          requestHeaderName: CF-Connecting-IP",
        "",
      ].join("\n"),
    },
  };
}

export function gatewayIngressClass() {
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "IngressClass",
    metadata: {
      name: "ahura",
      labels: ownerLabels(),
      annotations: { "ingressclass.kubernetes.io/is-default-class": "true" },
    },
    spec: { controller: "traefik.io/ingress-controller" },
  };
}

export function gatewayDeployment(replicas = 1) {
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      name: NAME,
      namespace: PAAS_NAMESPACE,
      labels: ownerLabels({ "ahura.cloud/component": "gateway" }),
    },
    spec: {
      replicas,
      selector: { matchLabels: { "ahura.cloud/component": "gateway" } },
      template: {
        metadata: { labels: ownerLabels({ "ahura.cloud/component": "gateway" }) },
        spec: {
          serviceAccountName: NAME,
          // Platform component: system pool only, never the tenant pool.
          nodeSelector: { "ahura.cloud/pool": "system" },
          securityContext: { runAsNonRoot: true, runAsUser: 65532, fsGroup: 65532 },
          containers: [
            {
              name: NAME,
              image: "traefik:v3.2",
              args: [
                "--global.checknewversion=false",
                "--global.sendanonymoususage=false",
                "--ping=true",
                "--log.level=INFO",
                "--accesslog=true",
                "--entrypoints.web.address=:8000",
                "--entrypoints.websecure.address=:8443",
                // Terminate TLS on websecure using the default certificate store.
                // Without it an Ingress carrying no spec.tls produces a router
                // with no TLS config, so :443 connects and then 404s while :80
                // serves correctly — which is exactly what happened here.
                "--entrypoints.websecure.http.tls=true",
                // Watch Ingress objects across every namespace, restricted to
                // our own IngressClass so we never hijack another controller's.
                "--providers.kubernetesingress=true",
                "--providers.kubernetesingress.ingressclass=ahura",
                "--providers.kubernetesingress.allowemptyservices=true",
                // Required so a sleeping app's Ingress can reach the activator,
                // which lives in the platform namespace while the Ingress lives
                // in the tenant's. An Ingress backend is namespace-local, so the
                // tenant namespace gets an ExternalName Service pointing at it.
                //
                // Off by default because an ExternalName aimed somewhere hostile
                // is an SSRF primitive. Safe here because tenants cannot create
                // Services or Ingresses — every one is written by the reconciler
                // and every ExternalName target is one hardcoded in-cluster name.
                "--providers.kubernetesingress.allowexternalnameservices=true",
                // Declares the default certificate. Without it Traefik serves a
                // self-signed cert and Cloudflare Full (Strict) returns 526.
                "--providers.file.directory=/config",
                "--providers.file.watch=true",
                // Per-router request counters, on the ping port.
                //
                // This is how idleness is MEASURED rather than guessed. Scaling
                // an app to zero on a timer that does not know whether anyone
                // is using it is how a platform takes down a live app; the
                // counter is the difference between "no requests since we last
                // looked" and "we did not look".
                //
                // addrouterslabels gives a counter per router, which is per
                // hostname — the granularity the decision is actually made at.
                "--metrics.prometheus=true",
                "--metrics.prometheus.addrouterslabels=true",
                // `traefik`, NOT `ping`. The internal entrypoint that --ping and
                // the dashboard live on is named `traefik` and listens on :8080;
                // our container port is *labelled* "ping", which is not the same
                // thing. Naming a non-existent entrypoint does not fail the
                // process — Traefik logs "EntryPoint doesn't exist" and serves
                // 404 on /metrics while otherwise running perfectly, which is
                // exactly the shape of failure that reads as success.
                "--metrics.prometheus.entrypoint=traefik",
              ],
              ports: [
                { name: "web", containerPort: 8000 },
                { name: "websecure", containerPort: 8443 },
                { name: "ping", containerPort: 8080 },
              ],
              readinessProbe: { httpGet: { path: "/ping", port: 8080 }, initialDelaySeconds: 3, periodSeconds: 5 },
              livenessProbe: { httpGet: { path: "/ping", port: 8080 }, initialDelaySeconds: 10, periodSeconds: 20 },
              resources: { requests: { cpu: "100m", memory: "128Mi" }, limits: { cpu: "1", memory: "512Mi" } },
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                capabilities: { drop: ["ALL"] },
              },
              volumeMounts: [
                { name: "tmp", mountPath: "/tmp" },
                { name: "certs", mountPath: "/certs", readOnly: true },
                { name: "config", mountPath: "/config", readOnly: true },
              ],
            },
          ],
          volumes: [
            { name: "tmp", emptyDir: {} },
            { name: "certs", secret: { secretName: "origin-cert" } },
            { name: "config", configMap: { name: "traefik-tls" } },
          ],
        },
      },
    },
  };
}

/**
 * LoadBalancer Service. Linode's cloud controller turns this into a
 * NodeBalancer with a public IP, which is what wildcard DNS eventually points
 * at — and crucially it is a stable address that survives node replacement.
 * v1 pointed customer DNS at one hardcoded node IP, so it could never move,
 * scale or fail over.
 */
export function gatewayService() {
  return {
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      name: NAME,
      namespace: PAAS_NAMESPACE,
      labels: ownerLabels({ "ahura.cloud/component": "gateway" }),
      annotations: {
        "service.beta.kubernetes.io/linode-loadbalancer-throttle": "0",
        // TCP passthrough on every port. Linode's cloud controller otherwise
        // treats 443 as HTTPS and expects a certificate ON THE NODEBALANCER,
        // which we do not want: TLS must terminate at Traefik so it can select
        // the origin certificate and route by SNI/Host. Observed symptom
        // without this: port 80 serves correctly while 443 refuses the
        // connection outright and Cloudflare reports HTTP 525.
        "service.beta.kubernetes.io/linode-loadbalancer-default-protocol": "tcp",
      },
    },
    spec: {
      type: "LoadBalancer",
      selector: { "ahura.cloud/component": "gateway" },
      ports: [
        { name: "http", port: 80, targetPort: 8000, protocol: "TCP" },
        { name: "https", port: 443, targetPort: 8443, protocol: "TCP" },
      ],
      externalTrafficPolicy: "Cluster",
    },
  };
}

/**
 * Route one hostname to one project's Service.
 *
 * The Ingress is named for the ALIAS, not the deployment: promotion and
 * rollback move `aliases.deployment_id` and repoint the Service selector, so
 * the routing object itself never changes. That is what makes both operations
 * a single write with no rebuild.
 */
export function appIngress(i: {
  aliasRef: string;
  projectRef: string;
  namespace: string;
  hostname: string;
  /**
   * Backend Service. Defaults to the project ref for compatibility; pass the
   * alias's own deployment Service so this hostname serves the build the
   * database says it serves, rather than whatever production points at.
   */
  serviceName?: string;
  /**
   * Set while the app is ASLEEP: names the deployment the activator should wake
   * when a request arrives for this hostname.
   *
   * It lives on the Ingress because that is the only object the activator can
   * reach from a bare Host header — it has no database credential, and giving
   * the most externally-reachable component in the platform one would be a poor
   * trade for saving an annotation.
   */
  wakeTarget?: string;
  wakePort?: number;
}) {
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "Ingress",
    metadata: {
      name: i.aliasRef,
      namespace: i.namespace,
      labels: ownerLabels({ "ahura.cloud/project": i.projectRef, "ahura.cloud/alias": i.aliasRef }),
      // OMITTED when awake, not set to null. Under Server-Side Apply, dropping
      // a field this manager owns removes it — whereas a null serialises into
      // an empty-string annotation, and an empty string is a value that looks
      // like data. Same smell as the '0000000' git sha.
      //
      // A stale wake target is not harmless either: it is what the activator
      // would act on if a request ever reached it again.
      annotations: {
        // Per-tenant inbound rate limit, defined in the traefik-tls ConfigMap
        // and served by Traefik's FILE provider — `@file` is the provider
        // qualifier and the reference does not resolve without it.
        //
        // Applied to EVERY tenant route rather than opted into. One app being
        // flooded otherwise burns shared node CPU and Linode transfer that its
        // neighbours paid for, and an opt-in control protects only the tenants
        // who did not need protecting.
        //
        // Verified by making the limit absurd (average 1, burst 1, period 10s)
        // and watching 19 of 20 requests return 429 while a second hostname
        // returned 20 of 20 as 200. At the real limit nothing trips from one
        // client, which is indistinguishable from the middleware not being
        // attached at all — so the absurd-limit probe is the only thing that
        // told those two apart.
        "traefik.ingress.kubernetes.io/router.middlewares": TENANT_RATELIMIT_MIDDLEWARE,
        // OMITTED when awake, not set to null. Under Server-Side Apply, dropping
        // a field this manager owns removes it — whereas a null serialises into
        // an empty-string annotation, and an empty string is a value that looks
        // like data. Same smell as the '0000000' git sha.
        //
        // A stale wake target is not harmless either: it is what the activator
        // would act on if a request ever reached it again.
        ...(i.wakeTarget
          ? {
              "ahura.cloud/wake-target": i.wakeTarget,
              ...(i.wakePort != null ? { "ahura.cloud/wake-port": String(i.wakePort) } : {}),
            }
          : {}),
      },
    },
    spec: {
      ingressClassName: "ahura",
      // An empty TLS entry means "serve this over TLS using the DEFAULT
      // certificate store". Naming a secret here would instead require the
      // platform's wildcard private key to be copied into every tenant
      // namespace, putting it one container escape away from a tenant.
      //
      // Without any tls block the router is created without TLS, so :443
      // connects and then 404s while :80 serves correctly — observed exactly
      // that before adding this.
      tls: [{}],
      rules: [
        {
          host: i.hostname,
          http: {
            paths: [
              {
                path: "/",
                pathType: "Prefix",
                backend: { service: { name: i.serviceName ?? i.projectRef, port: { number: 80 } } },
              },
            ],
          },
        },
      ],
    },
  };
}
