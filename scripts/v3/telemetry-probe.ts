/**
 * What telemetry can this cluster actually serve?
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/telemetry-probe.ts
 *
 * Answers the preconditions for metrics and runtime logs before anything is
 * built on top of them, because the alternative is writing a metrics API
 * against an aggregated API that was never installed and discovering it at
 * the point a dashboard shows zeros. Zeros are indistinguishable from an idle
 * app, which is the worst possible failure for a usage meter.
 *
 * READ-ONLY. GETs against the Kubernetes API.
 */

import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";

const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";

const ctx = loadKubeconfig(KUBECONFIG);
const k = kube(ctx);

const ok = (b: boolean) => (b ? "yes" : "NO");

console.log(`\nTelemetry probe — ${ctx.server}\n${"─".repeat(84)}`);

if (!(await k.healthz())) {
  console.log("cluster unreachable");
  process.exit(1);
}

// ── metrics.k8s.io: the precondition for T4 ─────────────────────────────────

const apiGroups = await k.raw<{ groups: Array<{ name: string; versions: Array<{ version: string }> }> }>({
  method: "GET",
  path: "/apis",
  allowMissing: true,
});
const hasMetricsGroup = (apiGroups?.groups ?? []).some((g) => g.name === "metrics.k8s.io");

const nodeMetrics = await k.raw<{ items: Array<{ metadata: { name: string }; usage: Record<string, string> }> }>({
  method: "GET",
  path: "/apis/metrics.k8s.io/v1beta1/nodes",
  allowMissing: true,
});

console.log(`metrics.k8s.io registered      ${ok(hasMetricsGroup)}`);
console.log(`node metrics readable          ${ok(!!nodeMetrics?.items?.length)}`);
if (nodeMetrics?.items?.length) {
  for (const n of nodeMetrics.items) {
    console.log(`  ${n.metadata.name.padEnd(30)} cpu=${n.usage.cpu} mem=${n.usage.memory}`);
  }
} else {
  console.log(`  metrics-server is not serving. Per-app CPU/memory is NOT available until it is.`);
}

// ── what a usage meter would have to walk ───────────────────────────────────

const namespaces = await k.listNamespaces();
const tenantNs = namespaces.filter(
  (n) => !["default", "kube-system", "kube-public", "kube-node-lease", "platform"].includes(n.metadata.name),
);

console.log(`\nnamespaces                     ${namespaces.length} total, ${tenantNs.length} tenant-shaped`);
for (const n of tenantNs) {
  const pods = await k.listPods(n.metadata.name);
  const running = pods.filter((p) => p.status?.phase === "Running").length;
  const restarts = pods.reduce(
    (sum, p) => sum + (p.status?.containerStatuses ?? []).reduce((s, c) => s + (c.restartCount ?? 0), 0),
    0,
  );
  console.log(
    `  ${n.metadata.name.padEnd(30)} pods=${pods.length} running=${running} restarts=${restarts}`,
  );
  for (const p of pods) {
    const cs = p.status?.containerStatuses ?? [];
    const rc = cs.reduce((s, c) => s + (c.restartCount ?? 0), 0);
    const waiting = cs.find((c) => !c.ready)?.state?.waiting?.reason;
    console.log(
      `      ${p.metadata.name.padEnd(44)} ${p.status?.phase ?? "?"}` +
        `${rc > 0 ? `  restarts=${rc}` : ""}${waiting ? `  waiting=${waiting}` : ""}`,
    );
  }
}

// ── sandbox posture, since it gates everything else ─────────────────────────

const rcs = await k.listRuntimeClasses();
console.log(`\nRuntimeClasses                 ${rcs.map((r) => r.metadata.name).join(", ") || "none"}`);
console.log(`gvisor present                 ${ok(rcs.some((r) => r.metadata.name === "gvisor"))}`);

console.log(
  `\n${hasMetricsGroup ? "T4 (metrics) is unblocked." : "T4 (metrics) BLOCKED: metrics-server not installed."}\n`,
);
