/**
 * Provision the v2 LKE cluster.
 *
 * IDEMPOTENT: if a cluster tagged `ahura-v2` already exists in the target
 * region it is reused, never duplicated. Safe to re-run.
 *
 *   node --env-file=.env.local scripts/v2/provision-cluster.ts          # plan only
 *   node --env-file=.env.local scripts/v2/provision-cluster.ts --apply  # create
 *
 * Two node pools, because the isolation model depends on separating them:
 *
 *   system  — Envoy Gateway, cert plumbing, observability. Customer pods never
 *             land here.
 *   runtime — customer workloads, tainted so nothing schedules there by
 *             accident, and the only pool that will carry gVisor.
 *
 * A build pool is deliberately absent: builds do NOT run in the cluster at all.
 * Each build leases its own throwaway Linode, because Linode has no nested
 * virtualisation and no bare metal, so renting a whole VM is the only way to
 * get a hardware-virtualised boundary around untrusted build code.
 *
 * HA control plane is OFF for this dev cluster. It costs $60/mo, and enabling
 * it later is IRREVERSIBLE and recreates every node — so the first cluster that
 * will ever serve production must be created with it ON from the start.
 */

import { lke, regions, instances, LinodeError } from "../../lib/paas/linode/client.ts";
import { paasConfig } from "../../lib/paas/config.ts";

const APPLY = process.argv.includes("--apply");
const TAG = "ahura-v2";
const LABEL = "ahura-v2-dev";
const REGION = paasConfig.linode.region();

// $48/mo each: 4 vCPU / 8GB. Enough headroom for the platform services plus
// the 5-10 test apps this cluster exists to prove out.
const NODE_TYPE = "g6-standard-4";

const PLAN = {
  label: LABEL,
  region: REGION,
  k8s_version: "1.36",
  tags: [TAG],
  control_plane: { high_availability: false },
  node_pools: [
    {
      type: NODE_TYPE,
      count: 1,
      labels: { "ahura.cloud/pool": "system" },
      disk_encryption: "enabled" as const,
    },
    {
      type: NODE_TYPE,
      count: 1,
      labels: { "ahura.cloud/pool": "runtime" },
      // NoSchedule keeps platform components off the tenant pool; tenant pods
      // carry the matching toleration.
      taints: [{ key: "ahura.cloud/runtime", value: "true", effect: "NoSchedule" }],
      disk_encryption: "enabled" as const,
    },
  ],
};

const MONTHLY = 48 * PLAN.node_pools.reduce((n, p) => n + p.count, 0);

async function main() {
  console.log("\nv2 cluster provisioning\n" + "─".repeat(72));

  // Refuse to build on a region that cannot do what the architecture needs.
  await regions.assertCapable(REGION, ["Kubernetes", "VPCs", "NodeBalancers"]);
  console.log(`region        ${REGION} — Kubernetes, VPCs, NodeBalancers all present`);

  const versions = (await lke.versions()).map((v) => v.id);
  if (!versions.includes(PLAN.k8s_version)) {
    throw new Error(
      `Kubernetes ${PLAN.k8s_version} not offered by LKE. Available: ${versions.join(", ")}`,
    );
  }
  console.log(`k8s           ${PLAN.k8s_version} (offered: ${versions.join(", ")})`);

  const existing = (await lke.listClusters()).filter((c) => c.tags?.includes(TAG));
  if (existing.length) {
    const c = existing[0];
    console.log(`\nAlready provisioned: ${c.label} id=${c.id} ${c.k8s_version} in ${c.region}`);
    const pools = await lke.listPools(c.id);
    for (const p of pools) {
      console.log(`  pool ${p.id}  ${p.type} x${p.count}  labels=${JSON.stringify(p.labels ?? {})}`);
    }
    // The kubeconfig appears minutes after the cluster row does, so a re-run
    // has to be able to pick it up rather than assuming provisioning failed.
    await waitForKubeconfig(c.id);
    return;
  }

  console.log(`\nPlan:`);
  for (const p of PLAN.node_pools) {
    console.log(
      `  ${String(p.labels["ahura.cloud/pool"]).padEnd(8)} ${p.type} x${p.count}` +
        (p.taints ? `  tainted ${p.taints[0].key}=${p.taints[0].value}:${p.taints[0].effect}` : "") +
        `  disk_encryption=${p.disk_encryption}`,
    );
  }
  console.log(`  control plane: HA off (dev). Enabling later is irreversible.`);
  console.log(`\nEstimated cost: ~$${MONTHLY}/month`);

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to create it.");
    return;
  }

  console.log("\nCreating…");
  const cluster = await lke.createCluster(PLAN);
  console.log(`Created cluster id=${cluster.id} label=${cluster.label}`);

  await waitForKubeconfig(cluster.id);
}

/**
 * Poll until the control plane hands over a kubeconfig.
 *
 * LKE returns the cluster row immediately but the kubeconfig only minutes
 * later, answering "not yet available" until then. That is a normal part of
 * provisioning, not a failure, so it must be tolerated rather than thrown on.
 */
async function waitForKubeconfig(clusterId: number): Promise<void> {
  const OUT = "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
  const { writeFileSync, mkdirSync, existsSync } = await import("node:fs");

  if (existsSync(OUT)) {
    console.log(`\nKubeconfig already present at ${OUT}`);
    return;
  }

  const deadline = Date.now() + 12 * 60_000;
  let kubeconfig: string | null = null;
  process.stdout.write("Waiting for control plane");

  while (Date.now() < deadline) {
    try {
      const res = await lke.kubeconfig(clusterId);
      if (res?.kubeconfig) {
        kubeconfig = Buffer.from(res.kubeconfig, "base64").toString("utf8");
        break;
      }
    } catch (e) {
      const msg = (e as Error).message;
      const stillProvisioning =
        /not yet available|kubeconfig is not/i.test(msg) ||
        (e instanceof LinodeError && (e.code === "NOT_FOUND" || e.code === "SERVER"));
      if (!stillProvisioning) throw e;
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 15_000));
  }
  console.log("");

  if (!kubeconfig) {
    throw new Error(
      `control plane not ready within 12 minutes. Cluster ${clusterId} exists — re-run this script to resume.`,
    );
  }

  mkdirSync("C:/ahura-secrets", { recursive: true });
  // A kubeconfig is a full-cluster credential. It lives outside every git repo,
  // exactly like the GitHub App key.
  writeFileSync(OUT, kubeconfig, { mode: 0o600 });
  console.log(`Kubeconfig written to ${OUT} (outside all repos)`);

  const nodes = await instances.listByTag(TAG);
  console.log(`\nCluster ${clusterId} ready. ${nodes.length} tagged instance(s) visible.`);
  console.log("Next: scripts/v2/bootstrap-cluster.ts to install the runtime layer.");
}

main().catch((e) => {
  console.error(`\nFAILED: ${(e as Error).message}`);
  process.exit(1);
});
