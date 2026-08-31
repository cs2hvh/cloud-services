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
  /** null means the price is genuinely unknown. Never write 0 for unknown. */
  hourly: number | null;
  /**
   * Lives for minutes, not months. Build VMs are real spend but must never be
   * projected forward: a throwaway VM across 730 hours turns $0.002 into $26.
   */
  transient: boolean;
  destroy: () => Promise<unknown>;
}

/** Resources whose Linode type carried no price. The total understates by these. */
const unpriced: string[] = [];

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
  // Deliberately NOT `?? 0`. A type Linode has added, or a /linode/types page
  // that drained short, would price a running machine at nothing and make this
  // report read as reassuring exactly when it is wrong.
  const priced = priceOf.get(i.type)?.hourly;
  const hourly = priced ?? null;
  if (priced === undefined) unpriced.push(`${i.label} (type ${i.type})`);
  billable.push({
    kind: "instance",
    id: i.id,
    label: i.label,
    detail: `${i.type} ${i.status}${isBuild ? " [BUILD VM]" : " [cluster node]"}`,
    hourly,
    transient: isBuild,
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
    transient: false,
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
    detail:
      `${c.k8s_version} ${c.region} — deleting this removes its nodes AND its NodeBalancer` +
      (c.control_plane?.high_availability ? " [HA control plane]" : ""),
    // LKE's standard control plane is free; HA is $60/mo. Zero is right today
    // and wrong by $60/mo the day a production cluster exists — and the plan
    // says the first one must be created with HA on, because enabling it later
    // is irreversible and recreates every node.
    hourly: c.control_plane?.high_availability ? 60 / 730 : 0,
    transient: false,
    destroy: () => lke.deleteCluster(c.id),
  });
}

const sum = (rows: Billable[]) => rows.reduce((n, b) => n + (b.hourly ?? 0), 0);
const standingHourly = sum(billable.filter((b) => !b.transient));
const transientHourly = sum(billable.filter((b) => b.transient));
const totalHourly = standingHourly + transientHourly;

console.log("\nv2 infrastructure currently running\n" + "─".repeat(78));
for (const b of billable) {
  const cost = b.hourly === null ? "   unknown/hr" : `$${b.hourly.toFixed(4)}/hr`;
  console.log(
    `  ${b.kind.padEnd(13)} ${String(b.id).padEnd(10)} ${b.label.padEnd(26)} ` +
      `${cost}  ${b.detail}`,
  );
}
console.log("─".repeat(78));
console.log(
  `  standing   $${standingHourly.toFixed(4)}/hr   ` +
    `$${(standingHourly * 24).toFixed(2)}/day   $${(standingHourly * 730).toFixed(2)}/month`,
);
if (transientHourly > 0) {
  console.log(
    `  transient  $${transientHourly.toFixed(4)}/hr   build VMs — live for minutes, ` +
      `deliberately not projected`,
  );
}
console.log(`  TOTAL      $${totalHourly.toFixed(4)}/hr right now`);

if (unpriced.length) {
  console.log(
    `\n  ${unpriced.length} resource(s) had no price in /linode/types, so the totals ` +
      `above are UNDERSTATED:`,
  );
  for (const u of unpriced) console.log(`    - ${u}`);
}

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
