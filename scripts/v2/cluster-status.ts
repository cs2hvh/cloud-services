/**
 * Report the live state of the v2 cluster, straight from the Kubernetes API.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/cluster-status.ts
 */

import { loadKubeconfig, kube, nodeIsReady } from "../../lib/paas/k8s/client.ts";

const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";

const ctx = loadKubeconfig(KUBECONFIG);
const k = kube(ctx);

console.log(`\nCluster: ${ctx.server}\n` + "─".repeat(88));

const alive = await k.healthz();
console.log(`healthz            ${alive ? "ok" : "UNREACHABLE"}`);
if (!alive) process.exit(1);

const v = await k.version();
console.log(`version            ${v.gitVersion} (${v.platform})`);

const nodes = await k.listNodes();
console.log(`\nNodes (${nodes.length}):`);
for (const n of nodes) {
  const pool = n.metadata.labels?.["ahura.cloud/pool"] ?? "-";
  const taints = (n.spec?.taints ?? []).map((t) => `${t.key}=${t.value ?? ""}:${t.effect}`).join(",") || "none";
  console.log(
    `  ${n.metadata.name.padEnd(30)} pool=${pool.padEnd(8)} ready=${String(nodeIsReady(n)).padEnd(5)} ` +
      `cpu=${n.status?.allocatable?.cpu ?? "?"} mem=${n.status?.allocatable?.memory ?? "?"}`,
  );
  console.log(`    runtime=${n.status?.nodeInfo?.containerRuntimeVersion ?? "?"}  taints=${taints}`);
}

const ns = await k.listNamespaces();
console.log(`\nNamespaces (${ns.length}): ${ns.map((n) => n.metadata.name).join(", ")}`);

const rcs = await k.listRuntimeClasses();
console.log(`\nRuntimeClasses (${rcs.length}): ${rcs.map((r) => `${r.metadata.name}->${r.handler}`).join(", ") || "none"}`);
if (!rcs.some((r) => r.metadata.name === "gvisor")) {
  console.log("  NOTE: gvisor RuntimeClass absent — untrusted workloads must not be scheduled yet.");
}

const kubeSystem = await k.listPods("kube-system");
const notReady = kubeSystem.filter(
  (p) => p.status?.phase !== "Running" || (p.status?.containerStatuses ?? []).some((c) => !c.ready),
);
console.log(`\nkube-system pods: ${kubeSystem.length} total, ${notReady.length} not ready`);
for (const p of notReady) console.log(`  not ready: ${p.metadata.name} (${p.status?.phase})`);
console.log("");
