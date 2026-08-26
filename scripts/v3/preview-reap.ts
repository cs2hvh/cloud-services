/**
 * What the preview reaper WOULD delete, and what it cannot see at all.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/preview-reap.ts
 *   node --env-file=.env --env-file=.env.local scripts/v3/preview-reap.ts --json
 *
 * READ-ONLY, AND THERE IS NO --apply. `lib/paas/previews.ts` classifies and the
 * deletion lives in the deploy lane behind a human. This reports, and refuses
 * when the plan is not coherent enough to be worth reading.
 *
 * INDEXED BY ENVIRONMENT, NOT BY ALIAS, and that is the whole design.
 *
 * `planReap` takes aliases, so anything without one is neither reaped nor kept —
 * it is never examined and no TTL applies to it. The alias is minted at DEPLOY
 * time, not when the environment is created, so every failed and in-flight
 * build sits in that window. Walking aliases means the reaper's own index
 * decides what exists, and a preview missing from it is invisible rather than
 * overdue.
 *
 * The first version of this script walked aliases filtered on `kind ===
 * "preview"`. There is no such kind: `paas.alias_kind` is
 * `('production','branch','deployment','custom')` and a preview alias is
 * `branch`. It would have examined zero aliases forever and said so honestly —
 * the "observes nothing" failure, in the script written to detect it. Indexing
 * by environment removes the dependency on the alias kind altogether: whatever
 * alias points at a preview environment's deployment is that preview's alias,
 * whatever it is called.
 *
 * TWO KINDS OF EMPTY, AND THEY MUST NOT PRINT THE SAME:
 *
 *   No preview past its TTL, on a platform that mints and reaps them — clean,
 *   and the sweep proved it.
 *
 *   No preview examined because none has ever existed — the sweep is UNPROVEN.
 *   It would report exactly this while the capability was unwired.
 */

import { EXIT_CLEAN, EXIT_FINDINGS, EXIT_URGENT, EXIT_CANNOT_RUN, EXIT_UNTRUSTWORTHY } from "../../lib/paas/telemetry/exit-codes.ts";
import { db } from "../../lib/paas/db.ts";
import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";
import { PREVIEW_TTL_HOURS, planReap, shouldReap, type PreviewAlias } from "../../lib/paas/previews.ts";
import { checkReapPlan, findingsFrom, type ReapPlanLike } from "../../lib/paas/telemetry/reap-safety.ts";
import { indexPreviews } from "../../lib/paas/telemetry/preview-index.ts";

const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const JSON_OUT = process.argv.includes("--json");
const NOW = new Date();

interface AliasRow { ref: string; hostname: string; kind: string; deployment_id: string | null; project_id: string }
interface DeploymentRow { id: string; ref: string; environment_id: string | null; project_id: string; state: string; queued_at: string | null }
interface EnvRow { id: string; ref: string; project_id: string; kind: string; name: string; created_at: string }
interface ProjectRow { id: string; ref: string }

let aliasRows: AliasRow[];
let deployments: DeploymentRow[];
let environments: EnvRow[];
let projects: ProjectRow[];
try {
  [aliasRows, deployments, environments, projects] = await Promise.all([
    db.select<AliasRow>("aliases", "select=ref,hostname,kind,deployment_id,project_id"),
    db.select<DeploymentRow>("deployments", "select=id,ref,environment_id,project_id,state,queued_at"),
    db.select<EnvRow>("environments", "select=id,ref,project_id,kind,name,created_at"),
    db.select<ProjectRow>("projects", "select=id,ref"),
  ]);
} catch (e) {
  // An unreadable database and a platform with no previews produce the same
  // empty list, and this is the one sweep where that confusion ends in a
  // deletion.
  console.error(`could not read the control plane — nothing examined: ${(e as Error).message.slice(0, 200)}`);
  process.exit(EXIT_CANNOT_RUN);
}

const projectRefById = new Map(projects.map((p) => [p.id, p.ref]));

// Running pods, so an unindexed environment can be reported as costing money
// rather than merely existing. A cluster we cannot reach is recorded as
// unknown — never as "no pods", which would downgrade the urgent case to a
// footnote.
let podNames: string[] | null = null;
try {
  const k = kube(loadKubeconfig(KUBECONFIG));
  if (await k.healthz()) {
    const pods = await k.get<{ items: Array<{ metadata: { name: string }; status?: { phase?: string } }> }>(
      "/api/v1/pods",
      true,
    );
    podNames = (pods?.items ?? []).filter((p) => p.status?.phase === "Running").map((p) => p.metadata.name);
  }
} catch {
  podNames = null;
}
const hasPod = (deploymentRef: string): boolean | null =>
  podNames === null ? null : podNames.some((n) => n.startsWith(`${deploymentRef}-`));

// ── the authoritative index: preview environments ───────────────────────────

const index = indexPreviews({
  environments: environments.map((e) => ({
    id: e.id,
    ref: e.ref,
    projectRef: projectRefById.get(e.project_id) ?? e.project_id,
    kind: e.kind,
    name: e.name,
    createdAt: e.created_at,
  })),
  deployments: deployments.map((d) => ({
    id: d.id,
    ref: d.ref,
    environmentId: d.environment_id,
    // queued_at is when the push arrived, which is what the TTL measures from.
    // Not ready_at: a slow build would start its life late, and one that never
    // became ready would have no age and never be reaped.
    queuedAt: d.queued_at,
  })),
  aliases: aliasRows.map((a) => ({ ref: a.ref, hostname: a.hostname, deploymentId: a.deployment_id })),
  hasPod,
  now: NOW,
});

const capabilityUsed = index.environments > 0;
const previewAliases: PreviewAlias[] = index.indexed.map((p) => ({
  ref: p.aliasRef,
  hostname: p.hostname,
  projectRef: p.projectRef,
  lastPushAt: p.lastPushAt,
}));

const plan = planReap(previewAliases, NOW);

// Age is re-derived by calling shouldReap rather than recomputed here. One
// parser, and the parser is where the failure being guarded against lives.
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

// ── the part it cannot ──────────────────────────────────────────────────────

const invisible = index.invisible;
const urgent = invisible.filter((x) => x.urgent);
const proven = plan.examined > 0;

const code = !safety.safeToReview
  ? EXIT_UNTRUSTWORTHY
  : urgent.length > 0
    ? EXIT_URGENT
    : findings.length > 0 || invisible.length > 0 || (!proven && capabilityUsed)
      ? EXIT_FINDINGS
      : EXIT_CLEAN;

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      { now: NOW.toISOString(), ttlHours: PREVIEW_TTL_HOURS, safety, findings, keep: asPlan.keep, invisible, proven, capabilityUsed, podsReadable: podNames !== null },
      null,
      2,
    ),
  );
  process.exitCode = code;
} else {
  const line = "─".repeat(96);
  const age = (h: number | null) => (h === null ? "age unknown" : `${h.toFixed(1)}h`);

  console.log(`\nPreview reaping — what WOULD be deleted, at a ${PREVIEW_TTL_HOURS}h TTL`);
  console.log(line);
  console.log(
    `  ${index.environments} preview environment(s): ${index.indexed.length} with an alias, ${invisible.length} without.\n` +
      `  ${plan.examined} examined by planReap, ${plan.reap.length} past TTL, ${plan.keep.length} kept.`,
  );
  if (podNames === null) {
    console.log(`  cluster unreadable — "running" below is UNKNOWN, not "no".`);
  }

  if (!safety.safeToReview) {
    console.log(`\n  THE PLAN IS NOT FIT TO ACT ON. ${safety.refusals.length} refusal(s):\n`);
    for (const r of safety.refusals) {
      console.log(`    ${r.kind.toUpperCase().padEnd(22)} ${r.detail}`);
      if (r.refs.length) console.log(`    ${"".padEnd(22)} ${r.refs.slice(0, 8).join(", ")}`);
    }
  }

  if (findings.length) {
    console.log(`\n  Past TTL — findings, not instructions:\n`);
    for (const f of findings) {
      console.log(`    ${f.ref.padEnd(22)} ${age(f.ageHours).padStart(12)}  ${f.reason}`);
    }
  }
  if (asPlan.keep.length) {
    console.log(`\n  Kept, each for a stated reason:\n`);
    for (const k of asPlan.keep) console.log(`    ${k.ref.padEnd(22)} ${k.reason}`);
  }

  if (invisible.length) {
    console.log(`\n${line}`);
    console.log(`\n  ${invisible.length} preview environment(s) THE REAPER CANNOT SEE:\n`);
    for (const i of invisible) {
      const pods = i.running === null ? "pods unknown" : i.running ? "RUNNING POD" : "no pod";
      console.log(
        `    ${i.environmentRef.padEnd(20)} ${i.name.slice(0, 16).padEnd(16)} ${age(i.ageHours).padStart(12)}  ` +
          `${i.deployments} deployment(s)  ${pods}${i.urgent ? "   <-- URGENT" : ""}`,
      );
    }
    console.log(
      `\n  planReap walks aliases, and the alias is minted at DEPLOY time rather than\n` +
        `  when the environment is created. Every failed and in-flight build sits in\n` +
        `  that window, so no TTL applies to any of the above.`,
    );
    if (urgent.length) {
      console.log(
        `\n  ${urgent.length} of them HAS A RUNNING POD. Routing precedes the converge step, so a\n` +
          `  pod normally arrives after its alias — a pod without one means something ran\n` +
          `  between those two points and did not finish. It is a container that no sweep\n` +
          `  will ever reach, which is the abuse vector the ${PREVIEW_TTL_HOURS}h policy exists to close.`,
      );
    }
    console.log("");
  }

  console.log(`\n${line}`);
  if (!proven) {
    console.log(
      capabilityUsed
        ? `  planReap examined ZERO while ${index.environments} preview environment(s) exist — its index\n` +
            `  is empty and the thing it indexes is not.\n`
        : `  No preview environment has ever been created. This sweep is UNPROVEN rather\n` +
            `  than clean: it would print exactly this while the capability was unwired,\n` +
            `  and nothing here could tell the two apart.\n`,
    );
  } else if (code === EXIT_CLEAN) {
    console.log(`  Every preview is within its TTL, and every one was examined.\n`);
  }

  console.log(
    `  READ-ONLY. There is no --apply here and there will not be: the deletion\n` +
      `  belongs to the deploy lane, behind a person who has read this.\n`,
  );

  // Assigned, not called — process.exit() after a long report aborts on Windows
  // with a libuv assertion, turning a correct report into exit 127.
  process.exitCode = code;
}
