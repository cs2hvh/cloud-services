/**
 * Kubernetes Deployments against paas.deployments.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/workload-drift.ts
 *   node --env-file=.env --env-file=.env.local scripts/v3/workload-drift.ts --json
 *
 * The same defect fleet-drift.ts catches, one layer down and invisible to it: a
 * workload with no row lives inside Kubernetes, on a node that IS recorded, in
 * a cluster that IS recorded. Fleet drift reports clean while the pod rides
 * along consuming capacity nobody is selling.
 *
 * Currency is pods, not dollars. LKE caps pods per cluster and the plan is
 * explicit that this cap — not CPU or RAM — is what forces a fleet.
 *
 * READ-ONLY. Nothing here scales, patches or deletes a workload.
 */

import { EXIT_CLEAN, EXIT_FINDINGS, EXIT_CANNOT_RUN } from "../../lib/paas/telemetry/exit-codes.ts";
import { db } from "../../lib/paas/db.ts";
import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";
import {
  capacityDrift,
  reconcileWorkloads,
  workloadFrom,
  type DeploymentRowLike,
  type PlacementLike,
} from "../../lib/paas/telemetry/workload-drift.ts";

const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const JSON_OUT = process.argv.includes("--json");

/** Namespaces the platform runs for itself. Their workloads are not tenants'. */
const PLATFORM_NS = new Set(["default", "kube-system", "kube-public", "kube-node-lease", "ahura-system", "platform"]);

const k = kube(loadKubeconfig(KUBECONFIG));
if (!(await k.healthz())) {
  console.error("cluster unreachable");
  process.exit(EXIT_CANNOT_RUN);
}

const deploymentList = await k.get<{
  items: Array<{
    metadata: { name: string; namespace: string; labels?: Record<string, string> };
    spec?: { replicas?: number };
    status?: { readyReplicas?: number };
  }>;
}>("/apis/apps/v1/deployments", true);

const workloads = (deploymentList?.items ?? [])
  .filter((d) => !PLATFORM_NS.has(d.metadata.namespace))
  .map(workloadFrom);

const [rows, placementRows, clusters] = await Promise.all([
  // paas.deployments has no created_at — it tracks queued_at/started_at/ready_at.
  // queued_at is the one that always exists, so it is what orders a project's
  // deployments when deciding which is superseded.
  db.select<DeploymentRowLike>("deployments", "select=ref,state,project_id,scaled_to_zero_at,created_at:queued_at"),
  // deployment_placements keys on deployment_id; resolve to refs so the
  // classifier compares like with like.
  db.select<{ deployment_id: string; namespace: string }>(
    "deployment_placements",
    "select=deployment_id,namespace",
  ),
  db.select<{ ref: string; pod_allocated: number; pod_capacity: number }>(
    "clusters",
    "select=ref,pod_allocated,pod_capacity&state=eq.ready",
  ),
]);

const idToRef = new Map<string, string>();
const withIds = await db.select<{ id: string; ref: string }>("deployments", "select=id,ref");
for (const d of withIds) idToRef.set(d.id, d.ref);

const placements: PlacementLike[] = placementRows.map((p) => ({
  ref: idToRef.get(p.deployment_id),
  namespace: p.namespace,
}));

const report = reconcileWorkloads({ workloads, deployments: rows, placements });

// EVERY pod, platform namespaces included. pod_allocated counts against the
// LKE pod cap and that cap counts everything — comparing it to the tenant
// count above reports a large false drift on a consistent cluster.
const allPods = await k.get<{ items: Array<{ status?: { phase?: string } }> }>("/api/v1/pods", true);
const runningPods = (allPods?.items ?? []).filter((p) => p.status?.phase === "Running").length;

const recordedPods = clusters.reduce((n, c) => n + c.pod_allocated, 0);
const capacity = capacityDrift(recordedPods, runningPods);

if (JSON_OUT) {
  console.log(JSON.stringify({ ...report, capacity, clusters }, null, 2));
  process.exit(report.clean && !capacity.significant ? EXIT_CLEAN : EXIT_FINDINGS);
}

const line = "─".repeat(96);
console.log(`\nWorkload drift — Kubernetes Deployments vs paas.deployments`);
console.log(line);
console.log(
  `  cluster: ${workloads.length} tenant Deployment(s), ${report.observedPods} pod(s) ready` +
    (report.asleep ? `, ${report.asleep} asleep on purpose` : ""),
);
console.log(`  records: ${rows.length} deployment row(s), ${placements.length} placement(s)`);
console.log(line);

for (const f of report.findings) {
  console.log(
    `  ${f.status.toUpperCase().padEnd(16)} ${f.deploymentRef.padEnd(20)} ` +
      `${String(f.pods).padStart(3)} pod(s)  ${f.namespace}`,
  );
  console.log(`                   ${f.detail}`);
  if (f.action) console.log(`                   → ${f.action}`);
}
if (report.findings.length === 0) console.log(`  No workloads and no rows.`);

console.log(line);
console.log(
  `  UNACCOUNTED PODS  ${report.unaccountedPods}` +
    (report.unaccountedPods > 0 ? `   ← capacity nobody is selling and nothing will reap` : ""),
);
console.log(
  `  pod_allocated     ${capacity.recorded} recorded, ${capacity.observed} running ` +
    `cluster-wide (platform included), drift ${capacity.drift >= 0 ? "+" : ""}${capacity.drift}` +
    (capacity.significant ? `   ← placement is scheduling against fiction` : ""),
);
console.log(
  report.clean && !capacity.significant
    ? `\n  Every workload has a row, and every ready row has a workload.\n`
    : `\n  ${report.findings.filter((f) => f.actionable).length} finding(s) need a human. Nothing was changed.\n`,
);

process.exit(report.clean && !capacity.significant ? EXIT_CLEAN : EXIT_FINDINGS);
