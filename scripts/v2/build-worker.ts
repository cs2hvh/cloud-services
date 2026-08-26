/**
 * The build worker — what turns a recorded push into a running app.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/build-worker.ts [--once] [--interval=15]
 *
 * The webhook records a queued deployment and returns, because a build takes
 * minutes and GitHub times a delivery out in ten seconds. This is the half that
 * does the work.
 *
 * WHY A POLLING WORKER AND NOT A BACKGROUND PROMISE
 *
 * A promise left running after an HTTP response dies with the process, and
 * serverless runtimes reclaim that process immediately. Anything relying on it
 * works in development and drops builds in production — where the symptom is a
 * push that simply never deploys, with nothing anywhere saying why.
 *
 * Polling a queue means a push received while this is down is still built when
 * it comes back. The queue is `paas.deployments` in state 'queued', so a
 * pending build is visible to the dashboard rather than living in a runtime's
 * memory.
 */

import { deployments, projects } from "../../lib/paas/db.ts";
import { deployFromRepo } from "../../lib/paas/deploy.ts";
import { kube, loadKubeconfig } from "../../lib/paas/k8s/client.ts";
import { PAAS_NAMESPACE } from "../../lib/paas/k8s/manifests.ts";

const ONCE = process.argv.includes("--once");
const intervalArg = process.argv.find((a) => a.startsWith("--interval="))?.split("=")[1];
const INTERVAL_MS = Math.max(5, Number.parseInt(intervalArg ?? "15", 10)) * 1000;
const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";

const k = kube(loadKubeconfig(KUBECONFIG));

async function gatewayIp(): Promise<string | null> {
  const svc = await k.get<{ status?: { loadBalancer?: { ingress?: Array<{ ip?: string }> } } }>(
    `/api/v1/namespaces/${PAAS_NAMESPACE}/services/traefik`,
    true,
  );
  return svc?.status?.loadBalancer?.ingress?.[0]?.ip ?? null;
}

function stamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

async function buildOne(ref: string): Promise<void> {
  const d = await deployments.byRef(ref);
  if (!d) return;

  const project = (await projects.list()).find((p) => p.id === d.project_id);
  if (!project) {
    await deployments.setState(d.ref, {
      state: "error",
      errorCode: "no_project",
      errorMessage: "deployment has no project row",
    });
    return;
  }

  console.log(`[${stamp()}] building ${d.ref} — ${project.repo_full_name}@${(d.git_sha ?? "?").slice(0, 7)}`);

  try {
    const out = await deployFromRepo({
      repo: project.repo_full_name,
      rootDirectory: project.root_directory,
      gatewayIp: await gatewayIp(),
      existingDeploymentRef: d.ref,
      onProgress: (stage, detail) => {
        // Only stage transitions, not every tick — this runs unattended and its
        // output is a log someone reads after the fact.
        if (/^\d+s$/.test(detail) || detail === "…") return;
        console.log(`   ${stage.padEnd(10)} ${detail}`);
      },
    });
    console.log(`[${stamp()}] DEPLOYED ${out.deployment.ref} -> https://${out.hostname}`);
  } catch (e) {
    // deployFromRepo already records the failure on the row; this is the
    // operator-visible half. A worker that swallows the error would leave a row
    // in 'error' with nothing in the log explaining it.
    console.log(`[${stamp()}] FAILED ${d.ref}: ${(e as Error).message}`);
  }
}

async function pass(): Promise<number> {
  const queue = await deployments.queued(5);
  if (queue.length === 0) return 0;

  // Sequential on purpose. Builds lease Linodes, and a queue that fans out is a
  // queue that can spend an unbounded amount of money in one pass. Concurrency
  // here needs a cap tied to a budget, not just a Promise.all.
  for (const d of queue) await buildOne(d.ref);
  return queue.length;
}

if (ONCE) {
  const n = await pass();
  console.log(n === 0 ? "Queue empty." : `Processed ${n}.`);
  process.exit(0);
}

console.log(`Build worker — polling every ${INTERVAL_MS / 1000}s. Ctrl-C to stop.`);
let idle = 0;
for (;;) {
  try {
    const n = await pass();
    if (n === 0) {
      idle++;
      // Quiet when there is nothing to do, but not silent — a worker with no
      // output is indistinguishable from a dead one.
      if (idle % 20 === 1) console.log(`[${stamp()}] queue empty`);
    } else {
      idle = 0;
    }
  } catch (e) {
    console.log(`[${stamp()}] pass failed: ${(e as Error).message}`);
  }
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
}
