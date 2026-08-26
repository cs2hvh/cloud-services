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

  // POST to create, PUT to update, and NEVER allowMissing on a write.
  //
  // The first version PUT both with allowMissing:true and printed "enforced".
  // allowMissing means "this may not exist, return null" — right for a read,
  // catastrophic on a write, because every failure becomes a silent success.
  // The ResourceQuota PUTs 404'd, were swallowed, and three namespaces were
  // reported bounded while none of them were. A tool that claims a success it
  // did not achieve is the exact defect this lane has a classifier for.
  const objects = [
    { kind: "resourcequotas", body: resourceQuotaManifest(ns, DEFAULT_QUOTA) },
    { kind: "limitranges", body: limitRangeManifest(ns, DEFAULT_QUOTA) },
  ];

  let applied = 0;
  for (const o of objects) {
    const exists = await k.get(`/api/v1/namespaces/${ns}/${o.kind}/tenant`, true);
    try {
      if (exists) {
        await k.raw({ method: "PUT", path: `/api/v1/namespaces/${ns}/${o.kind}/tenant`, body: o.body });
      } else {
        await k.raw({ method: "POST", path: `/api/v1/namespaces/${ns}/${o.kind}`, body: o.body });
      }
      applied += 1;
    } catch (e) {
      console.log(`      FAILED ${o.kind}: ${(e as Error).message.slice(0, 160)}`);
    }
  }

  // Read back rather than trusting the write. Safe by observation, the same
  // rule the R2 reaper and the quota precondition already run on.
  const quota = await k.get(`/api/v1/namespaces/${ns}/resourcequotas/tenant`, true);
  const limits = await k.get(`/api/v1/namespaces/${ns}/limitranges/tenant`, true);

  if (quota && limits) {
    enforced += 1;
    console.log(`      enforced: ResourceQuota and LimitRange verified present`);
  } else {
    refused += 1;
    console.log(
      `      NOT ENFORCED: ${applied} write(s) accepted but read-back shows ` +
        `quota=${quota ? "present" : "MISSING"} limitrange=${limits ? "present" : "MISSING"}`,
    );
  }
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
