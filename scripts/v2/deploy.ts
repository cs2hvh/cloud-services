/**
 * Deploy a repository. THIS is the deploy path — the one that records.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/deploy.ts <owner/repo> [--apply] [--label=<dns-label>] [--root=<subdir>]
 *
 * Replaces deploy-e2e.ts for real use. That script applied Kubernetes objects
 * directly and wrote no database rows, which is how three live hostnames ended
 * up invisible to the reconciler — promote and rollback had nothing to read for
 * them, and the dashboard silently described one app in four.
 *
 * deploy-e2e.ts is kept as a pipeline smoke test only. It should never be the
 * way an app that anyone depends on gets created.
 */

import { deployFromRepo } from "../../lib/paas/deploy.ts";
import { db } from "../../lib/paas/db.ts";
import { kube, loadKubeconfig } from "../../lib/paas/k8s/client.ts";
import { PAAS_NAMESPACE } from "../../lib/paas/k8s/manifests.ts";

const repo = process.argv.find((a) => /^[\w.-]+\/[\w.-]+$/.test(a));
const APPLY = process.argv.includes("--apply");
const label = process.argv.find((a) => a.startsWith("--label="))?.split("=")[1];
const root = process.argv.find((a) => a.startsWith("--root="))?.split("=")[1];

if (!repo) {
  console.log("usage: deploy.ts <owner/repo> [--apply] [--label=<dns-label>] [--root=<subdir>]");
  process.exit(1);
}

if (!(await db.reachable())) {
  console.log("paas schema unreachable — refusing to deploy.");
  console.log("A deploy that cannot record itself is how untracked infrastructure happens.");
  process.exit(1);
}

const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const k = kube(loadKubeconfig(KUBECONFIG));

// Read the gateway address rather than hardcoding it — v1 baked a node IP into
// customer DNS and could therefore never move, scale or fail over.
const svc = await k.get<{ status?: { loadBalancer?: { ingress?: Array<{ ip?: string }> } } }>(
  `/api/v1/namespaces/${PAAS_NAMESPACE}/services/traefik`,
  true,
);
const gatewayIp = svc?.status?.loadBalancer?.ingress?.[0]?.ip ?? null;

console.log(`\nDeploy ${repo}\n` + "═".repeat(74));
console.log(`gateway    ${gatewayIp ?? "(none — DNS will be skipped)"}`);
if (root) console.log(`root dir   ${root}`);

if (!APPLY) {
  console.log("\nWould build, publish, route and converge — recording every step.");
  console.log("Dry run. Re-run with --apply.");
  process.exit(0);
}

let lastStage = "";
try {
  const out = await deployFromRepo({
    repo,
    rootDirectory: root ?? null,
    hostnameLabel: label,
    gatewayIp,
    onProgress: (stage, detail) => {
      // Collapse the noisy progress ticks onto one line; print stage changes.
      if (stage === "build" && /^\d+s$/.test(detail)) {
        process.stdout.write(`\r  build      ${detail}      `);
        return;
      }
      if (stage === "publish" && detail === "…") {
        process.stdout.write(`\r  publish    …      `);
        return;
      }
      if (stage !== lastStage) console.log("");
      lastStage = stage;
      console.log(`  ${stage.padEnd(10)} ${detail}`);
    },
  });

  console.log("\n" + "═".repeat(74));
  console.log(`DEPLOYED  ${out.project.ref} / ${out.deployment.ref}`);
  console.log(`  https://${out.hostname}`);
  console.log(`  digest  ${out.deployment.image_digest}`);
  console.log(`\nRecorded in paas: project, environment, deployment, alias.`);
  console.log(`The reconciler can see it, so promote and rollback work for this app.`);
} catch (e) {
  console.log(`\nFAILED: ${(e as Error).message}`);
  console.log("The deployment row records the failure — check its state and error_message.");
  process.exit(1);
}
