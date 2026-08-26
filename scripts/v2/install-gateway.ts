/**
 * Install the edge gateway and report the public address it lands on.
 *
 *   node --env-file=.env.local scripts/v2/install-gateway.ts [--apply]
 *
 * Creates a Linode NodeBalancer (~$10/month) via a LoadBalancer Service.
 */

import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";
import { PAAS_NAMESPACE } from "../../lib/paas/k8s/manifests.ts";
import { readFileSync } from "node:fs";
import {
  gatewayServiceAccount,
  gatewayClusterRole,
  gatewayClusterRoleBinding,
  gatewayIngressClass,
  gatewayDeployment,
  gatewayService,
  gatewayTlsSecret,
  gatewayTlsConfigMap,
} from "../../lib/paas/k8s/gateway.ts";

const APPLY = process.argv.includes("--apply");
const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const k = kube(loadKubeconfig(KUBECONFIG));

const CERT = process.env.V2_ORIGIN_CERT ?? "C:/ahura-secrets/origin-v2.crt";
const KEY = process.env.V2_ORIGIN_KEY ?? "C:/ahura-secrets/origin-v2.key";

const steps = [
  { what: "origin certificate", path: `/api/v1/namespaces/${PAAS_NAMESPACE}/secrets/origin-cert`, body: gatewayTlsSecret(readFileSync(CERT,"utf8"), readFileSync(KEY,"utf8")) },
  { what: "tls config", path: `/api/v1/namespaces/${PAAS_NAMESPACE}/configmaps/traefik-tls`, body: gatewayTlsConfigMap() },
  { what: "service account", path: `/api/v1/namespaces/${PAAS_NAMESPACE}/serviceaccounts/traefik`, body: gatewayServiceAccount() },
  { what: "cluster role", path: "/apis/rbac.authorization.k8s.io/v1/clusterroles/ahura-traefik", body: gatewayClusterRole() },
  { what: "cluster role binding", path: "/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/ahura-traefik", body: gatewayClusterRoleBinding() },
  { what: "ingress class", path: "/apis/networking.k8s.io/v1/ingressclasses/ahura", body: gatewayIngressClass() },
  { what: "gateway deployment", path: `/apis/apps/v1/namespaces/${PAAS_NAMESPACE}/deployments/traefik`, body: gatewayDeployment() },
  { what: "gateway service (NodeBalancer)", path: `/api/v1/namespaces/${PAAS_NAMESPACE}/services/traefik`, body: gatewayService() },
];

console.log("\nEdge gateway\n" + "─".repeat(72));

if (!APPLY) {
  for (const s of steps) console.log(`  would apply  ${s.what.padEnd(30)} ${s.path}`);
  console.log("\nA LoadBalancer Service creates a Linode NodeBalancer, ~$10/month.");
  console.log("Dry run. Re-run with --apply.");
  process.exit(0);
}

for (const s of steps) {
  await k.apply(s.path, s.body);
  console.log(`  applied      ${s.what}`);
}

console.log("\nWaiting for the gateway pod…");
let ready = false;
const podDeadline = Date.now() + 3 * 60_000;
while (Date.now() < podDeadline) {
  const pods = (await k.listPods(PAAS_NAMESPACE)).filter(
    (p) => p.metadata.labels?.["ahura.cloud/component"] === "gateway",
  );
  ready = pods.some((p) => p.status?.phase === "Running" && (p.status?.containerStatuses ?? []).every((c) => c.ready));
  if (ready) break;
  process.stdout.write(`\r  ${pods.map((p) => p.status?.phase).join(", ") || "no pod yet"}          `);
  await new Promise((r) => setTimeout(r, 5000));
}
console.log(ready ? "\n  gateway pod Ready" : "\n  gateway pod did NOT become ready");

console.log("\nWaiting for the NodeBalancer to be assigned an address…");
let addr: string | null = null;
const lbDeadline = Date.now() + 6 * 60_000;
while (Date.now() < lbDeadline) {
  const svc = await k.get<{ status?: { loadBalancer?: { ingress?: Array<{ ip?: string; hostname?: string }> } } }>(
    `/api/v1/namespaces/${PAAS_NAMESPACE}/services/traefik`,
  );
  const ing = svc?.status?.loadBalancer?.ingress?.[0];
  if (ing?.ip || ing?.hostname) {
    addr = ing.ip ?? ing.hostname!;
    break;
  }
  process.stdout.write("\r  provisioning…      ");
  await new Promise((r) => setTimeout(r, 10_000));
}
console.log("");

if (!addr) {
  console.log("NodeBalancer was not assigned an address within 6 minutes.");
  process.exit(1);
}

console.log(`\nPublic address: ${addr}`);
console.log(`\nPoint a DNS record at it, then apply an Ingress per alias.`);
console.log(`Note: this is a stable address that survives node replacement — v1 pointed`);
console.log(`customer DNS at a single hardcoded node IP and could never move.`);
