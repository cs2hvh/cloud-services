/**
 * Bring clusters.pod_allocated in line with the clusters themselves.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/sync-placement.ts [--apply]
 *
 * Placement reads pod_allocated to decide where the next app goes, and LKE
 * enforces the pod cap hard. Nothing wrote this column until now, so it read 0
 * against a cluster that was not empty — a number drifting low, in the
 * direction that overcommits.
 */

import { clusters } from "../../lib/paas/db.ts";
import { kube, loadKubeconfig } from "../../lib/paas/k8s/client.ts";
import { syncAllPodAllocations, headroom } from "../../lib/paas/placement.ts";

const APPLY = process.argv.includes("--apply");
const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";

// One kubeconfig today. When the fleet is multi-cluster this maps cluster ref →
// its own kubeconfig; a cluster with no config reports "no kubeconfig" rather
// than being silently skipped, because a cluster we cannot read is not a
// cluster with no pods.
const client = kube(loadKubeconfig(KUBECONFIG));

const results = await syncAllPodAllocations(() => client, { dryRun: !APPLY });

console.log(`\nPlacement accounting${APPLY ? "" : "  (dry run)"}\n` + "═".repeat(70));
for (const r of results) {
  if (r.error) {
    console.log(`  ${r.clusterRef}  UNREADABLE — ${r.error}`);
    console.log(`     left at ${r.recorded}; writing 0 here would invent empty capacity.`);
    continue;
  }
  const verb = r.changed ? (APPLY ? "corrected" : "would correct") : "already correct";
  console.log(
    `  ${r.clusterRef}  ${String(r.recorded).padStart(4)} recorded → ` +
      `${String(r.observed).padStart(4)} observed   ${verb}`,
  );
  if (r.overCapacity) {
    console.log(`     OVER CAPACITY: ${r.observed} pods against a recorded cap of ${r.capacity}.`);
  }
}

if (APPLY) {
  console.log("\nHeadroom after sync:");
  for (const c of (await clusters.list()).filter((c) => c.state === "ready")) {
    console.log(`  ${c.ref}  ${c.pod_allocated}/${c.pod_capacity} used, ${headroom(c)} free`);
  }
} else {
  console.log("\nDry run. Re-run with --apply.");
}
