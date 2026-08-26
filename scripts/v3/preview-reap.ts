/**
 * What the preview reaper WOULD delete, and whether its plan is fit to act on.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/preview-reap.ts
 *   node --env-file=.env --env-file=.env.local scripts/v3/preview-reap.ts --json
 *
 * READ-ONLY, AND THERE IS NO --apply. The classification lives in
 * `lib/paas/previews.ts` and the deletion lives in the deploy lane behind a
 * human. This reports, and refuses when the plan is not coherent enough to be
 * worth reading.
 *
 * A preview reaper deletes RUNNING ENVIRONMENTS. The R2 reaper could destroy
 * the only account of how an app was built, which was bad enough; this destroys
 * the app. So the plan is checked from outside the module that produced it —
 * a classifier cannot catch the bug that makes it classify everything the same
 * way, because the bug is in the thing doing the catching.
 *
 * TWO KINDS OF EMPTY, AND THEY MUST NOT PRINT THE SAME:
 *
 *   Nothing to reap on a platform that mints and reaps previews — genuinely
 *   clean, and the sweep proved it.
 *
 *   Nothing to reap because no preview alias has ever existed — the sweep
 *   examined zero, was honest about examining zero, and told you nothing. It
 *   would report clean forever while the capability it watches was unwired.
 *
 * The second is the "observes nothing" failure arriving one layer up: the sweep
 * is correct and useless at the same time. `paas.environments` is read as the
 * corroborating signal, because a preview ENVIRONMENT with no preview ALIAS is
 * both the evidence that previews exist and, separately, a thing the reaper
 * cannot see at all.
 */

import { EXIT_CLEAN, EXIT_FINDINGS, EXIT_CANNOT_RUN, EXIT_UNTRUSTWORTHY } from "../../lib/paas/telemetry/exit-codes.ts";
import { db } from "../../lib/paas/db.ts";
import { PREVIEW_TTL_HOURS, planReap, shouldReap, type PreviewAlias } from "../../lib/paas/previews.ts";
import { checkReapPlan, findingsFrom, type ReapPlanLike } from "../../lib/paas/telemetry/reap-safety.ts";

const JSON_OUT = process.argv.includes("--json");
const NOW = new Date();

interface AliasRow {
  ref: string;
  hostname: string;
  kind: string;
  deployment_id: string | null;
  project_id: string;
}
interface DeploymentRow {
  id: string;
  ref: string;
  environment_id: string | null;
  state: string;
  queued_at: string | null;
}
interface EnvRow {
  id: string;
  ref: string;
  kind: string;
  name: string;
  created_at: string;
}
interface ProjectRow {
  id: string;
  ref: string;
}

let aliasRows: AliasRow[];
let deployments: DeploymentRow[];
let environments: EnvRow[];
let projects: ProjectRow[];
try {
  [aliasRows, deployments, environments, projects] = await Promise.all([
    db.select<AliasRow>("aliases", "select=ref,hostname,kind,deployment_id,project_id"),
    db.select<DeploymentRow>("deployments", "select=id,ref,environment_id,state,queued_at"),
    db.select<EnvRow>("environments", "select=id,ref,kind,name,created_at"),
    db.select<ProjectRow>("projects", "select=id,ref"),
  ]);
} catch (e) {
  // Refusing rather than reporting an empty plan. An unreadable database and a
  // platform with no previews produce the same empty list, and this is the one
  // sweep where that confusion ends in a deletion.
  console.error(`could not read the control plane — nothing examined: ${(e as Error).message.slice(0, 200)}`);
  process.exit(EXIT_CANNOT_RUN);
}

const depById = new Map(deployments.map((d) => [d.id, d]));
const projectRefById = new Map(projects.map((p) => [p.id, p.ref]));

// `lastPushAt` is the deployment's queued_at — the moment the push arrived,
// which is what the TTL is measured from. Deliberately not ready_at: a build
// that took an hour would otherwise start its life an hour old, and a build
// that never became ready would have no age at all and never be reaped.
const previewAliases: PreviewAlias[] = aliasRows
  .filter((a) => a.kind === "preview")
  .map((a) => ({
    ref: a.ref,
    hostname: a.hostname,
    projectRef: projectRefById.get(a.project_id) ?? a.project_id,
    lastPushAt: a.deployment_id ? (depById.get(a.deployment_id)?.queued_at ?? null) : null,
  }));

const plan = planReap(previewAliases, NOW);

// Adapt to the safety checker's shape. Age is re-derived by calling shouldReap
// rather than recomputed here — one parser, and the parser is exactly where the
// failure being guarded against lives.
const asPlan: ReapPlanLike = {
  reap: plan.reap.map((a) => {
    const v = shouldReap(a, NOW);
    return { ref: a.ref, ageHours: v.ageHours, reason: v.reason };
  }),
  keep: plan.keep.map((k) => ({ ref: k.alias.ref, reason: k.reason })),
  examined: plan.examined,
};

const safety = checkReapPlan(asPlan, PREVIEW_TTL_HOURS);
const findings = findingsFrom(asPlan);

// ── what the reaper cannot see ──────────────────────────────────────────────
//
// planReap walks ALIASES. A preview environment with no preview alias is
// outside its reach by construction — not kept, not reaped, never examined.
// If such an environment ever holds a running deployment, it runs until someone
// notices it by hand.
const previewEnvs = environments.filter((e) => e.kind === "preview");
const aliasedEnvIds = new Set(
  previewAliases
    .map((a) => aliasRows.find((r) => r.ref === a.ref)?.deployment_id)
    .map((id) => (id ? depById.get(id)?.environment_id : null))
    .filter((x): x is string => !!x),
);
const unreachable = previewEnvs
  .filter((e) => !aliasedEnvIds.has(e.id))
  .map((e) => ({
    ref: e.ref,
    name: e.name,
    createdAt: e.created_at,
    deployments: deployments.filter((d) => d.environment_id === e.id).length,
    running: deployments.filter((d) => d.environment_id === e.id && d.state === "ready").length,
  }));

/**
 * Did the sweep tell us anything?
 *
 * examined 0 with preview environments present means the reaper's index is
 * empty while the thing it indexes exists — that is a finding. examined 0 with
 * no preview environments at all means the capability has produced nothing yet,
 * and the sweep is unproven rather than clean.
 */
const proven = plan.examined > 0;
const capabilityUsed = previewEnvs.length > 0;

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      { now: NOW.toISOString(), ttlHours: PREVIEW_TTL_HOURS, safety, findings, keep: asPlan.keep, unreachable, proven, capabilityUsed },
      null,
      2,
    ),
  );
  process.exit(
    !safety.safeToReview ? EXIT_UNTRUSTWORTHY : findings.length > 0 || unreachable.length > 0 || (!proven && capabilityUsed) ? EXIT_FINDINGS : EXIT_CLEAN,
  );
}

const line = "─".repeat(96);
console.log(`\nPreview reaping — what WOULD be deleted, at a ${PREVIEW_TTL_HOURS}h TTL`);
console.log(line);
console.log(`  ${plan.examined} preview alias(es) examined, ${plan.reap.length} past TTL, ${plan.keep.length} kept`);

if (!safety.safeToReview) {
  console.log(`\n  THE PLAN IS NOT FIT TO ACT ON. ${safety.refusals.length} refusal(s):\n`);
  for (const r of safety.refusals) {
    console.log(`    ${r.kind.toUpperCase().padEnd(22)} ${r.detail}`);
    if (r.refs.length) console.log(`    ${"".padEnd(22)} ${r.refs.slice(0, 8).join(", ")}`);
  }
  console.log(`\n  Nothing below should be deleted until these are resolved.\n`);
}

if (findings.length) {
  console.log(`\n  Past TTL — findings, not instructions:\n`);
  for (const f of findings) {
    console.log(
      `    ${f.ref.padEnd(22)} ${(f.ageHours === null ? "age unknown" : `${f.ageHours.toFixed(1)}h`).padStart(12)}  ${f.reason}`,
    );
  }
}

if (asPlan.keep.length) {
  console.log(`\n  Kept, each for a stated reason:\n`);
  for (const k of asPlan.keep) console.log(`    ${k.ref.padEnd(22)} ${k.reason}`);
}

if (unreachable.length) {
  console.log(`\n${line}`);
  console.log(`\n  ${unreachable.length} preview environment(s) THE REAPER CANNOT SEE.\n`);
  for (const u of unreachable) {
    console.log(
      `    ${u.ref.padEnd(20)} ${u.name.padEnd(18)} created ${u.createdAt.slice(0, 19)}  ` +
        `${u.deployments} deployment(s), ${u.running} ready`,
    );
  }
  console.log(
    `\n  planReap walks ALIASES. An environment with no preview alias is neither\n` +
      `  reaped nor kept — it is never examined, so no TTL applies to it. Harmless\n` +
      `  while it holds nothing; a container running free forever the moment one of\n` +
      `  them gets a deployment and the hostname mint fails.\n`,
  );
}

console.log(`\n${line}`);
if (!proven) {
  if (capabilityUsed) {
    console.log(
      `  Examined ZERO aliases while ${previewEnvs.length} preview environment(s) exist.\n` +
        `  The reaper's index is empty and the thing it indexes is not.\n`,
    );
  } else {
    console.log(
      `  Examined ZERO, and no preview environment has ever been created.\n` +
        `  This sweep is UNPROVEN rather than clean: it would report exactly this\n` +
        `  while the capability it watches was unwired, and there is nothing here\n` +
        `  that could tell the two apart. It becomes meaningful on the first preview.\n`,
    );
  }
} else if (safety.safeToReview && findings.length === 0 && unreachable.length === 0) {
  console.log(`  Every preview is within its TTL, and every one was examined.\n`);
}

console.log(
  `  READ-ONLY. There is no --apply here and there will not be: the deletion\n` +
    `  belongs to the deploy lane, behind a person who has read this.\n`,
);

// SET, NOT CALLED, and the difference is not style.
//
// `process.exit()` here aborted the process on Windows with a libuv assertion
// (`!(handle->flags & UV_HANDLE_CLOSING)`), after printing this report in full
// and correctly. The shell saw 127 — a crash — rather than the verdict. The
// --json path, which writes one line instead of forty, exited 2 as intended, so
// it is a race between exit and pending stdout writes rather than anything in
// the logic.
//
// That is this lane's own defect wearing the last costume available to it: a
// tool that did the work, reported it accurately, and then told the scheduler
// it had failed. Assigning exitCode lets Node drain stdout and exit with the
// code intact.
process.exitCode = !safety.safeToReview
  ? EXIT_UNTRUSTWORTHY
  : findings.length > 0 || unreachable.length > 0 || (!proven && capabilityUsed)
    ? EXIT_FINDINGS
    : EXIT_CLEAN;
