/**
 * Deploy one repository end to end, report what happened, and clean up.
 *
 *   node --experimental-strip-types --env-file=.env --env-file=.env.local \
 *     scripts/v2/framework-probe.ts <owner/repo> [--keep] [--branch main] [--root apps/web]
 *
 * The framework sweep needs to put fifty or so real applications through the
 * real path and record what each one did. Doing that by hand through the
 * dashboard is not fifty tests, it is fifty opportunities to test slightly
 * different things — so this drives the same code the dashboard drives and
 * reports one line per attempt.
 *
 * WHAT IT PROVES, and why each step is here:
 *
 *   detect    the framework is recognised — necessary, and worth nothing on its
 *             own, because a recognised framework that will not build is not
 *             support
 *   build     an image exists
 *   route     an alias and an Ingress exist, because an image nobody can reach
 *             is not support either
 *   serve     the hostname answers, which is the only step a customer would
 *             call working
 *
 * A RUN IS ONLY GREEN IF THE HOSTNAME ANSWERED. Everything short of that is
 * reported as the stage it reached, so "detected Next.js" cannot be mistaken
 * for "deploys Next.js".
 *
 * NOTHING IS CREATED UP FRONT. deployFromRepo derives the project from the
 * repository itself, so a project made here would not be the project it builds
 * — the first version of this script created one, and cleanup then deleted that
 * empty row while the real project kept running. On a fifty-repository sweep
 * that is fifty orphans.
 *
 * IT ALSO DOES NOT PRE-QUEUE A DEPLOYMENT. The build worker polls for `queued`
 * rows, so a row created here is one the worker races this script to build; two
 * builds of a single deployment collide on the VM label, and the probe then
 * reports a platform failure that is entirely its own doing.
 *
 * EXIT CODES: 0 served, 10 reached a stage short of serving, 1 could not run.
 */

import { EXIT_CLEAN, EXIT_FINDINGS, EXIT_CANNOT_RUN } from "../../lib/paas/telemetry/exit-codes.ts";
import { db, projects } from "../../lib/paas/db.ts";
import { deployFromRepo } from "../../lib/paas/deploy.ts";
import { reconcileProjectByRef } from "../../lib/paas/reconciler.ts";
import { kube, loadKubeconfig } from "../../lib/paas/k8s/client.ts";
import { PAAS_NAMESPACE } from "../../lib/paas/k8s/manifests.ts";

const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const LINODE_TOKEN =
  process.env.LINODE_TOKEN ?? process.env.V2_LINODE_TOKEN ?? process.env.LINODE_API_TOKEN ?? null;

const args = process.argv.slice(2);
const repo = args.find((a) => !a.startsWith("--"));
const KEEP = args.includes("--keep");
const flag = (name: string): string | null => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? null) : null;
};
const BRANCH = flag("branch");
const ROOT = flag("root");

if (!repo || !/^[^/\s]+\/[^/\s]+$/.test(repo)) {
  console.error("usage: framework-probe.ts <owner/repo> [--keep] [--branch b] [--root dir]");
  process.exit(EXIT_CANNOT_RUN);
}

const line = () => console.log("─".repeat(84));

let stage = "start";
let hostname: string | null = null;
/** The project deployFromRepo actually used. Only this gets torn down. */
let builtRef: string | null = null;
/** Deployment refs this run created, so cleanup reaps only its own build VMs. */
const deploymentRefs = new Set<string>();

async function reapOwnBuildVms(): Promise<void> {
  if (!LINODE_TOKEN || deploymentRefs.size === 0) return;
  try {
    const res = await fetch("https://api.linode.com/v4/linode/instances?page_size=100", {
      headers: { Authorization: `Bearer ${LINODE_TOKEN}` },
    });
    const body = (await res.json()) as { data?: Array<{ id: number; label: string }> };
    for (const inst of body.data ?? []) {
      const label = String(inst.label ?? "");
      // Only build VMs, and only THIS run's — the label carries the deployment
      // ref, so a customer's concurrent build is never touched.
      if (!label.startsWith("bld-")) continue;
      if (!deploymentRefs.has(label.replace(/^bld-/, ""))) continue;
      await fetch(`https://api.linode.com/v4/linode/instances/${inst.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${LINODE_TOKEN}` },
      });
      console.log(`  reaped      ${label}`);
    }
  } catch (e) {
    console.error(`  VM REAP FAILED: ${(e as Error).message.slice(0, 160)}`);
    console.error(`  Check for stray bld-* instances before the next run.`);
  }
}

async function cleanup(): Promise<void> {
  // Reaped even with --keep: keeping the app is useful, keeping a build machine
  // is only expensive.
  await reapOwnBuildVms();
  if (KEEP || !builtRef) return;

  try {
    const p = await projects.byRef(builtRef);
    if (!p) return;

    // Soft-delete, release the names, then tear the workload down — the order
    // project-teardown uses, so nothing can claim a hostname that still routes.
    await db.update("projects", `id=eq.${p.id}`, { deleted_at: new Date().toISOString() });
    await db.update("aliases", `project_id=eq.${p.id}&released_at=is.null`, {
      released_at: new Date().toISOString(),
    });

    const k = kube(loadKubeconfig(KUBECONFIG));
    const ns = `app-${p.ref}`;
    // Deleting the namespace takes the Deployment, Service and Ingress with it,
    // which is the whole cluster footprint of a probe.
    await k.delete(`/api/v1/namespaces/${ns}`, true);
    console.log(`  cleaned     ${p.ref} (namespace ${ns} deleted)`);
  } catch (e) {
    console.error(`  CLEANUP FAILED for ${builtRef}: ${(e as Error).message.slice(0, 160)}`);
    console.error(`  Left as-is rather than half-removed. Tear it down by hand.`);
  }
}

/**
 * Why did the hostname answer 5xx?
 *
 * The probe used to report `APP-ERR 503` and then delete the project, which
 * ends the investigation before it starts: the pod is gone, and 503 covers
 * everything from a crash loop to a readiness probe that never passes to an
 * image that will not pull. Every one of those has a different owner.
 *
 * Pod STATUS is enough to tell them apart and is plain JSON, unlike the log
 * endpoint. A container that exited names its exit code; one that cannot start
 * names a waiting reason; one that is Running but not Ready is the app itself
 * refusing to come up.
 */
async function diagnose(projectRef: string): Promise<void> {
  try {
    const k = kube(loadKubeconfig(process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml"));
    const pods = await k.listPods(`app-${projectRef}`);
    if (!pods.length) {
      console.log("  diagnose    no pods in the namespace — nothing was scheduled");
      return;
    }
    for (const pod of pods) {
      const phase = pod.status?.phase ?? "unknown";
      const conds = (pod.status?.conditions ?? [])
        .filter((c) => c.type === "Ready")
        .map((c) => `Ready=${c.status}${c.reason ? ` (${c.reason})` : ""}`)
        .join(" ");
      console.log(`  diagnose    ${pod.metadata?.name}: phase=${phase} ${conds}`);
      for (const cs of pod.status?.containerStatuses ?? []) {
        const w = cs.state?.waiting;
        const t = cs.state?.terminated ?? cs.lastState?.terminated;
        if (w) console.log(`  diagnose      waiting: ${w.reason}${w.message ? ` — ${w.message}` : ""}`);
        if (t) console.log(`  diagnose      exited ${t.exitCode} (${t.reason})${t.message ? ` — ${t.message}` : ""}`);
        if (cs.restartCount) console.log(`  diagnose      restarts: ${cs.restartCount}`);
      }
    }
  } catch (e) {
    // Never let a diagnostic failure change the verdict — it is commentary on
    // a result that has already been decided.
    console.log(`  diagnose    could not read pod status: ${(e as Error).message.slice(0, 120)}`);
  }
}
async function main(): Promise<number> {
  if (!(await db.reachable())) {
    console.error("control plane unreachable — proving nothing");
    return EXIT_CANNOT_RUN;
  }

  console.log(`\nProbe — ${repo}${BRANCH ? ` @${BRANCH}` : ""}${ROOT ? ` /${ROOT}` : ""}`);
  line();

  const k = kube(loadKubeconfig(KUBECONFIG));
  const svc = await k.get<{ status?: { loadBalancer?: { ingress?: Array<{ ip?: string }> } } }>(
    `/api/v1/namespaces/${PAAS_NAMESPACE}/services/traefik`,
    true,
  );
  const gatewayIp = svc?.status?.loadBalancer?.ingress?.[0]?.ip ?? null;

  stage = "detect";
  const out = await deployFromRepo({
    repo: repo!,
    rootDirectory: ROOT,
    gatewayIp,
    onProgress: (s, detail) => {
      if (/^\d+s$/.test(detail) || detail === "…") return;
      if (s === "detect" || s === "build" || s === "route" || s === "dns") stage = s;
      // LEARN THE PROJECT AS SOON AS IT IS NAMED, not from the return value.
      //
      // deployFromRepo reports the project long before it finishes, and a build
      // that throws never returns at all — so cleanup knew nothing about exactly
      // the runs that needed cleaning. One batch of three left three projects,
      // three namespaces and three DNS records behind.
      if (s === "project") {
        const m = /(prj-[0-9a-f]{12})/.exec(detail);
        if (m) builtRef = m[1];
      }
      // Same for the build VM: the lease is logged before anything can go
      // wrong, and an unreaped VM bills and blocks the next build's label.
      if (s === "deployment" || s === "build") {
        const m = /(dpl-[0-9a-f]{12})/.exec(detail);
        if (m) deploymentRefs.add(m[1]);
      }
      console.log(`   ${s.padEnd(10)} ${detail}`);
    },
  });

  deploymentRefs.add(out.deployment.ref);
  const built = await projects.byId(out.deployment.project_id);
  builtRef = built?.ref ?? null;
  hostname = out.hostname;
  stage = "serve";

  if (builtRef) await reconcileProjectByRef(builtRef);

  // Poll rather than ask once. A cold start on a small tier takes seconds, and
  // reporting FAIL because we asked too early puts a false negative in the
  // matrix — worse than no entry, because nobody re-checks a red row.
  let status = 0;
  for (let attempt = 0; attempt < 14; attempt++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const res = await fetch(`https://${hostname}/`, { redirect: "manual" });
      status = res.status;
      if (status > 0 && status < 500) break;
    } catch {
      // DNS or TLS not ready yet. Keep waiting.
    }
  }

  line();
  const served = status >= 200 && status < 400;
  // APP-ERR is not FAIL. A 5xx means we built it, routed it, and the customer's
  // own code answered badly — the platform did its job.
  const verdict = served ? "PASS" : status >= 500 ? "APP-ERR" : "FAIL";
  console.log(`  RESULT      ${verdict}  http=${status || "no answer"}`);
  if (!served && builtRef) await diagnose(builtRef);
  console.log(`  project     ${builtRef ?? "(none)"}`);
  console.log(`  hostname    https://${hostname}`);
  console.log(`  stage       reached ${stage}`);
  return served ? EXIT_CLEAN : EXIT_FINDINGS;
}

let code = EXIT_CANNOT_RUN;
try {
  code = await main();
} catch (e) {
  line();
  console.error(`  RESULT      FAIL at ${stage}: ${(e as Error).message.slice(0, 300)}`);
  code = EXIT_FINDINGS;
} finally {
  await cleanup();
}
process.exit(code);
