/**
 * Bound what a tenant namespace may consume.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/quota-apply.ts          # report
 *   node --env-file=.env --env-file=.env.local scripts/v3/quota-apply.ts --apply  # enforce
 *
 * Nothing bounds a tenant today. One namespace can request as much of a node
 * as the scheduler will give it, which at untrusted-public-signup scale is one
 * hostile tenant away from being everyone else's problem.
 *
 * IT REFUSES TO ENFORCE A BOUND A NAMESPACE ALREADY EXCEEDS, and that is the
 * whole reason this is a script rather than a `kubectl apply`.
 *
 * Kubernetes ACCEPTS a ResourceQuota smaller than current usage. Existing pods
 * keep running, nothing errors, the object reads as applied and correct — and
 * then the next deploy or the next restart is rejected. The outage is delayed,
 * it lands on whoever pushes next, and nothing in the quota's own status says
 * "already violated". Applying blind converts a capacity policy into a
 * time-bomb aimed at a tenant who did nothing.
 *
 * Per-namespace, so one namespace being unsafe does not stop the rest being
 * protected. Reversible — deleting the objects restores the previous state —
 * which is why this has an --apply at all where the R2 reaper's took an
 * argument to earn.
 */

import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";
import {
  DEFAULT_QUOTA,
  canEnforce,
  limitRangeManifest,
  measureNamespace,
  resourceQuotaManifest,
  type PodSpecLike,
} from "../../lib/paas/telemetry/quota.ts";

const APPLY = process.argv.includes("--apply");
const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";

/** Namespaces the platform runs for itself. Bounding these would be a footgun. */
const PLATFORM_NS = new Set(["default", "kube-system", "kube-public", "kube-node-lease", "ahura-system", "platform"]);

const k = kube(loadKubeconfig(KUBECONFIG));
if (!(await k.healthz())) {
  console.error("cluster unreachable");
  process.exit(1);
}

interface RawPod {
  metadata: { name: string };
  status?: { phase?: string };
  spec?: { containers?: Array<{ name: string; resources?: PodSpecLike["containers"][number]["resources"] }> };
}

const namespaces = (await k.listNamespaces())
  .map((n) => n.metadata.name)
  .filter((n) => !PLATFORM_NS.has(n));

const line = "─".repeat(96);
console.log(`\nTenant resource bounds${APPLY ? "" : " (report only)"}`);
console.log(line);
console.log(
  `  policy: ${DEFAULT_QUOTA.pods} pods, ${DEFAULT_QUOTA.requestsCpu} cpu / ` +
    `${DEFAULT_QUOTA.requestsMemory} requested, ${DEFAULT_QUOTA.limitsCpu} cpu / ` +
    `${DEFAULT_QUOTA.limitsMemory} limit`,
);
console.log(line);

let enforced = 0;
let refused = 0;

for (const ns of namespaces) {
  const raw = (await k.get<{ items: RawPod[] }>(`/api/v1/namespaces/${ns}/pods`, true))?.items ?? [];
  const pods: PodSpecLike[] = raw.map((p) => ({
    name: p.metadata.name,
    phase: p.status?.phase,
    containers: (p.spec?.containers ?? []).map((c) => ({ name: c.name, resources: c.resources })),
  }));

  const usage = measureNamespace(pods);
  const verdict = canEnforce(usage, DEFAULT_QUOTA);

  const existing = await k.get(`/api/v1/namespaces/${ns}/resourcequotas/tenant`, true);
  const state = existing ? "already bounded" : "unbounded";

  console.log(
    `  ${ns.padEnd(34)} ${String(usage.pods).padStart(2)} pod(s)  ` +
      `cpu ${usage.requestsCpu.toFixed(2)}  mem ${(usage.requestsMemory / 1024 ** 2).toFixed(0)}Mi  ` +
      `${verdict.safe ? "SAFE" : "REFUSED"}  ${state}`,
  );

  for (const b of verdict.blockers) console.log(`      ${b}`);

  if (!verdict.safe) {
    refused += 1;
    continue;
  }
  if (!APPLY) continue;

  // Server-side apply so re-running converges rather than conflicting.
  await k.raw({
    method: "PUT",
    path: `/api/v1/namespaces/${ns}/resourcequotas/tenant`,
    body: resourceQuotaManifest(ns, DEFAULT_QUOTA),
    allowMissing: true,
  });
  await k.raw({
    method: "PUT",
    path: `/api/v1/namespaces/${ns}/limitranges/tenant`,
    body: limitRangeManifest(ns, DEFAULT_QUOTA),
    allowMissing: true,
  });

  enforced += 1;
  console.log(`      enforced: ResourceQuota and LimitRange applied`);
}

console.log(line);
if (APPLY) {
  console.log(`  ${enforced} namespace(s) bounded, ${refused} refused as unsafe`);
} else {
  console.log(
    `  ${namespaces.length - refused} of ${namespaces.length} namespace(s) safe to bound, ` +
      `${refused} refused.\n  Report only. Re-run with --apply to enforce the safe ones.`,
  );
}
console.log("");

process.exit(refused > 0 ? 1 : 0);
