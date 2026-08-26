/**
 * Destroy everything v2 created on Linode, and report the exact hourly cost
 * of whatever is still running.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/teardown.ts            # report only
 *   node --env-file=.env --env-file=.env.local scripts/v2/teardown.ts --apply    # destroy
 *
 * Deliberately keys on the Linode API rather than on the paas tables. A
 * teardown that trusts the database cannot clean up what the database never
 * recorded — which is precisely how v1 ended up with five billing meters
 * outliving the apps they billed for.
 *
 * Scope guard: this only ever touches LKE clusters tagged `ahura-v2`, their own
 * worker nodes, their own NodeBalancers, and instances tagged `ahura-v2-build`.
 * Anything else on the account is listed and left alone.
 */

import { instances, lke, linode } from "../../lib/paas/linode/client.ts";

const APPLY = process.argv.includes("--apply");
const V2_TAG = "ahura-v2";
const BUILD_TAG = "ahura-v2-build";

interface Billable {
  kind: "instance" | "nodebalancer" | "lke";
  id: number;
  label: string;
  detail: string;
  hourly: number;
  destroy: () => Promise<unknown>;
}

const types = await linode.getAllPages<{ id: string; price: { hourly: number; monthly: number | null } }>(
  "/linode/types",
);
const priceOf = new Map(types.map((t) => [t.id, t.price]));

const clusters = (await lke.listClusters()).filter((c) => c.tags?.includes(V2_TAG));
const ourClusterIds = new Set(clusters.map((c) => String(c.id)));

const allInstances = await instances.list();
const nodeBalancers = await linode.getAllPages<{
  id: number;
  label: string;
  ipv4: string;
  lke_cluster?: { id: number } | null;
}>("/nodebalancers");

const billable: Billable[] = [];
const foreign: string[] = [];

for (const i of allInstances) {
  const isBuild = i.tags.includes(BUILD_TAG);
  const m = i.label.match(/^lke(\d+)-/);
  const isOurNode = m && ourClusterIds.has(m[1]);
  if (!isBuild && !isOurNode && !i.tags.includes(V2_TAG)) {
    foreign.push(`${i.label} (${i.type})`);
    continue;
  }
  const hourly = priceOf.get(i.type)?.hourly ?? 0;
  billable.push({
    kind: "instance",
    id: i.id,
    label: i.label,
    detail: `${i.type} ${i.status}${isBuild ? " [BUILD VM]" : " [cluster node]"}`,
    hourly,
    // Cluster nodes are destroyed by deleting the cluster, not individually —
    // LKE would immediately recreate a node deleted on its own.
    destroy: async () => (isBuild ? instances.delete(i.id) : undefined),
  });
}

for (const nb of nodeBalancers) {
  if (nb.lke_cluster && !ourClusterIds.has(String(nb.lke_cluster.id))) {
    foreign.push(`nodebalancer ${nb.label}`);
    continue;
  }
  if (!nb.lke_cluster) {
    foreign.push(`nodebalancer ${nb.label} (not LKE-managed)`);
    continue;
  }
  billable.push({
    kind: "nodebalancer",
    id: nb.id,
    label: nb.label,
    detail: nb.ipv4,
    hourly: 0.015,
    // Deleting the LoadBalancer Service is the correct route; deleting the
    // NodeBalancer directly leaves the Service dangling and the CCM recreates
    // it. Removing the cluster removes this with it.
    destroy: async () => undefined,
  });
}

for (const c of clusters) {
  billable.push({
    kind: "lke",
    id: c.id,
    label: c.label,
    detail: `${c.k8s_version} ${c.region} — deleting this removes its nodes AND its NodeBalancer`,
    hourly: 0,
    destroy: () => lke.deleteCluster(c.id),
  });
}

const totalHourly = billable.reduce((n, b) => n + b.hourly, 0);

console.log("\nv2 infrastructure currently running\n" + "─".repeat(78));
for (const b of billable) {
  console.log(
    `  ${b.kind.padEnd(13)} ${String(b.id).padEnd(10)} ${b.label.padEnd(26)} ` +
      `$${b.hourly.toFixed(4)}/hr  ${b.detail}`,
  );
}
console.log("─".repeat(78));
console.log(
  `  TOTAL  $${totalHourly.toFixed(4)}/hr   ` +
    `$${(totalHourly * 24).toFixed(2)}/day   $${(totalHourly * 730).toFixed(2)}/month`,
);

if (foreign.length) {
  console.log(`\nNot ours, untouched (${foreign.length}): ${foreign.join(", ")}`);
} else {
  console.log(`\nNothing else visible to this token.`);
}

if (!APPLY) {
  console.log("\nReport only. Re-run with --apply to destroy everything listed above.");
  process.exit(0);
}

console.log("\nDestroying…");

// Build VMs first: they are pure waste and the cheapest thing to get wrong.
for (const b of billable.filter((x) => x.detail.includes("[BUILD VM]"))) {
  await b.destroy();
  console.log(`  destroyed build VM ${b.id} ${b.label}`);
}

// Then the clusters, which take their nodes and NodeBalancers with them.
for (const b of billable.filter((x) => x.kind === "lke")) {
  await b.destroy();
  console.log(`  deleted cluster ${b.id} ${b.label} (nodes + NodeBalancer follow)`);
}

console.log("\nVerifying…");
await new Promise((r) => setTimeout(r, 15_000));
const left = await instances.list();
const nbLeft = await linode.getAllPages<{ id: number }>("/nodebalancers");
const lkeLeft = await lke.listClusters();
console.log(`  instances: ${left.length}   nodebalancers: ${nbLeft.length}   clusters: ${lkeLeft.length}`);
if (left.length || nbLeft.length || lkeLeft.length) {
  console.log("  Some resources are still draining — LKE deletion is asynchronous.");
  console.log("  Re-run this script in a minute to confirm they are gone.");
} else {
  console.log("  Everything destroyed. Billing for v2 infrastructure has stopped.");
}
