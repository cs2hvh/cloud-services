/**
 * Put idle apps to sleep, so the fleet stops paying the always-on cost model.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/idle-sweep.ts [--apply] [--sleep-now=<hostname>]
 *
 * Reads Traefik's per-router request counters twice and sleeps only what did
 * not move between them. Requires projects.scale_to_zero — default false, so
 * this does nothing to an app nobody opted in.
 *
 * `--sleep-now=<hostname>` skips the wait for testing the WAKE path. It still
 * requires opt-in, and it says loudly that the idle evidence was bypassed.
 */

import { projects, deployments, aliases, db } from "../../lib/paas/db.ts";
import { kube, loadKubeconfig } from "../../lib/paas/k8s/client.ts";
import { PAAS_NAMESPACE } from "../../lib/paas/k8s/manifests.ts";
import { ACTIVATOR_NAME, activatorAliasService } from "../../lib/paas/k8s/activator.ts";
import { appIngress } from "../../lib/paas/k8s/gateway.ts";
import {
  parseRouterCounts, requestsForHostname, verdict, DEFAULT_IDLE_SECONDS, type IdleSample,
} from "../../lib/paas/idle.ts";

const APPLY = process.argv.includes("--apply");
const sleepNow = process.argv.find((a) => a.startsWith("--sleep-now="))?.split("=")[1];
const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const k = kube(loadKubeconfig(KUBECONFIG));

async function traefikCounts(): Promise<Map<string, number> | null> {
  try {
    const pods = await k.get<{ items?: Array<{ metadata?: { name?: string }; status?: { phase?: string } }> }>(
      `/api/v1/namespaces/${PAAS_NAMESPACE}/pods?labelSelector=ahura.cloud%2Fcomponent%3Dgateway`,
    );
    const pod = pods?.items?.find((p) => p.status?.phase === "Running");
    if (!pod?.metadata?.name) return null;
    const body = await k.raw<string>({
      method: "GET",
      path: `/api/v1/namespaces/${PAAS_NAMESPACE}/pods/${pod.metadata.name}:8080/proxy/metrics`,
    });
    return parseRouterCounts(String(body));
  } catch {
    // Null, never an empty map. An empty map would read as "every app has zero
    // requests" and sleep the entire fleet on a gateway we could not reach.
    return null;
  }
}

interface Candidate {
  hostname: string;
  projectRef: string;
  projectId: string;
  aliasRef: string;
  deploymentRef: string;
  deploymentId: string;
  port: number;
  idleSeconds: number;
  namespace: string;
  asleep: boolean;
}

async function candidates(): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const p of await projects.list()) {
    if (!p.scale_to_zero) continue;
    const [als, ready] = await Promise.all([
      aliases.forProject(p.id),
      deployments.readyForProject(p.id),
    ]);
    const byId = new Map(ready.map((d) => [d.id, d]));
    for (const a of als) {
      if (!a.deployment_id) continue;
      const d = byId.get(a.deployment_id);
      if (!d) continue;
      out.push({
        hostname: a.hostname,
        projectRef: p.ref,
        projectId: p.id,
        aliasRef: a.ref,
        deploymentRef: d.ref,
        deploymentId: d.id,
        port: d.container_port ?? 3000,
        idleSeconds: p.idle_seconds ?? DEFAULT_IDLE_SECONDS,
        namespace: `app-${p.ref}`,
        asleep: d.scaled_to_zero_at != null,
      });
    }
  }
  return out;
}

async function sleepApp(c: Candidate): Promise<void> {
  // Record the intent FIRST. If the process dies between the row and the
  // cluster, the reconciler finds a deployment marked asleep and converges the
  // cluster to match — the same "record before you act" rule that keeps
  // infrastructure from outliving its record.
  await db.update("deployments", `ref=eq.${c.deploymentRef}`, {
    scaled_to_zero_at: new Date().toISOString(),
  });

  // The tenant namespace needs its OWN name for the activator: an Ingress
  // backend can only reference a Service in its own namespace. Without this the
  // repoint below produces a backend Kubernetes cannot resolve, and Traefik
  // answers 404 — the app simply gone, behind a perfectly reasonable-looking
  // Ingress. Observed exactly that.
  await k.apply(
    `/api/v1/namespaces/${c.namespace}/services/${ACTIVATOR_NAME}`,
    activatorAliasService(c.namespace),
  );

  // Repoint the hostname at the activator BEFORE removing the pods. The other
  // order leaves a window where the Ingress still points at a Service with no
  // endpoints, and every request in that window is a 503 the visitor sees.
  await k.apply(
    `/apis/networking.k8s.io/v1/namespaces/${c.namespace}/ingresses/${c.aliasRef}`,
    appIngress({
      aliasRef: c.aliasRef,
      projectRef: c.projectRef,
      namespace: c.namespace,
      hostname: c.hostname,
      serviceName: ACTIVATOR_NAME,
      wakeTarget: c.deploymentRef,
      wakePort: c.port,
    }),
  );

  // Give the gateway a moment to pick the change up before the pod goes.
  await new Promise((r) => setTimeout(r, 2000));

  await k.raw({
    method: "PATCH",
    path: `/apis/apps/v1/namespaces/${c.namespace}/deployments/${c.deploymentRef}/scale`,
    body: { spec: { replicas: 0 } },
    contentType: "application/merge-patch+json",
  });
}

const all = await candidates();
console.log(`\nIdle sweep${APPLY ? "" : "  (dry run)"}\n` + "═".repeat(72));
console.log(`${all.length} hostname(s) on projects with scale_to_zero enabled\n`);

if (all.length === 0) {
  console.log("Nothing opted in. Enable per project:");
  console.log("  update paas.projects set scale_to_zero = true where ref = '<ref>';");
  process.exit(0);
}

if (sleepNow) {
  const c = all.find((x) => x.hostname === sleepNow);
  if (!c) {
    console.log(`${sleepNow} is not an opted-in hostname.`);
    process.exit(1);
  }
  if (c.asleep) {
    console.log(`${c.hostname} is already asleep.`);
    process.exit(0);
  }
  console.log(`BYPASSING IDLE EVIDENCE for ${c.hostname} — this is a wake-path test,`);
  console.log(`not a measurement. It sleeps an app that may be in active use.\n`);
  if (!APPLY) {
    console.log("Dry run. Re-run with --apply.");
    process.exit(0);
  }
  await sleepApp(c);
  console.log(`${c.hostname} is asleep. ${c.deploymentRef} scaled to 0, ingress -> ${ACTIVATOR_NAME}.`);
  console.log(`The next request to it should wake it.`);
  process.exit(0);
}

// Two readings, separated. One reading cannot tell an app with no traffic from
// an app whose counter we are seeing for the first time.
const first = await traefikCounts();
if (first === null) {
  console.log("Could not read gateway metrics. NOTHING will be slept — blind is not idle.");
  process.exit(1);
}
const t0 = Date.now();
const baseline = new Map<string, IdleSample>();
for (const c of all) {
  const n = requestsForHostname(first, c.hostname);
  if (n !== null) baseline.set(c.hostname, { hostname: c.hostname, requests: n, at: t0 });
}

const WAIT_MS = 30_000;
console.log(`Baseline taken. Waiting ${WAIT_MS / 1000}s for a second reading...\n`);
await new Promise((r) => setTimeout(r, WAIT_MS));

const second = await traefikCounts();
if (second === null) {
  console.log("Second reading failed. Nothing slept.");
  process.exit(1);
}
const t1 = Date.now();

for (const c of all) {
  if (c.asleep) {
    console.log(`  ${c.hostname.padEnd(44)} already asleep`);
    continue;
  }
  const n = requestsForHostname(second, c.hostname);
  // The configured idle window is what SHOULD gate this. The 30s sample gap is
  // only how far apart the two readings are, so a real sweep runs on a schedule
  // and compares against its own previous run rather than sleeping 15 minutes.
  const v = verdict(baseline.get(c.hostname), { requests: n, at: t1 }, Math.min(c.idleSeconds * 1000, WAIT_MS));
  if (!v.idle) {
    console.log(`  ${c.hostname.padEnd(44)} awake — ${v.reason}`);
    continue;
  }
  console.log(`  ${c.hostname.padEnd(44)} IDLE for ${Math.round(v.forMs / 1000)}s`);
  if (APPLY) {
    await sleepApp(c);
    console.log(`  ${" ".repeat(44)} slept — ingress -> ${ACTIVATOR_NAME}`);
  }
}

if (!APPLY) console.log("\nDry run. Re-run with --apply.");
