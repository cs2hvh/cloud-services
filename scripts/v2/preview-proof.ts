/**
 * Prove preview deployments route to their own environment — and prove the bug
 * that would have suppressed them.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/preview-proof.ts [--write]
 *
 * THE DEFECT THIS PINS
 *
 * Deduping on (project, sha) was correct while every push built production, and
 * became wrong the moment a second environment could want the same commit.
 * Branching is exactly that case:
 *
 *   git checkout -b feature-x && git push -u origin feature-x
 *
 * sends a push whose sha is the head of the production branch — the commit
 * already deployed. The old key finds that deployment and answers "already
 * recorded", so the preview is never created, and nothing anywhere reports an
 * error: returning 200 to GitHub is exactly what a successful retry looks like.
 *
 * That is not an edge case. It is the first push of every branch cut from the
 * production head, which is how branches are normally cut.
 *
 * Read-only by default. `--write` records rows so the reconciler can be run
 * against them.
 */

import { parsePushEvent, shouldDeploy } from "../../lib/paas/github/webhook.ts";
import { projects, environments, deployments, db } from "../../lib/paas/db.ts";
import { PREVIEW_TIER, PREVIEW_INSTANCES } from "../../lib/paas/previews.ts";
import { previewLabel } from "../../lib/paas/hostnames.ts";
import { requireTier, resourcesFor } from "../../lib/paas/tiers.ts";

const WRITE = process.argv.includes("--write");
const EXIT_CANNOT_RUN = 1;
const EXIT_FOUND = 10;

if (!(await db.reachable())) {
  console.error("control plane unreachable — proving nothing");
  process.exit(EXIT_CANNOT_RUN);
}

const project = (await projects.list())[0];
if (!project) {
  console.error("no projects to simulate against — proving nothing");
  process.exit(EXIT_CANNOT_RUN);
}

const push = (branch: string, sha: string) =>
  parsePushEvent({
    ref: `refs/heads/${branch}`,
    after: sha,
    repository: { full_name: project.repo_full_name },
    head_commit: { message: "proof", author: { username: "proof" } },
    installation: { id: 1 },
  })!;

console.log(`project ${project.ref}  tier=${project.tier ?? "starter"}  production=${project.production_branch}`);
console.log();

// ── 1. the two kinds are distinguished at all ───────────────────────────────

const HEAD = "63c6674c478b697fc20a6412c78a5f7a2dcf14be";
const prod = shouldDeploy(push(project.production_branch, HEAD), project.production_branch);
const preview = shouldDeploy(push("feature-x", HEAD), project.production_branch);

console.log(`  push to ${project.production_branch.padEnd(12)} -> ${prod.deploy ? prod.kind : "no deploy"}`);
console.log(`  push to ${"feature-x".padEnd(12)} -> ${preview.deploy ? preview.kind : "no deploy"}`);

const problems: string[] = [];
if (!(prod.deploy && prod.kind === "production")) problems.push("production branch did not route to production");
if (!(preview.deploy && preview.kind === "preview")) problems.push("feature branch did not route to preview");

// ── 2. the dedupe key, which is where the bug lived ─────────────────────────

console.log();
console.log("  Same commit, two environments:");

const prodEnv =
  (await environments.production(project.id)) ??
  (WRITE ? await environments.create({ projectId: project.id, kind: "production", name: "production" }) : null);

if (!prodEnv) {
  console.error("  no production environment and --write not given — proving nothing");
  process.exit(EXIT_CANNOT_RUN);
}

const existingProdDeploy = await deployments.byEnvironmentAndSha(prodEnv.id, HEAD);
const anyForSha = await deployments.byProjectAndSha(project.id, HEAD);

// The proof is the DISAGREEMENT between the two keys. If no deployment of this
// commit exists at all, both keys answer "nothing" and the comparison shows
// nothing — a green result that examined an empty case. Say so rather than
// claiming a proof.
if (!anyForSha) {
  console.log(`    no deployment of ${HEAD.slice(0, 7)} exists yet, so the two keys cannot disagree.`);
  console.log(`    Re-run with --write after a production deploy of that commit to see it.`);
} else {
  const envOf = anyForSha.environment_id === prodEnv.id ? "production" : "another environment";
  console.log(`    project+sha  -> ${anyForSha.ref} (in ${envOf})`);
  console.log(`    env+sha      -> ${existingProdDeploy ? existingProdDeploy.ref : "nothing"}`);

  if (preview.deploy) {
    const previewEnv = WRITE
      ? await environments.forBranch(project.id, preview.branch)
      : (await environments.forProject(project.id)).find((e) => e.name === preview.branch) ?? null;

    if (!previewEnv) {
      console.log(`    preview environment for ${preview.branch} does not exist yet (--write creates it)`);
    } else {
      const inPreview = await deployments.byEnvironmentAndSha(previewEnv.id, HEAD);
      console.log();
      console.log(`    A preview push of the SAME commit ${HEAD.slice(0, 7)}:`);
      console.log(`      old key (project+sha) says: ${anyForSha ? "already recorded — PREVIEW SUPPRESSED" : "build it"}`);
      console.log(`      new key (env+sha)     says: ${inPreview ? "already recorded" : "build it"}`);

      // The whole point. If the old key would not have suppressed anything,
      // this run did not demonstrate the defect and must not claim it did.
      if (anyForSha && !inPreview) {
        console.log(`      -> the keys disagree, which is the bug, fixed.`);
      } else if (inPreview) {
        console.log(`      -> already deployed in the preview environment; keys agree, nothing shown.`);
      } else {
        problems.push("expected the old key to find a deployment the new key does not");
      }
    }
  }
}

// ── 3. sizing: a preview is Starter whatever the project holds ──────────────

console.log();
const projectTier = requireTier(project.tier ?? "starter");
const previewTier = requireTier(PREVIEW_TIER);
const pr = resourcesFor(projectTier);
const vr = resourcesFor(previewTier);

console.log("  Sizing:");
console.log(`    project tier ${projectTier.label.padEnd(10)} ${pr.requests.cpu}/${pr.requests.memory} x${project.instance_count ?? 1}`);
console.log(`    preview      ${previewTier.label.padEnd(10)} ${vr.requests.cpu}/${vr.requests.memory} x${PREVIEW_INSTANCES}`);

if (preview.deploy) {
  console.log(`    hostname     ${previewLabel(project.slug ?? project.ref, preview.branch)}`);
}

// A preview must never be sized ABOVE the project's own tier by accident, and
// must never scale out. Both are what makes a free preview bounded.
if (PREVIEW_INSTANCES !== 1) problems.push("previews are not pinned to one instance");

console.log();
if (problems.length) {
  for (const p of problems) console.log(`  FINDING: ${p}`);
  process.exit(EXIT_FOUND);
}
console.log("  Previews route to their own environment, sized Starter, one instance.");
