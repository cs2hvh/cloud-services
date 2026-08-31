/**
 * Build ONE real preview, end to end, and prove it did not touch production.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/preview-e2e.ts <repo> <branch> [--build]
 *
 * WHAT THIS IS FOR
 *
 * `preview-reap` reports UNPROVEN rather than clean while no preview has ever
 * existed, and it is right to: a sweep over an unwired capability reports
 * exactly that forever, and nothing in it can tell "nothing to reap" from
 * "nothing works". Only a real preview settles it.
 *
 * It also exercises the fix for the defect that mattered most here. Before it, a
 * preview build repointed EVERY alias of the project — including production —
 * so pushing a feature branch replaced the live site with that branch. That is
 * not a failure to verify by reading the diff, so this records production's
 * target BEFORE the build and asserts it is unchanged after.
 *
 * Runs the webhook's own decision path rather than reimplementing it, so what is
 * proven is the code that runs in production, not a parallel copy of it. The one
 * thing it does NOT exercise is the HTTP layer — signature verification over raw
 * bytes is proven separately by webhook-proof.ts.
 *
 * Without `--build` it records the deployment and stops, which is safe to run
 * repeatedly. With `--build` it leases a real Linode build VM and costs money.
 *
 * EXIT CODES: 0 clean, 1 could not run, 10 found something.
 */

import { parsePushEvent, shouldDeploy } from "../../lib/paas/github/webhook.ts";
import { projects, environments, deployments, aliases, db } from "../../lib/paas/db.ts";
import { resolveRepoTarget } from "../../lib/paas/repo-target.ts";
import { deployFromRepo } from "../../lib/paas/deploy.ts";
import { kube, loadKubeconfig } from "../../lib/paas/k8s/client.ts";
import { PAAS_NAMESPACE } from "../../lib/paas/k8s/manifests.ts";
import { previewLabel } from "../../lib/paas/hostnames.ts";
import { PREVIEW_TIER, PREVIEW_INSTANCES } from "../../lib/paas/previews.ts";

const BUILD = process.argv.includes("--build");

async function gatewayIp(): Promise<string | null> {
  const k = kube(loadKubeconfig(process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml"));
  const svc = await k.get<{ status?: { loadBalancer?: { ingress?: Array<{ ip?: string }> } } }>(
    `/api/v1/namespaces/${PAAS_NAMESPACE}/services/traefik`, true);
  return svc?.status?.loadBalancer?.ingress?.[0]?.ip ?? null;
}
const [repoArg, branchArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const EXIT_CANNOT_RUN = 1;
const EXIT_FOUND = 10;

async function main(): Promise<void> {
  if (!repoArg || !branchArg) {
    console.error("usage: preview-e2e.ts <owner/repo> <branch> [--build]");
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }
  if (!(await db.reachable())) {
    console.error("control plane unreachable — proving nothing");
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }

  // Provider-scoped and ambiguity-refusing, exactly as the webhook resolves it.
  // A proof that resolved the repo more loosely than production does would be
  // proving something production never runs.
  const target = resolveRepoTarget(await projects.matchingRepo("github", repoArg), repoArg, "github");
  if (target.kind !== "one") {
    console.error(`${target.reason} — proving nothing`);
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }
  const project = target.project;
  if (branchArg === project.production_branch) {
    console.error(`${branchArg} IS the production branch — that would prove the opposite of the point`);
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }

  // Resolve the branch head from GitHub rather than accepting one on the command
  // line. A sha nobody checked is a sha that can be wrong.
  const res = await fetch(`https://api.github.com/repos/${repoArg}/branches/${branchArg}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "ahuracloud-preview-e2e" },
  });
  if (!res.ok) {
    console.error(`cannot resolve ${repoArg}@${branchArg}: ${res.status}`);
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }
  const sha = ((await res.json()) as { commit?: { sha?: string } }).commit?.sha;
  if (!sha) {
    console.error("branch response carried no commit sha");
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }

  console.log(`project     ${project.ref}  ${repoArg}`);
  console.log(`production  ${project.production_branch}`);
  console.log(`preview of  ${branchArg} @ ${sha.slice(0, 7)}`);
  console.log();

  // ── what production points at BEFORE ──────────────────────────────────────
  //
  // Recorded first and compared last. The defect this guards against moved the
  // production alias as a side effect of a preview build, which no assertion
  // made after the fact could distinguish from it having always been that way.
  const before = await aliases.forProject(project.id);
  const prodBefore = before.find((a) => a.kind === "production");
  if (!prodBefore) {
    console.error("project has no production alias — nothing to protect, so this would prove nothing");
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }
  console.log(`  production alias ${prodBefore.ref} -> ${prodBefore.hostname}`);
  console.log(`  currently serving deployment ${prodBefore.deployment_id ?? "(none)"}`);

  // ── the webhook's own decision, not a copy of it ──────────────────────────
  const push = parsePushEvent({
    ref: `refs/heads/${branchArg}`,
    after: sha,
    repository: { full_name: repoArg },
    head_commit: { message: `preview e2e for ${branchArg}`, author: { username: "preview-e2e" } },
    installation: { id: 1 },
  });
  if (!push) {
    console.error("the push payload did not parse — proving nothing");
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }

  const decision = shouldDeploy(push, project.production_branch);
  console.log();
  console.log(`  webhook decision: ${decision.deploy ? decision.kind : `no deploy (${decision.reason})`}`);
  const problems: string[] = [];
  if (!decision.deploy || decision.kind !== "preview") {
    problems.push(`expected a preview decision, got ${JSON.stringify(decision)}`);
    for (const p of problems) console.log(`  FINDING: ${p}`);
    process.exitCode = EXIT_FOUND;
    return;
  }

  const env = await environments.forBranch(project.id, decision.branch);
  console.log(`  environment ${env.ref} (${env.kind}, ${env.name})`);

  const existing = await deployments.byEnvironmentAndSha(env.id, sha);
  const d =
    existing ??
    (await deployments.create({
      projectId: project.id,
      environmentId: env.id,
      trigger: "git_push",
      gitSha: sha,
      gitRef: decision.branch,
      gitMessage: `preview e2e for ${branchArg}`,
    }));
  console.log(`  deployment  ${d.ref} ${existing ? "(already recorded)" : "(recorded)"} state=${d.state}`);
  console.log(`  hostname    ${previewLabel(project.slug, decision.branch)}`);
  console.log(`  sizing      ${PREVIEW_TIER} x${PREVIEW_INSTANCES}`);

  if (!BUILD) {
    console.log();
    console.log("  Recorded only. Re-run with --build to lease a build VM and deploy it.");
    return;
  }

  // ── build it for real ─────────────────────────────────────────────────────
  console.log();
  console.log("  building (this leases a real build VM and costs money)...");
  try {
    const out = await deployFromRepo({
      repo: repoArg,
      rootDirectory: project.root_directory,
      existingDeploymentRef: d.ref,
      // Without this DNS is skipped and the preview resolves to nothing — the
      // hostname exists, routes, and serves, and no one can reach it.
      gatewayIp: await gatewayIp(),
      onProgress: (stage, detail) => console.log(`    ${stage.padEnd(10)} ${detail}`),
    });
    console.log(`  built ${out.deployment.ref} -> ${out.hostname}`);
  } catch (e) {
    console.log(`  BUILD FAILED: ${(e as Error).message.slice(0, 300)}`);
    problems.push(`preview build failed: ${(e as Error).message.slice(0, 160)}`);
  }

  // ── did production move? ──────────────────────────────────────────────────
  console.log();
  const after = await aliases.forProject(project.id);
  const prodAfter = after.find((a) => a.ref === prodBefore.ref);

  if (!prodAfter) {
    problems.push("the production alias DISAPPEARED during a preview build");
  } else if (prodAfter.deployment_id !== prodBefore.deployment_id) {
    // The whole reason this script exists.
    problems.push(
      `PRODUCTION MOVED during a preview build: ${prodBefore.deployment_id} -> ${prodAfter.deployment_id}`,
    );
  } else {
    console.log(`  production alias unchanged: still ${prodAfter.deployment_id ?? "(none)"} — correct`);
  }

  const branchAliases = after.filter((a) => a.kind === "branch");
  console.log(`  branch aliases now: ${branchAliases.length ? branchAliases.map((a) => a.hostname).join(", ") : "(none)"}`);
  if (!branchAliases.length) {
    problems.push("no branch alias was minted, so the preview has no hostname and the reaper cannot see it");
  }

  console.log();
  if (problems.length) {
    for (const p of problems) console.log(`  FINDING: ${p}`);
    process.exitCode = EXIT_FOUND;
    return;
  }
  console.log("  Preview built, production untouched.");
}

await main();
