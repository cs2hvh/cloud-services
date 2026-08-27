/**
 * Prove the webhook path end to end WITHOUT a public URL.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/webhook-proof.ts [--enqueue]
 *
 * Exercises exactly what the route does — signature verification over raw
 * bytes, push parsing, branch policy, project resolution, retry idempotency —
 * against the live database, using a payload signed with the real webhook
 * secret. `--enqueue` actually records the deployment so the build worker can
 * pick it up.
 *
 * This exists because the alternative is "it looks right", and the last time
 * something in this codebase was only inspected rather than run, it had no
 * caller at all.
 */

import { createHmac } from "node:crypto";
import { verifySignature, parsePushEvent, shouldDeploy } from "../../lib/paas/github/webhook.ts";
import { paasConfig } from "../../lib/paas/config.ts";
import { projects, environments, deployments, db } from "../../lib/paas/db.ts";
import { resolveRepoTarget } from "../../lib/paas/repo-target.ts";

const ENQUEUE = process.argv.includes("--enqueue");

const secret = paasConfig.github.webhookSecret();
if (!secret) {
  console.log("GITHUB_WEBHOOK_SECRET is not set — the route would return 500 and refuse everything.");
  process.exit(1);
}

const project = (await projects.list())[0];
if (!project) {
  console.log("no projects to simulate against");
  process.exit(1);
}

const SHA = "63c6674c478b697fc20a6412c78a5f7a2dcf14be";
const body = JSON.stringify({
  ref: `refs/heads/${project.production_branch}`,
  after: SHA,
  repository: { full_name: project.repo_full_name, default_branch: project.production_branch },
  head_commit: { id: SHA, message: "webhook proof commit", author: { username: "harshit" } },
  installation: { id: 4724183 },
});
const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

console.log(`\nWebhook path proof\n` + "═".repeat(70));
console.log(`project     ${project.ref}  ${project.repo_full_name}@${project.production_branch}`);

// 1. a forged request must be refused
const forged = verifySignature(body, "sha256=" + "0".repeat(64), secret);
console.log(`\n  forged signature      ${forged.ok ? "ACCEPTED — BUG" : `refused (${(forged as any).reason})`}`);

// 2. a tampered body must be refused even with a real signature for the original
const tampered = verifySignature(body.replace("harshit", "attacker"), sig, secret);
console.log(`  tampered body         ${tampered.ok ? "ACCEPTED — BUG" : `refused (${(tampered as any).reason})`}`);

// 3. the genuine request must verify
const genuine = verifySignature(body, sig, secret);
console.log(`  genuine signature     ${genuine.ok ? "verified" : "REFUSED — BUG"}`);
if (!genuine.ok) process.exit(1);

// 4. parse and policy
const push = parsePushEvent(JSON.parse(body))!;
const decision = shouldDeploy(push, project.production_branch);
console.log(`  parsed                ${push.repoFullName}@${push.branch} ${push.sha.slice(0, 7)} by ${push.author}`);
console.log(`  policy                ${decision.deploy ? "deploy" : `skip — ${(decision as any).reason}`}`);

// 5. a push to another branch must deploy AS A PREVIEW — not as production.
//
// This printed "DEPLOYS — BUG" for every non-production push, which was right
// until previews were built and wrong every run since: a proof calling a working
// feature a bug is how a red line stops being read. The question was never
// whether a feature branch deploys, it is WHERE — routed as production, the same
// push replaces the customer’s live site.
const other = parsePushEvent(JSON.parse(body.replace(`refs/heads/${project.production_branch}`, "refs/heads/some-feature")))!;
const otherDecision = shouldDeploy(other, project.production_branch);
const previewOk = otherDecision.deploy && otherDecision.kind === "preview";
console.log(
  `  non-production branch ${previewOk ? "preview, not production" : `${JSON.stringify(otherDecision)} — BUG`}`,
);

// The other half of the same claim. A run where BOTH branches route to preview
// would pass the line above while production never deployed at all.
const prodDecision = shouldDeploy(push, project.production_branch);
console.log(
  `  production branch     ${prodDecision.deploy && prodDecision.kind === "production" ? "production" : `${JSON.stringify(prodDecision)} — BUG`}`,
);

// 6. project resolution, as the route does it
// Resolved the way the route resolves it, provider and all. A proof that used
// a looser lookup would go green on a path production does not take.
const resolved = resolveRepoTarget(
  await projects.matchingRepo("github", push.repoFullName),
  push.repoFullName,
  "github",
);
console.log(
  `  repo -> project       ${resolved.kind === "one" ? resolved.project.ref : `${resolved.kind.toUpperCase()} — ${resolved.reason}`}`,
);

// 7. idempotency: a retried delivery must not build twice
const already = await deployments.byProjectAndSha(project.id, push.sha);
console.log(`  retry idempotency     ${already ? `existing ${already.ref} — would return 200, not rebuild` : "no prior deployment for this sha"}`);

if (!ENQUEUE) {
  console.log(`\nInspection only. Re-run with --enqueue to actually record the deployment.`);
  process.exit(0);
}

if (already) {
  console.log(`\nAlready recorded as ${already.ref}. Idempotency working; nothing to do.`);
  process.exit(0);
}

const env =
  (await environments.production(project.id)) ??
  (await environments.create({ projectId: project.id, kind: "production", name: "production" }));

const d = await deployments.create({
  projectId: project.id,
  environmentId: env.id,
  trigger: "git_push",
  gitSha: push.sha,
  gitRef: decision.deploy ? decision.branch : project.production_branch,
  gitMessage: push.message,
});

console.log(`\nENQUEUED ${d.ref} (state=${d.state}, trigger=${d.trigger}, sha=${d.git_sha?.slice(0, 7)})`);
console.log(`Run the worker to build it:`);
console.log(`  node --env-file=.env --env-file=.env.local scripts/v2/build-worker.ts --once`);
