/**
 * Install the platform layer into the v2 cluster.
 *
 *   node --env-file=.env.local scripts/v2/bootstrap-cluster.ts [--apply]
 *
 * Idempotent: everything is applied with Server-Side Apply, so re-running
 * converges rather than duplicating.
 */

import { loadKubeconfig, kube, KubeError } from "../../lib/paas/k8s/client.ts";
import {
  PAAS_NAMESPACE,
  namespaceManifest,
  registrySecret,
  registryDeployment,
  registryService,
  registryProxyDaemonSet,
} from "../../lib/paas/k8s/manifests.ts";
import { paasConfig } from "../../lib/paas/config.ts";

const APPLY = process.argv.includes("--apply");
const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";

const k = kube(loadKubeconfig(KUBECONFIG));

const steps: Array<{ what: string; path: string; body: unknown }> = [
  {
    what: `namespace ${PAAS_NAMESPACE}`,
    path: `/api/v1/namespaces/${PAAS_NAMESPACE}`,
    body: namespaceManifest(PAAS_NAMESPACE, { "ahura.cloud/tier": "platform" }),
  },
  {
    what: "registry R2 credentials",
    path: `/api/v1/namespaces/${PAAS_NAMESPACE}/secrets/registry-r2`,
    body: registrySecret(paasConfig.r2.accessKeyId(), paasConfig.r2.secretAccessKey()),
  },
  {
    what: "registry deployment",
    path: `/apis/apps/v1/namespaces/${PAAS_NAMESPACE}/deployments/registry`,
    body: registryDeployment({ endpoint: paasConfig.r2.endpoint(), bucket: paasConfig.r2.bucket() }),
  },
  {
    what: "registry service",
    path: `/api/v1/namespaces/${PAAS_NAMESPACE}/services/registry`,
    body: registryService(),
  },
  {
    // Lets the kubelet pull from the in-cluster registry over 127.0.0.1, which
    // containerd treats as insecure by default. Without this the pull fails:
    // containerd resolves image hostnames with the node's resolver, which
    // cannot see *.svc.cluster.local, and LKE gives no way to edit node config.
    what: "node-local registry proxy",
    path: `/apis/apps/v1/namespaces/${PAAS_NAMESPACE}/daemonsets/registry-proxy`,
    body: registryProxyDaemonSet(),
  },
];

console.log(`\nBootstrapping ${PAAS_NAMESPACE}\n` + "─".repeat(72));

if (!APPLY) {
  for (const s of steps) console.log(`  would apply  ${s.what.padEnd(28)} ${s.path}`);
  console.log("\nDry run. Re-run with --apply.");
  process.exit(0);
}

for (const s of steps) {
  try {
    await k.apply(s.path, s.body);
    console.log(`  applied      ${s.what}`);
  } catch (e) {
    const err = e as KubeError;
    console.log(`  FAILED       ${s.what}: ${err.message}`);
    process.exit(1);
  }
}

// Wait for the registry to report ready, so the next step can rely on it.
console.log("\nWaiting for registry…");
const deadline = Date.now() + 4 * 60_000;
let ready = false;
while (Date.now() < deadline) {
  const pods = await k.listPods(PAAS_NAMESPACE);
  const reg = pods.filter((p) => p.metadata.labels?.["ahura.cloud/component"] === "registry");
  ready = reg.some(
    (p) => p.status?.phase === "Running" && (p.status?.containerStatuses ?? []).every((c) => c.ready),
  );
  if (ready) break;
  const state = reg.map((p) => `${p.metadata.name}=${p.status?.phase}`).join(", ") || "no pod yet";
  process.stdout.write(`\r  ${state}          `);
  await new Promise((r) => setTimeout(r, 5000));
}
console.log("");

if (!ready) {
  console.log("Registry did not become ready. Recent pod state:");
  for (const p of await k.listPods(PAAS_NAMESPACE)) {
    console.log(`  ${p.metadata.name} phase=${p.status?.phase}`);
    for (const c of p.status?.containerStatuses ?? []) {
      console.log(`    ready=${c.ready} restarts=${c.restartCount} image=${c.image}`);
    }
  }
  process.exit(1);
}

console.log("Registry ready.");
console.log("\nNext: scripts/v2/deploy-e2e.ts to publish an image and run it.");
