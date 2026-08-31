/**
 * Install the activator.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/install-activator.ts [--apply]
 *
 * Verifies by asking it to serve, not by asking Kubernetes whether it is ready.
 */

import { createHash } from "node:crypto";
import { kube, loadKubeconfig } from "../../lib/paas/k8s/client.ts";
import { PAAS_NAMESPACE } from "../../lib/paas/k8s/manifests.ts";
import {
  ACTIVATOR_NAME,
  ACTIVATOR_SCRIPT,
  activatorServiceAccount,
  activatorClusterRole,
  activatorClusterRoleBinding,
  activatorService,
  activatorConfigMap,
  activatorDeployment,
} from "../../lib/paas/k8s/activator.ts";

const APPLY = process.argv.includes("--apply");
const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const k = kube(loadKubeconfig(KUBECONFIG));

const hash = createHash("sha256").update(ACTIVATOR_SCRIPT).digest("hex").slice(0, 16);

const objects: Array<[string, unknown]> = [
  [`/api/v1/namespaces/${PAAS_NAMESPACE}/serviceaccounts/${ACTIVATOR_NAME}`, activatorServiceAccount()],
  [`/apis/rbac.authorization.k8s.io/v1/clusterroles/ahura-activator`, activatorClusterRole()],
  [`/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/ahura-activator`, activatorClusterRoleBinding()],
  [`/api/v1/namespaces/${PAAS_NAMESPACE}/configmaps/${ACTIVATOR_NAME}-src`, activatorConfigMap()],
  [`/api/v1/namespaces/${PAAS_NAMESPACE}/services/${ACTIVATOR_NAME}`, activatorService()],
  [`/apis/apps/v1/namespaces/${PAAS_NAMESPACE}/deployments/${ACTIVATOR_NAME}`, activatorDeployment(hash)],
];

console.log(`\nActivator (script ${hash})\n` + "═".repeat(64));

if (!APPLY) {
  for (const [path] of objects) console.log(`  would apply  ${path.split("/").slice(-2).join("/")}`);
  console.log("\nDry run. Re-run with --apply.");
  process.exit(0);
}

for (const [path, body] of objects) {
  await k.apply(path, body);
  console.log(`  applied  ${path.split("/").slice(-2).join("/")}`);
}

console.log("\nWaiting for the activator to answer a request...");

// Readiness is not the test. The activator's whole job is to respond, and a pod
// can be Ready while its script is crashing on every connection.
let ok = false;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  try {
    const pods = await k.get<{ items?: Array<{ metadata?: { name?: string }; status?: { phase?: string } }> }>(
      `/api/v1/namespaces/${PAAS_NAMESPACE}/pods?labelSelector=ahura.cloud%2Fcomponent%3D${ACTIVATOR_NAME}`,
    );
    const pod = pods?.items?.find((p) => p.status?.phase === "Running");
    if (!pod?.metadata?.name) {
      process.stdout.write(`\r  ${(i + 1) * 3}s — no running pod yet   `);
      continue;
    }
    const body = await k.raw<string>({
      method: "GET",
      path: `/api/v1/namespaces/${PAAS_NAMESPACE}/pods/${pod.metadata.name}:${8080}/proxy/healthz`,
    });
    if (String(body).trim() === "ok") {
      console.log(`\n  ${pod.metadata.name} answered /healthz after ${(i + 1) * 3}s`);
      ok = true;
      break;
    }
  } catch {
    process.stdout.write(`\r  ${(i + 1) * 3}s — not answering yet   `);
  }
}

if (!ok) {
  console.log("\n\nFAILED: the activator is installed but did not answer /healthz.");
  console.log("Check its logs — a syntax error in the mounted script looks exactly like this.");
  process.exit(1);
}

console.log("\nActivator is serving. It is in the request path ONLY for sleeping apps.");
