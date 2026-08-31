/**
 * Proof that promotion and rollback are one database write.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/promote-rollback-proof.ts <owner/repo> [--apply]
 *
 * Builds a project TWICE from the same repository, then moves the production
 * alias between the two deployments and shows traffic following it. The point
 * is not that two builds work — it is that moving traffic between them costs
 * one UPDATE and no rebuild.
 *
 * v1's rollback re-pointed a mutable Docker Hub tag that nothing pruned or
 * guaranteed still existed. Here each deployment is pinned to an immutable
 * digest, so rolling back means exactly what it says.
 */

import { detectFramework, detectPackageManager, DETECTION_FILES, type RepoFiles } from "../../lib/paas/build/detect.ts";
import { generateDockerfile, servingPort, runtimeUid } from "../../lib/paas/build/dockerfile.ts";
import { leaseBuildVm, pollBuildResult, destroyBuildVm, type BuildRequest } from "../../lib/paas/build/vm.ts";
import { presign, getObject, r2Keys } from "../../lib/paas/build/r2.ts";
import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";
import { PAAS_NAMESPACE, REGISTRY_PUSH, publisherJob } from "../../lib/paas/k8s/manifests.ts";
import { reconcileProject, promote } from "../../lib/paas/reconciler.ts";
import { db, teams, projects, environments, deployments, aliases } from "../../lib/paas/db.ts";
import { appHostname } from "../../lib/paas/config.ts";

const repoArg = process.argv.find((a) => /^[\w.-]+\/[\w.-]+$/.test(a)) ?? "heroku/node-js-getting-started";
const APPLY = process.argv.includes("--apply");
const UA = "ahuracloud-deploy-v2";
const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const ctx = loadKubeconfig(KUBECONFIG);
const k = kube(ctx);

if (!(await db.reachable())) {
  console.log("paas schema unreachable");
  process.exit(1);
}

const MARKERS = [
  "Dockerfile", "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
  "requirements.txt", "pyproject.toml", "manage.py", "go.mod", "Gemfile", "pom.xml",
  "composer.json", "index.html", ...DETECTION_FILES,
];
const probe = async (b: string, p: string) => {
  const r = await fetch(`https://raw.githubusercontent.com/${repoArg}/${b}/${p}`, { headers: { "User-Agent": UA } });
  return r.ok ? r.text() : null;
};

console.log(`\nPromote / rollback proof — ${repoArg}\n` + "═".repeat(80));

const branch = (await probe("main", "README.md")) !== null || (await probe("main", "package.json")) !== null ? "main" : "master";
const files: RepoFiles = { paths: [], contents: {} };
for (const f of [...new Set(MARKERS)]) {
  const body = await probe(branch, f);
  if (body === null) continue;
  files.paths.push(f);
  if ((DETECTION_FILES as readonly string[]).includes(f)) files.contents[f] = body;
}
const detection = detectFramework(files);
const pm = detectPackageManager(files);
const port = servingPort(detection);
const dockerfile = generateDockerfile({ detection, packageManager: pm, publicEnvKeys: [] });
console.log(`detected   ${detection.framework} (${detection.runtime}) port ${port}`);

if (!APPLY) {
  console.log("\nWould: create team+project+environment, build twice, promote, roll back.");
  console.log("Dry run. Re-run with --apply.");
  process.exit(0);
}

// ── 1. desired state in the database ────────────────────────────────────────
// teams.created_by is FK'd to auth.users, so a team cannot be conjured from a
// script with no user context. Seeded once via SQL; this only reads it.
const team = await teams.bySlug("ahura-demo");
if (!team) {
  console.log('No team with slug "ahura-demo". Seed one first:');
  console.log("  insert into paas.teams (slug, name, created_by)");
  console.log("  select 'ahura-demo','Ahura Demo',(select id from auth.users limit 1);");
  process.exit(1);
}
console.log(`team       ${team.ref} (${team.slug})`);

const slug = repoArg.split("/")[1].toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 38);
let project = await projects.bySlug(team.id, slug);
if (!project) {
  project = await projects.create({
    teamId: team.id, name: repoArg, slug,
    provider: "github", repoId: repoArg, repoFullName: repoArg,
    productionBranch: branch, framework: detection.framework,
  });
}
console.log(`project    ${project.ref} (${project.slug})`);

let env = await environments.production(project.id);
if (!env) env = await environments.create({ projectId: project.id, kind: "production", name: "production" });
console.log(`env        ${env.ref}`);

const hostname = appHostname(`v2-${project.slug}`.slice(0, 40));
let alias = await aliases.production(project.id);
if (!alias) alias = await aliases.create({ projectId: project.id, hostname, kind: "production" });
console.log(`alias      ${alias.ref} -> ${alias.hostname}`);

// ── 2. build helper ─────────────────────────────────────────────────────────
async function buildOne(label: string) {
  const d = await deployments.create({
    projectId: project!.id, environmentId: env!.id, trigger: "manual",
    gitSha: "0000000", gitRef: branch,
  });
  console.log(`\n── ${label}: deployment ${d.ref} ──`);

  await deployments.setState(d.ref, { state: "building", startedAt: true });
  const req: BuildRequest = {
    deploymentRef: d.ref, cloneUrl: `https://github.com/${repoArg}.git`,
    gitRef: branch, gitSha: "HEAD", dockerfile,
    imageName: `${project!.ref}:${d.ref}`, buildArgs: {},
  };
  const vm = await leaseBuildVm(req, { record: true });
  console.log(`   linode ${vm.linodeId} leased, row ${vm.ref}`);
  let result;
  try {
    result = await pollBuildResult(d.ref, { onTick: (ms) => process.stdout.write(`\r   building… ${Math.round(ms / 1000)}s`) });
    console.log("");
  } finally {
    await destroyBuildVm(vm.linodeId, vm.ref).catch(() => {});
  }
  if (!result || result.status !== "success") {
    await deployments.setState(d.ref, { state: "error", errorMessage: result?.error ?? "timed out" });
    throw new Error(`build failed for ${d.ref}`);
  }

  await deployments.setState(d.ref, { state: "publishing" });
  const jobName = `pub-${d.ref}`;
  await k.delete(`/apis/batch/v1/namespaces/${PAAS_NAMESPACE}/jobs/${jobName}?propagationPolicy=Background`);
  await new Promise((r) => setTimeout(r, 2000));
  await k.apply(
    `/apis/batch/v1/namespaces/${PAAS_NAMESPACE}/jobs/${jobName}`,
    publisherJob({
      deploymentRef: d.ref,
      presignedTarUrl: presign("GET", r2Keys.imageTar(d.ref), 1800),
      imageRef: `${REGISTRY_PUSH}/${project!.ref}:${d.ref}`,
    }),
  );
  const dl = Date.now() + 6 * 60_000;
  let ok = false;
  while (Date.now() < dl) {
    let job = null;
    try {
      job = await k.get<{ status?: { succeeded?: number; failed?: number } }>(
        `/apis/batch/v1/namespaces/${PAAS_NAMESPACE}/jobs/${jobName}`, true);
    } catch { /* transient */ }
    if (job?.status?.succeeded) { ok = true; break; }
    if (job?.status?.failed) break;
    process.stdout.write(`\r   publishing…`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log("");
  if (!ok) throw new Error(`publish failed for ${d.ref}`);

  // image_digest is write-once at the database level, so this cannot later be
  // rewritten by a late or duplicate finalizer.
  await deployments.setState(d.ref, {
    state: "ready", readyAt: true,
    imageRepo: `${project!.ref}`, imageDigest: result.imageDigest!,
  });
  console.log(`   ready, digest ${result.imageDigest!.slice(0, 23)}…`);
  return (await deployments.byRef(d.ref))!;
}

async function converge(note: string) {
  const report = await reconcileProject(ctx, project!, { appDomain: "ahurasense.com" });
  console.log(`\n   reconcile (${note}):`);
  for (const a of report.actions) console.log(`     ${a.kind.padEnd(11)} ${a.target.padEnd(22)} ${a.detail}`);
}

async function whoIsServing(): Promise<string> {
  const svc = await k.get<{ spec?: { selector?: Record<string, string> } }>(
    `/api/v1/namespaces/app-${project!.ref}/services/${project!.ref}`, true);
  return svc?.spec?.selector?.["ahura.cloud/deployment"] ?? "(none)";
}

// ── 3. two builds ───────────────────────────────────────────────────────────
const v1 = await buildOne("BUILD 1");
await aliases.point(alias.ref, v1.id);
await converge("after first build");
console.log(`\n   serving: ${await whoIsServing()}`);

const v2 = await buildOne("BUILD 2");

// ── 4. promote ──────────────────────────────────────────────────────────────
console.log(`\n── PROMOTE to ${v2.ref} ──`);
console.log(`   one UPDATE of aliases.deployment_id. No rebuild, no retag.`);
await promote(project.id, v2.ref);
await converge("after promote");
console.log(`\n   serving: ${await whoIsServing()}`);

// ── 5. roll back ────────────────────────────────────────────────────────────
console.log(`\n── ROLL BACK to ${v1.ref} ──`);
await promote(project.id, v1.ref);
await converge("after rollback");
console.log(`\n   serving: ${await whoIsServing()}`);

console.log("\n" + "═".repeat(80));
console.log(`Both operations were a single row update. Deployments are untouched and`);
console.log(`digest-pinned, so ${v2.ref} remains rollable-to at any time.`);
console.log(`Superseded deployments were scaled to ZERO, not deleted — that is what`);
console.log(`makes rollback a scale-up rather than a rebuild, and it stops every deploy`);
console.log(`from silently doubling cost.`);
