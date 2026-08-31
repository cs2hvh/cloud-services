/**
 * Install metrics-server.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/install-metrics-server.ts [--apply]
 *
 * Unblocks per-pod CPU/memory readings, which usage metering needs to tell a
 * busy app from a warm idle one. Applied unconditionally on every run —
 * Server-Side Apply is idempotent, and conditional apply is the bug this
 * codebase has now found four times.
 */

import { kube, loadKubeconfig } from "../../lib/paas/k8s/client.ts";
import {
  METRICS_SERVER_VERSION,
  metricsServerServiceAccount,
  metricsServerAggregatedReader,
  metricsServerClusterRole,
  metricsServerAuthReaderBinding,
  metricsServerAuthDelegatorBinding,
  metricsServerClusterRoleBinding,
  metricsServerService,
  metricsServerDeployment,
  metricsServerApiService,
} from "../../lib/paas/k8s/metrics-server.ts";

const APPLY = process.argv.includes("--apply");
const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const k = kube(loadKubeconfig(KUBECONFIG));

const objects: Array<[string, unknown]> = [
  ["/api/v1/namespaces/kube-system/serviceaccounts/metrics-server", metricsServerServiceAccount()],
  ["/apis/rbac.authorization.k8s.io/v1/clusterroles/system:aggregated-metrics-reader", metricsServerAggregatedReader()],
  ["/apis/rbac.authorization.k8s.io/v1/clusterroles/system:metrics-server", metricsServerClusterRole()],
  ["/apis/rbac.authorization.k8s.io/v1/namespaces/kube-system/rolebindings/metrics-server-auth-reader", metricsServerAuthReaderBinding()],
  ["/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/metrics-server:system:auth-delegator", metricsServerAuthDelegatorBinding()],
  ["/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/system:metrics-server", metricsServerClusterRoleBinding()],
  ["/api/v1/namespaces/kube-system/services/metrics-server", metricsServerService()],
  ["/apis/apps/v1/namespaces/kube-system/deployments/metrics-server", metricsServerDeployment()],
  ["/apis/apiregistration.k8s.io/v1/apiservices/v1beta1.metrics.k8s.io", metricsServerApiService()],
];

console.log(`\nmetrics-server ${METRICS_SERVER_VERSION}\n` + "═".repeat(66));

if (!APPLY) {
  for (const [path] of objects) console.log(`  would apply  ${path}`);
  console.log("\nDry run. Re-run with --apply.");
  process.exit(0);
}

for (const [path, body] of objects) {
  await k.apply(path, body);
  console.log(`  applied  ${path.split("/").slice(-2).join("/")}`);
}

console.log("\nWaiting for it to actually serve metrics...");

// Readiness of the Deployment is NOT proof. The classic LKE failure is a
// healthy pod whose kubelet scrapes all fail TLS verification: metrics-server
// reports ready and the metrics API returns an empty list forever. So the check
// is whether real numbers come back, not whether the pod is up.
let served = false;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  try {
    const m = await k.get<{ items?: Array<{ metadata?: { name?: string }; usage?: Record<string, string> }> }>(
      "/apis/metrics.k8s.io/v1beta1/nodes",
      true,
    );
    if (m?.items?.length) {
      console.log(`\n  node metrics after ${(i + 1) * 5}s:`);
      for (const n of m.items) {
        console.log(`    ${n.metadata?.name}  cpu=${n.usage?.cpu}  memory=${n.usage?.memory}`);
      }
      served = true;
      break;
    }
    process.stdout.write(`\r  ${(i + 1) * 5}s — API up, no readings yet   `);
  } catch {
    process.stdout.write(`\r  ${(i + 1) * 5}s — metrics API not registered yet   `);
  }
}

if (!served) {
  console.log("\n\nFAILED: metrics-server is installed but returned no readings.");
  console.log("On LKE this is almost always kubelet TLS. Check the pod logs for");
  console.log("'x509' or 'unable to fully scrape metrics'.");
  process.exit(1);
}

console.log("\nmetrics-server is serving real numbers. Pod metrics are available at");
console.log("  /apis/metrics.k8s.io/v1beta1/pods");
