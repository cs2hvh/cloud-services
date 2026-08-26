/**
 * The activator — what makes scale-to-zero safe rather than just "off".
 *
 * THE PROBLEM IT SOLVES
 *
 * Warm fraction is measured at 1.0. Every app holds a pod 100% of the time, at
 * 2–3 millicores, so the fleet pays the always-on cost model — roughly $52k a
 * month at 10k apps against a $5 price. Sleeping idle apps is the difference
 * between that and the ~$18–20k the plan assumes.
 *
 * But an app that scales down and cannot come back is simply an app that is
 * down. The activator is the half that makes the saving safe: it holds the
 * first request to a sleeping app, wakes it, and proxies once it is ready. The
 * visitor waits a few seconds instead of seeing a 503.
 *
 * HOW A REQUEST FINDS IT
 *
 * When an app sleeps, its Ingress backend is repointed at this Service and the
 * intended deployment is recorded in an annotation. The activator reads the
 * Host header, finds the Ingress carrying that host, reads the annotation to
 * learn what to wake, scales it up, repoints the Ingress back, and forwards.
 *
 * It is therefore ONLY in the path for cold apps. A warm app's Ingress points
 * straight at its own Service and never touches this. That matters: a component
 * in front of every request is a component whose failure is total.
 *
 * WHY A CONFIGMAP AND NOT AN IMAGE
 *
 * Building an image would make the activator depend on the build pipeline —
 * which depends on the cluster, which is what the activator serves. A stock
 * node image with the script mounted breaks that circularity, and means the
 * activator can be fixed when the build path is broken.
 */

import { PAAS_NAMESPACE, ownerLabels } from "./manifests.ts";

export const ACTIVATOR_NAME = "activator";
export const ACTIVATOR_PORT = 8080;

/** Set on an alias Ingress while its app is asleep, naming what to wake. */
export const WAKE_TARGET_ANNOTATION = "ahura.cloud/wake-target";
export const WAKE_PORT_ANNOTATION = "ahura.cloud/wake-port";

export function activatorServiceAccount() {
  return {
    apiVersion: "v1",
    kind: "ServiceAccount",
    metadata: { name: ACTIVATOR_NAME, namespace: PAAS_NAMESPACE, labels: ownerLabels() },
  };
}

/**
 * Deliberately narrow. The activator can read Ingresses to resolve a host, and
 * scale and read Deployments to wake one. It cannot create or delete anything,
 * cannot read Secrets, and cannot touch pods directly.
 *
 * It is reachable by any request that arrives at a sleeping hostname, which
 * makes it the most exposed component in the platform. Its permissions should
 * embarrass a reader with how little they allow.
 */
export function activatorClusterRole() {
  return {
    apiVersion: "rbac.authorization.k8s.io/v1",
    kind: "ClusterRole",
    metadata: { name: "ahura-activator", labels: ownerLabels() },
    rules: [
      {
        apiGroups: ["networking.k8s.io"],
        resources: ["ingresses"],
        verbs: ["get", "list", "watch", "patch"],
      },
      {
        apiGroups: ["apps"],
        resources: ["deployments"],
        // `patch` so the activator can stamp ahura.cloud/woken-at. It has no
        // database credential — deliberately, as the most externally reachable
        // component here — so a Kubernetes annotation is how it tells the
        // control plane that an app was woken. Without that the reconciler
        // still believes the app is asleep and puts it back to sleep on its
        // next pass, undoing the wake seconds after a visitor arrived.
        //
        // Not an escalation worth worrying about: it can already scale these
        // Deployments, and it still cannot create or delete anything.
        verbs: ["get", "list", "watch", "patch"],
      },
      {
        apiGroups: ["apps"],
        resources: ["deployments/scale"],
        verbs: ["get", "patch"],
      },
      // Endpoints, because a ready Deployment is not a reachable Service. The
      // gap between a pod passing its readiness probe and kube-proxy having
      // programmed the endpoint is small but real, and proxying into it returns
      // a connection refusal the visitor sees as a 502.
      {
        apiGroups: ["discovery.k8s.io"],
        resources: ["endpointslices"],
        verbs: ["get", "list", "watch"],
      },
    ],
  };
}

export function activatorClusterRoleBinding() {
  return {
    apiVersion: "rbac.authorization.k8s.io/v1",
    kind: "ClusterRoleBinding",
    metadata: { name: "ahura-activator", labels: ownerLabels() },
    roleRef: { apiGroup: "rbac.authorization.k8s.io", kind: "ClusterRole", name: "ahura-activator" },
    subjects: [{ kind: "ServiceAccount", name: ACTIVATOR_NAME, namespace: PAAS_NAMESPACE }],
  };
}

/**
 * An `activator` Service inside a TENANT namespace, forwarding to the real one.
 *
 * WHY THIS IS NEEDED, learned the hard way: an Ingress backend can only name a
 * Service in its OWN namespace. Pointing a sleeping app's Ingress straight at
 * `activator` in `ahura-system` produced a backend Kubernetes silently could
 * not resolve, and Traefik answered 404 — not 503, not an error anywhere. The
 * app was simply gone, and the Ingress looked perfectly reasonable.
 *
 * ExternalName gives each tenant namespace a local name for the shared
 * activator without copying the workload into every namespace. It resolves via
 * cluster DNS, so nothing tenant-controlled is trusted: the target is a fixed
 * in-cluster address this code writes, not anything a customer can influence.
 *
 * Traefik needs --providers.kubernetesingress.allowexternalnameservices=true to
 * follow it, which is off by default precisely because an ExternalName pointing
 * somewhere hostile would be an SSRF primitive. Ours points at one hardcoded
 * name; tenants cannot create Ingresses or Services here.
 */
export function activatorAliasService(namespace: string) {
  return {
    apiVersion: "v1",
    kind: "Service",
    metadata: { name: ACTIVATOR_NAME, namespace, labels: ownerLabels() },
    spec: {
      type: "ExternalName",
      externalName: `${ACTIVATOR_NAME}.${PAAS_NAMESPACE}.svc.cluster.local`,
      ports: [{ name: "http", port: 80 }],
    },
  };
}

export function activatorService() {
  return {
    apiVersion: "v1",
    kind: "Service",
    metadata: { name: ACTIVATOR_NAME, namespace: PAAS_NAMESPACE, labels: ownerLabels() },
    spec: {
      selector: { "ahura.cloud/component": ACTIVATOR_NAME },
      ports: [{ name: "http", port: 80, targetPort: ACTIVATOR_PORT }],
      type: "ClusterIP",
    },
  };
}

/**
 * The activator program.
 *
 * Kept as a string rather than a separate file so the manifest and the code it
 * runs cannot drift apart — there is no build step that could ship one without
 * the other.
 */
export const ACTIVATOR_SCRIPT = String.raw`
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');

const NS_ALL = '/apis/networking.k8s.io/v1/ingresses';
const API = 'https://kubernetes.default.svc';
const TOKEN = fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/token', 'utf8');
const CA = fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt');
const agent = new https.Agent({ ca: CA });

const WAKE_TARGET = 'ahura.cloud/wake-target';
const WAKE_PORT = 'ahura.cloud/wake-port';
const READY_TIMEOUT_MS = 60000;

function k8s(method, path, body, contentType) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = https.request(API + path, {
      method,
      agent,
      headers: Object.assign(
        { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json' },
        data ? { 'Content-Type': contentType || 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
      ),
    }, (res) => {
      let out = '';
      res.on('data', (c) => { out += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(method + ' ' + path + ' -> ' + res.statusCode + ': ' + out.slice(0, 300)));
        try { resolve(out ? JSON.parse(out) : null); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// One wake per host at a time. Ten simultaneous requests to a sleeping app must
// produce ONE scale-up that they all wait on, not ten racing patches.
const waking = new Map();

async function findIngress(host) {
  const list = await k8s('GET', NS_ALL);
  for (const ing of (list.items || [])) {
    for (const rule of (ing.spec && ing.spec.rules) || []) {
      if (rule.host === host) return ing;
    }
  }
  return null;
}

async function hasEndpoint(ns, svc) {
  try {
    const sel = encodeURIComponent('kubernetes.io/service-name=' + svc);
    const r = await k8s('GET', '/apis/discovery.k8s.io/v1/namespaces/' + ns + '/endpointslices?labelSelector=' + sel);
    for (const slice of (r.items || [])) {
      for (const ep of (slice.endpoints || [])) {
        if (!ep.conditions || ep.conditions.ready !== false) {
          if ((ep.addresses || []).length > 0) return true;
        }
      }
    }
  } catch (e) { /* fall through: treat as not-ready, never as ready */ }
  return false;
}

async function readyReplicas(ns, name) {
  try {
    const d = await k8s('GET', '/apis/apps/v1/namespaces/' + ns + '/deployments/' + name);
    return (d.status && d.status.readyReplicas) || 0;
  } catch (e) { return 0; }
}

async function wake(host) {
  if (waking.has(host)) return waking.get(host);
  const p = (async () => {
    const ing = await findIngress(host);
    if (!ing) throw new Error('no ingress for host ' + host);
    const ann = (ing.metadata && ing.metadata.annotations) || {};
    const target = ann[WAKE_TARGET];
    if (!target) throw new Error('ingress ' + ing.metadata.name + ' has no wake target');
    const ns = ing.metadata.namespace;
    const port = parseInt(ann[WAKE_PORT] || '80', 10);

    // Scale up first. Repointing the Ingress before the app can serve would
    // hand the visitor a 503 from a Service with no endpoints.
    await k8s('PATCH', '/apis/apps/v1/namespaces/' + ns + '/deployments/' + target + '/scale',
      { spec: { replicas: 1 } }, 'application/merge-patch+json');

    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await readyReplicas(ns, target) > 0) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    if (await readyReplicas(ns, target) === 0) throw new Error('timed out waking ' + target);

    // A ready Deployment is NOT a reachable Service. kube-proxy programs the
    // endpoint after the pod passes its probe, and proxying into that gap
    // returns a connection refusal the visitor sees as a 502 — which is exactly
    // what the first version of this did: it woke the app correctly, logged
    // success, and handed the requester an error.
    while (Date.now() < deadline) {
      if (await hasEndpoint(ns, target)) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    // Tell the control plane this app is awake, BEFORE taking ourselves out of
    // the path. The reconciler compares this against deployments.scaled_to_zero_at
    // and clears the sleep flag when this is newer. Stamping it after the
    // Ingress repoint would leave a window where the app is reachable, the
    // database still says asleep, and a reconciler pass in that window undoes
    // the wake.
    await k8s('PATCH', '/apis/apps/v1/namespaces/' + ns + '/deployments/' + target,
      { metadata: { annotations: { 'ahura.cloud/woken-at': new Date().toISOString() } } },
      'application/merge-patch+json');

    // Now take ourselves out of the path. Subsequent requests go straight to
    // the app; the activator is only ever in front of a COLD app.
    const patch = {
      metadata: { annotations: { [WAKE_TARGET]: null, [WAKE_PORT]: null } },
      spec: { rules: (ing.spec.rules || []).map((r) => ({
        host: r.host,
        http: { paths: ((r.http && r.http.paths) || []).map((pth) => ({
          path: pth.path, pathType: pth.pathType,
          backend: { service: { name: target, port: { number: 80 } } },
        })) },
      })) },
    };
    await k8s('PATCH', '/apis/networking.k8s.io/v1/namespaces/' + ns + '/ingresses/' + ing.metadata.name,
      patch, 'application/merge-patch+json');

    return { ns: ns, target: target, port: port };
  })().finally(() => { waking.delete(host); });
  waking.set(host, p);
  return p;
}

function proxy(info, req, res, body, attempt) {
  attempt = attempt || 1;
  const upstream = http.request({
    host: info.target + '.' + info.ns + '.svc.cluster.local',
    port: 80,
    method: req.method,
    path: req.url,
    headers: req.headers,
  }, (up) => {
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
  });
  upstream.on('error', (e) => {
    // Endpoint programming can still lose a race with the very first connect.
    // Retrying a refusal costs the visitor milliseconds; not retrying costs
    // them the page. Bounded, so a genuinely broken app still fails.
    if (attempt < 5 && (e.code === 'ECONNREFUSED' || e.code === 'EAI_AGAIN' || e.code === 'ENOTFOUND')) {
      return setTimeout(() => proxy(info, req, res, body, attempt + 1), 300);
    }
    console.log(JSON.stringify({ msg: 'proxy failed', target: info.target, code: e.code, error: String(e.message), attempt: attempt }));
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('upstream error after wake: ' + e.message + '\n');
    }
  });
  // The body was buffered before waking, because the client finished sending it
  // while we were scaling up. Replaying it is what makes a POST survive a wake
  // instead of arriving empty.
  if (body && body.length) upstream.write(body);
  upstream.end();
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      // Bounded. The activator holds this in memory while the app starts, and
      // an unbounded buffer in front of a sleeping app is a way to exhaust it.
      if (size <= 1024 * 1024) chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}

http.createServer(async (req, res) => {
  if (req.url === '/healthz') { res.writeHead(200); return res.end('ok'); }
  const host = String(req.headers.host || '').split(':')[0];
  if (!host) { res.writeHead(400); return res.end('no host header'); }
  try {
    // Read the body BEFORE waking. The client sends it immediately and will not
    // resend; waking first and piping afterwards loses whatever arrived while
    // the app was starting.
    const body = await readBody(req);
    const info = await wake(host);
    console.log(JSON.stringify({ msg: 'woke', host: host, target: info.target }));
    proxy(info, req, res, body, 1);
  } catch (e) {
    console.log(JSON.stringify({ msg: 'wake failed', host: host, error: String(e && e.message) }));
    // 503 with Retry-After, not 500. This is a temporary condition with a known
    // remedy, and saying so lets a client and a health checker behave sensibly.
    res.writeHead(503, { 'content-type': 'text/plain', 'retry-after': '5' });
    res.end('application is starting, please retry\n');
  }
}).listen(` + String(ACTIVATOR_PORT) + String.raw`, () => console.log('activator listening'));
`;

export function activatorConfigMap() {
  return {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: { name: `${ACTIVATOR_NAME}-src`, namespace: PAAS_NAMESPACE, labels: ownerLabels() },
    data: { "activator.js": ACTIVATOR_SCRIPT },
  };
}

export function activatorDeployment(scriptHash: string) {
  const labels = ownerLabels({ "ahura.cloud/component": ACTIVATOR_NAME });
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name: ACTIVATOR_NAME, namespace: PAAS_NAMESPACE, labels },
    spec: {
      replicas: 1,
      selector: { matchLabels: { "ahura.cloud/component": ACTIVATOR_NAME } },
      template: {
        metadata: {
          labels,
          // Kubernetes does NOT restart pods when a ConfigMap's contents change.
          // Without this the activator would keep running an old script after an
          // update, and the symptom would be a fix that appears not to work.
          annotations: { "ahura.cloud/script-hash": scriptHash },
        },
        spec: {
          serviceAccountName: ACTIVATOR_NAME,
          nodeSelector: { "ahura.cloud/pool": "system" },
          securityContext: { runAsNonRoot: true, runAsUser: 1000, fsGroup: 1000 },
          containers: [
            {
              name: ACTIVATOR_NAME,
              image: "node:24-alpine",
              command: ["node", "/src/activator.js"],
              ports: [{ name: "http", containerPort: ACTIVATOR_PORT }],
              volumeMounts: [{ name: "src", mountPath: "/src", readOnly: true }],
              readinessProbe: { httpGet: { path: "/healthz", port: ACTIVATOR_PORT }, initialDelaySeconds: 2, periodSeconds: 5 },
              livenessProbe: { httpGet: { path: "/healthz", port: ACTIVATOR_PORT }, initialDelaySeconds: 10, periodSeconds: 20 },
              resources: { requests: { cpu: "50m", memory: "64Mi" }, limits: { cpu: "500m", memory: "256Mi" } },
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: true,
                capabilities: { drop: ["ALL"] },
              },
            },
          ],
          volumes: [{ name: "src", configMap: { name: `${ACTIVATOR_NAME}-src` } }],
        },
      },
    },
  };
}
