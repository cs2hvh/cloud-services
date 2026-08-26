/**
 * Reconcile Linode reality against what the control plane believes.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/reconcile.ts          # report
 *   node --env-file=.env --env-file=.env.local scripts/v2/reconcile.ts --apply  # correct drift
 *
 * Reports drift in BOTH directions, because they fail differently:
 *
 *   UNTRACKED — a cloud resource with no row. This is money nobody knows about.
 *               It is how this project spent ~$116/month with both fleet tables
 *               empty, and it is the same shape as the v1 defect that left five
 *               billing meters active for apps that no longer exist.
 *
 *   STALE     — a row claiming a resource that is gone. Harmless to the wallet
 *               but it makes the control plane lie, which is how capacity
 *               planning and quota enforcement quietly go wrong.
 *
 * Read-only unless --apply. Even with --apply it never destroys cloud
 * resources: it backfills rows for untracked infrastructure and closes rows for
 * things already gone. Destroying is teardown.ts's job, deliberately separate —
 * a reconciler that deletes is a reconciler nobody dares run.
 */

import { instances, lke, linode } from "../../lib/paas/linode/client.ts";
import { clusters, buildVms, db } from "../../lib/paas/db.ts";

const APPLY = process.argv.includes("--apply");
const BUILD_TAG = "ahura-v2-build";
const V2_TAG = "ahura-v2";

if (!(await db.reachable())) {
  console.log("paas schema unreachable — cannot reconcile.");
  process.exit(1);
}

const types = await linode.getAllPages<{ id: string; price: { hourly: number } }>("/linode/types");
const hourlyOf = new Map(types.map((t) => [t.id, t.price?.hourly ?? 0]));

const [liveInstances, liveClusters, clusterRows, vmRows] = await Promise.all([
  instances.list(),
  lke.listClusters(),
  clusters.list(),
  buildVms.live(),
]);

interface Drift {
  kind: "UNTRACKED" | "STALE";
  what: string;
  detail: string;
  hourly: number;
  fix?: () => Promise<string>;
}

const drift: Drift[] = [];

// ── clusters ────────────────────────────────────────────────────────────────
const recordedClusterIds = new Set(clusterRows.map((r) => r.lke_cluster_id).filter(Boolean));

for (const c of liveClusters) {
  if (recordedClusterIds.has(c.id)) continue;
  // Node cost is attributed to the cluster, since deleting the cluster is what
  // actually stops it.
  const nodeCost = liveInstances
    .filter((i) => i.label.startsWith(`lke${c.id}-`))
    .reduce((n, i) => n + (hourlyOf.get(i.type) ?? 0), 0);
  drift.push({
    kind: "UNTRACKED",
    what: `LKE cluster ${c.id}`,
    detail: `${c.label} ${c.k8s_version} ${c.region} — running with no paas.clusters row`,
    hourly: nodeCost + 0.015, // + its NodeBalancer
    fix: async () => {
      const row = await clusters.reserve({ name: c.label, region: c.region, podCapacity: 1000 });
      await clusters.attach(row.ref, c.id, c.k8s_version);
      await clusters.markReady(row.ref);
      return `backfilled ${row.ref}`;
    },
  });
}

for (const row of clusterRows) {
  if (row.state === "retired") continue;
  if (row.lke_cluster_id && liveClusters.some((c) => c.id === row.lke_cluster_id)) continue;
  drift.push({
    kind: "STALE",
    what: `paas.clusters ${row.ref}`,
    detail:
      row.lke_cluster_id === null
        ? `reserved but never attached to a cluster (state=${row.state})`
        : `claims LKE cluster ${row.lke_cluster_id}, which no longer exists`,
    hourly: 0,
    fix: async () => {
      await clusters.markRetired(row.ref);
      return `marked retired`;
    },
  });
}

// ── build VMs ───────────────────────────────────────────────────────────────
const liveBuildVms = liveInstances.filter((i) => i.tags.includes(BUILD_TAG));
const recordedVmIds = new Set(vmRows.map((r) => r.linode_id).filter(Boolean));

for (const i of liveBuildVms) {
  if (recordedVmIds.has(i.id)) continue;
  const ageMin = Math.round((Date.now() - new Date(i.created).getTime()) / 60_000);
  drift.push({
    kind: "UNTRACKED",
    what: `build VM ${i.id}`,
    detail: `${i.label} ${i.type} up ${ageMin}m with no paas.build_vms row`,
    hourly: hourlyOf.get(i.type) ?? 0,
    fix: async () => {
      const row = await buildVms.reserve({
        region: i.region,
        instanceType: i.type,
        // Already past its useful life by definition: give the reaper a
        // deadline it will act on immediately.
        expiresAt: new Date(Date.now() - 1000),
      });
      await buildVms.attach(row.ref, i.id);
      return `backfilled ${row.ref} — reaper will destroy it`;
    },
  });
}

const liveVmIds = new Set(liveBuildVms.map((i) => i.id));
for (const row of vmRows) {
  if (row.linode_id && liveVmIds.has(row.linode_id)) continue;
  drift.push({
    kind: "STALE",
    what: `paas.build_vms ${row.ref}`,
    detail:
      row.linode_id === null
        ? `reserved but no instance was ever attached (state=${row.state})`
        : `claims Linode ${row.linode_id}, which is gone (state=${row.state})`,
    hourly: 0,
    fix: async () => {
      await buildVms.setState(row.ref, "destroyed", "reconciler: no matching instance");
      return `closed as destroyed`;
    },
  });
}

// ── report ──────────────────────────────────────────────────────────────────
console.log("\nControl plane vs Linode reality\n" + "═".repeat(84));
console.log(
  `Linode:  ${liveClusters.length} cluster(s), ${liveInstances.length} instance(s), ` +
    `${liveBuildVms.length} build VM(s)`,
);
console.log(`Records: ${clusterRows.length} cluster row(s), ${vmRows.length} live build VM row(s)`);
console.log("─".repeat(84));

if (!drift.length) {
  console.log("\nNo drift. Every resource has a record and every record has a resource.\n");
  process.exit(0);
}

const untrackedCost = drift.filter((d) => d.kind === "UNTRACKED").reduce((n, d) => n + d.hourly, 0);

for (const d of drift) {
  const cost = d.hourly > 0 ? `  $${d.hourly.toFixed(4)}/hr` : "";
  console.log(`\n  [${d.kind}] ${d.what}${cost}`);
  console.log(`      ${d.detail}`);
}

console.log("\n" + "─".repeat(84));
console.log(
  `${drift.filter((d) => d.kind === "UNTRACKED").length} untracked, ` +
    `${drift.filter((d) => d.kind === "STALE").length} stale.`,
);
if (untrackedCost > 0) {
  console.log(
    `Untracked infrastructure is costing $${untrackedCost.toFixed(4)}/hr ` +
      `($${(untrackedCost * 730).toFixed(2)}/month) with nothing tracking it.`,
  );
}

if (!APPLY) {
  console.log("\nReport only. Re-run with --apply to correct the records.");
  process.exit(untrackedCost > 0 ? 1 : 0);
}

console.log("\nCorrecting…");
for (const d of drift) {
  if (!d.fix) continue;
  try {
    console.log(`  ${d.what}: ${await d.fix()}`);
  } catch (e) {
    console.log(`  ${d.what}: FAILED — ${(e as Error).message.slice(0, 160)}`);
  }
}
console.log("\nRe-run without --apply to confirm the drift is gone.");
