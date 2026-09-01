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
import { toCustomerFacing } from "../../lib/paas/errors.ts";
import { notifyAppEventRemote } from "../../lib/paas/notify-hook.ts";
import { deployFromRepo } from "../../lib/paas/deploy.ts";
import { BUILD_VM_TAG, destroyBuildVm } from "../../lib/paas/build/vm.ts";
import { instances } from "../../lib/paas/linode/client.ts";
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

/**
 * The deployment this process is building right now, for the shutdown handler.
 *
 * Set before the first write that leaves the queue and cleared in `finally`, so
 * a signal arriving at any point during a build finds it — and a signal arriving
 * between builds finds nothing to clean up.
 */
let inFlight: string | null = null;

async function buildOne(ref: string): Promise<void> {
  const d = await deployments.byRef(ref);
  if (!d) return;
  inFlight = ref;
  try {
    await buildOneInner(d);
  } finally {
    inFlight = null;
  }
}

async function buildOneInner(d: NonNullable<Awaited<ReturnType<typeof deployments.byRef>>>): Promise<void> {

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
      // FROM THE PROJECT ROW, not defaulted. This is the webhook redeploy path:
      // a push to a GitLab project arrives here, and without this the clone URL
      // would be built for github.com — the repository would not exist and the
      // build would die on a remote that was never asked for.
      provider: project.provider,
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
    const message = (e as Error).message;
    console.log(`[${stamp()}] FAILED ${d.ref}: ${message}`);

    // THE ROW MUST LEAVE THE QUEUE, and this used to assume deployFromRepo had
    // already seen to it. It has not, for every failure before it first writes
    // `building` — and that includes the most common one a customer hits:
    // a repository with no recognised framework marker.
    //
    // The row stayed `queued`, so the next pass picked it up fifteen seconds
    // later and failed identically, forever. The dashboard showed `queued` the
    // whole time with no reason anywhere a customer could see it, because the
    // only account of it was this log line on somebody's laptop.
    //
    // Re-read rather than trusting the row we started with: deployFromRepo may
    // have recorded a more specific failure already, and overwriting that with
    // a generic one would replace the useful message with a vaguer one.
    try {
      const after = await deployments.byRef(d.ref);
      if (after && (after.state === "queued" || after.state === "building" || after.state === "publishing")) {
        // TRANSLATED, NOT TRUNCATED. This used to be the raw exception text,
        // and deployments.error_message is shown to the customer — so a
        // Cloudflare 403, an R2 signature mismatch or a malformed kubeconfig
        // path would have been rendered on their screen verbatim. None of
        // those is theirs to act on, and together they map our infrastructure
        // to anyone who can make a build fail.
        const shown = toCustomerFacing(e, "build", "[build-worker]");
        await deployments.setState(d.ref, {
          state: "error",
          errorCode: shown.code,
          errorMessage: shown.message,
        });
        console.log(`   recorded   ${d.ref} -> error (it would otherwise retry forever)`);

        // INSIDE this branch on purpose. deployFromRepo emails about the
        // failures it records itself; this covers the ones it never got far
        // enough to record. Notifying unconditionally out here would send a
        // second "deployment failed" for every one of those.
        await notifyAppEventRemote({
          projectRef: project.ref,
          event: "failed",
          reason: shown.message,
          commit: d.git_sha?.slice(0, 7) ?? null,
        });
      }
    } catch (inner) {
      // Loud, because the consequence is the retry loop this exists to end.
      console.log(
        `   WARNING    could not record the failure on ${d.ref}: ${(inner as Error).message.slice(0, 160)}`,
      );
      console.log(`   ${d.ref} may be retried until this is fixed.`);
    }
  }
}

async function pass(): Promise<number> {
  const queue = await deployments.queued(5);
  if (queue.length === 0) return 0;

  // Sequential on purpose. Builds lease Linodes, and a queue that fans out is a
  // queue that can spend an unbounded amount of money in one pass. Concurrency
  // here needs a cap tied to a budget, not just a Promise.all.
  for (const d of queue) {
    if (stopping) break; // a signal arrived mid-queue: do not start another
    await buildOne(d.ref);
  }
  return queue.length;
}

/* ── shutdown ───────────────────────────────────────────────────────────────
 *
 * A DEPLOY RESTARTS THIS PROCESS, AND A BUILD CAN BE IN FLIGHT WHEN IT DOES.
 *
 * Without this, systemd stops the worker, the build VM keeps running with
 * nobody polling it, and the deployment sits in `building` forever. The
 * customer sees a spinner that never resolves; we keep paying for the instance
 * until something reaps it. That is where the four `building` rows from
 * 2026-08-27 and 08-31 came from, and it happened again on dpl-8fb1c89620d1
 * the first time a deploy restarted this worker mid-build.
 *
 * NOT a graceful drain. Waiting for the build to finish would mean a stop
 * taking up to ten minutes on every deploy, and systemd would SIGKILL through
 * it anyway. Failing the deployment honestly and releasing the instance is
 * bounded, and "interrupted, deploy again" is a far better answer than a
 * spinner that never stops.
 */
let stopping = false;

async function shutdown(signal: string): Promise<void> {
  if (stopping) return; // a second signal must not race the first's cleanup
  stopping = true;
  console.log(`[${stamp()}] ${signal} — stopping`);

  const ref = inFlight;
  if (!ref) {
    process.exit(0);
  }

  console.log(`   ${ref} was building; failing it rather than leaving it queued forever`);
  try {
    await deployments.setState(ref, {
      state: "error",
      errorCode: "interrupted",
      errorMessage:
        "This deployment was interrupted while the platform restarted. Nothing was changed — " +
        "deploy again and it will build from the same commit.",
    });
  } catch (e) {
    console.log(`   WARNING could not record the interruption: ${(e as Error).message.slice(0, 140)}`);
  }

  // Its instance is identified by the deployment's own tag, so this works even
  // when the build_vms row was never written.
  try {
    const leaked = (await instances.listByTag(BUILD_VM_TAG)).filter(
      (i) => i.label === `bld-${ref}` || (i.tags ?? []).includes(`dpl:${ref}`),
    );
    for (const i of leaked) {
      await destroyBuildVm(i.id);
      console.log(`   released ${i.label}`);
    }
  } catch (e) {
    console.log(`   WARNING could not release the build instance: ${(e as Error).message.slice(0, 140)}`);
  }

  process.exit(0);
}

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    void shutdown(sig);
  });
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
