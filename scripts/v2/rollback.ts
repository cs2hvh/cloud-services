/**
 * Put a previous deployment back in front of production.
 *
 *   node --experimental-strip-types --env-file=.env --env-file=.env.local \
 *     scripts/v2/rollback.ts --project prj-… [--to dpl-…] [--apply]
 *
 * With no --to it LISTS what you could roll back to and changes nothing. That
 * is the common case at three in the morning: you know the site is wrong and
 * not which deployment was the last good one.
 *
 * NO REBUILD. Rollback repoints aliases at an image that already exists —
 * `aliases.point` is the same call promotion uses. v1's rollback re-pointed a
 * mutable Docker Hub tag that nothing pruned or guaranteed still existed, so
 * rolling back far enough simply failed to pull.
 *
 * THE DECISION LIVES IN lib/paas/rollback.ts and is tested there. This script
 * is the hands: it reads, asks, and acts. The API route will ask the same
 * function, so a refusal here and a refusal there cannot drift apart.
 *
 * WHY THIS EXISTS AS A SCRIPT FIRST. Repointing an alias does not by itself
 * change what is served — the Ingress and the Deployment are generated from
 * the alias by the reconciler, and there is NO reconcile CronJob: every sweep
 * in the cluster reports drift rather than converging it. So a rollback that
 * only writes to the database is a rollback that reports success and serves the
 * old version. This converges before it claims anything.
 *
 * EXIT CODES: 0 clean, 1 could not run, 10 refused.
 */

import { EXIT_CLEAN, EXIT_FINDINGS, EXIT_CANNOT_RUN } from "../../lib/paas/telemetry/exit-codes.ts";
import { db, projects, deployments, aliases, environments } from "../../lib/paas/db.ts";
import { assessRollback, needsWake } from "../../lib/paas/rollback.ts";
import { reconcileProject, kubeContextFromEnv } from "../../lib/paas/reconciler.ts";
import { kube } from "../../lib/paas/k8s/client.ts";
import { imagePresence } from "../../lib/paas/registry.ts";

const arg = (name: string): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
};
const APPLY = process.argv.includes("--apply");
const projectRef = arg("project");
const targetRef = arg("to");

const line = () => console.log("─".repeat(84));

if (!projectRef) {
  console.error("usage: rollback.ts --project prj-… [--to dpl-…] [--apply]");
  process.exit(EXIT_CANNOT_RUN);
}

if (!(await db.reachable())) {
  console.error("control plane unreachable — rolling back nothing");
  process.exit(EXIT_CANNOT_RUN);
}

const project = await projects.byRef(projectRef);
if (!project) {
  console.error(`no project ${projectRef}`);
  process.exit(EXIT_CANNOT_RUN);
}

const prodEnv = await environments.production(project.id);
const projectAliases = await aliases.forProject(project.id);
const productionAlias = projectAliases.find((a) => a.kind === "production") ?? null;
const currentDeploymentId = productionAlias?.deployment_id ?? null;

console.log(`\nRollback — ${project.ref} (${project.name})   ${APPLY ? "APPLYING" : "DRY RUN"}`);
line();
console.log(`  production alias  ${productionAlias?.hostname ?? "(none)"}`);
console.log(`  currently serving ${currentDeploymentId ?? "(nothing pointed)"}`);

// ── no target: show what is eligible, change nothing ────────────────────────
if (!targetRef) {
  const ready = await deployments.readyForProject(project.id);
  console.log(`\n  ${ready.length} ready deployment(s) for this project:`);
  for (const d of ready) {
    // Every candidate is passed through the SAME assessment that will run when
    // one is chosen. A list that offered something the next command refuses
    // would be worse than no list.
    const verdict = assessRollback(d, project, currentDeploymentId, d.environment_id === prodEnv?.id);
    const mark =
      verdict.action === "rollback" ? "eligible" : verdict.action === "noop" ? "LIVE NOW" : `no — ${verdict.code}`;
    console.log(
      `    ${d.ref.padEnd(20)} ${String(d.git_sha ?? "").slice(0, 7).padEnd(8)} ${String(d.git_ref).padEnd(18)}` +
        ` ${String(d.ready_at ?? d.queued_at).slice(0, 19)}  ${mark}`,
    );
  }
  console.log(`\n  Re-run with --to <ref> to see what that would do, then --apply.`);
  line();
  process.exit(EXIT_CLEAN);
}

// ── a target was named ──────────────────────────────────────────────────────
const target = await deployments.byRef(targetRef);
const decision = assessRollback(
  target,
  project,
  currentDeploymentId,
  target ? target.environment_id === prodEnv?.id : false,
);

console.log(`\n  target            ${targetRef}`);
console.log(`  decision          ${decision.action.toUpperCase()} (${decision.code})`);
console.log(`  reason            ${decision.reason}`);

if (decision.action === "refuse") {
  line();
  process.exit(EXIT_FINDINGS);
}

if (decision.action === "noop") {
  console.log(`\n  Nothing to do.`);
  line();
  process.exit(EXIT_CLEAN);
}

const t = target!;
const willWake = needsWake(t);

// THE DATABASE CANNOT ANSWER THIS. The row records the digest that was
// published; it does not know the blob still exists. Repointing at a digest
// the registry no longer has is ImagePullBackOff — the rollback reports
// success, the running pods are replaced, and the site goes down. That is
// strictly worse than refusing, because it happens to someone who was
// already having a bad day.
const k = kube(kubeContextFromEnv());
const image = await imagePresence(k, t.image_repo ?? project.ref, t.image_digest ?? "");
console.log(`  image             ${image.presence} — ${image.detail}`);

if (image.presence === "absent") {
  console.error(`
  REFUSING: the image for ${t.ref} is gone, so this would replace a working`);
  console.error(`  site with ImagePullBackOff. Pick a deployment whose image still exists.`);
  line();
  process.exit(EXIT_FINDINGS);
}

if (image.presence === "unknown") {
  // NOT a refusal. An unreachable registry is not a missing image, and
  // blocking here means an outage cannot be rolled back at exactly the moment
  // the cluster is unhealthy — which is when rollback is for. Said out loud
  // so the operator chooses with the doubt in front of them.
  console.log(`  WARNING: could not confirm the image exists. Proceeding is a judgement`);
  console.log(`  call — an unreachable registry is not a missing image.`);
}
const toPoint = projectAliases.filter((a) => a.kind === "production" || a.kind === "custom");

console.log(`\n  would repoint     ${toPoint.length} alias(es): ${toPoint.map((a) => a.hostname).join(", ")}`);
console.log(`  would wake        ${willWake ? "yes — it is scaled to zero on purpose" : "no"}`);

if (!APPLY) {
  console.log(`\n  DRY RUN — nothing changed. Re-run with --apply.`);
  line();
  process.exit(EXIT_CLEAN);
}

// WAKE FIRST. Repointing at a sleeping deployment sends every production alias
// to zero replicas, and the rollback would report success while the site
// returned 502. Ordered so the worst interruption leaves the target awake and
// unrouted — which serves the OLD version, not nothing.
if (willWake) {
  await db.update("deployments", `id=eq.${t.id}`, { scaled_to_zero_at: null });
  console.log(`  woke ${t.ref}`);
}

for (const a of toPoint) {
  await aliases.point(a.ref, t.id);
  console.log(`  pointed ${a.hostname} -> ${t.ref}`);
}

// CONVERGE, because the database is not what serves traffic. No sweep in this
// cluster reconciles — they all report — so without this the rollback is a row
// change and the old version keeps answering.
const report = await reconcileProject(kubeContextFromEnv(), project, { appDomain: "" });
for (const a of report.actions) console.log(`  converge  ${a.kind} ${a.target} — ${a.detail}`);

line();
console.log(`  ${project.ref} now serves ${t.ref} (${String(t.git_sha ?? "").slice(0, 7)} on ${t.git_ref}).`);
process.exit(EXIT_CLEAN);
