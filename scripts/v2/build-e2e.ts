/**
 * End-to-end build proof, against a real public repository.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/build-e2e.ts <owner/repo> [--apply]
 *
 * Without --apply it prints the plan and the rendered cloud-init and spends
 * nothing. With --apply it leases a real Linode, builds, uploads an OCI tarball
 * to R2, and destroys the VM.
 *
 * Public repositories clone anonymously. Private ones go through the GitHub App
 * and receive a 1-hour single-repo read-only installation token instead — the
 * only credential difference between the two paths.
 */

import { detectFramework, detectPackageManager, DETECTION_FILES, type RepoFiles } from "../../lib/paas/build/detect.ts";
import { generateDockerfile, servingPort } from "../../lib/paas/build/dockerfile.ts";
import {
  renderCloudInit,
  leaseBuildVm,
  pollBuildResult,
  destroyBuildVm,
  reapExpiredBuildVms,
  type BuildRequest,
} from "../../lib/paas/build/vm.ts";
import { getObject, deleteObject, r2Keys } from "../../lib/paas/build/r2.ts";
import { randomBytes } from "node:crypto";

const repoArg = process.argv.find((a) => /^[\w.-]+\/[\w.-]+$/.test(a)) ?? "heroku/node-js-getting-started";
const APPLY = process.argv.includes("--apply");
const UA = "ahuracloud-deploy-v2";

console.log(`\nBuild end-to-end: ${repoArg}\n` + "─".repeat(80));

// ── 1. load the repository ──────────────────────────────────────────────────
//
// Deliberately avoids api.github.com. The anonymous API allows 60 requests an
// hour, which a few detection runs exhaust; raw.githubusercontent.com is far
// more permissive. More importantly this is how detection should work anyway:
// probe for the marker files directly rather than enumerating a tree, which
// also means it costs the same on a 5-file repo and a 50,000-file monorepo.

/** Every file whose presence is a framework signal, plus the ones we read. */
const MARKER_FILES = [
  "Dockerfile",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "requirements.txt",
  "pyproject.toml",
  "Pipfile",
  "manage.py",
  "go.mod",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "composer.json",
  "index.html",
  ...DETECTION_FILES,
];

async function probe(repo: string, branch: string, path: string): Promise<string | null> {
  const r = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/${path}`, {
    headers: { "User-Agent": UA },
  });
  return r.ok ? r.text() : null;
}

// Resolve the default branch by probing, since we are not calling the API.
let branch = "main";
if ((await probe(repoArg, "main", "README.md")) === null && (await probe(repoArg, "main", "package.json")) === null) {
  branch = "master";
}

const files: RepoFiles = { paths: [], contents: {} };
const seen = new Set<string>();
for (const f of MARKER_FILES) {
  if (seen.has(f)) continue;
  seen.add(f);
  const body = await probe(repoArg, branch, f);
  if (body === null) continue;
  files.paths.push(f);
  // Only keep contents for files detection actually reads.
  if ((DETECTION_FILES as readonly string[]).includes(f)) files.contents[f] = body;
}

if (!files.paths.length) {
  console.log(`\nNo marker files found on branch "${branch}". Is ${repoArg} public and non-empty?`);
  process.exit(1);
}

console.log(`branch      ${branch}`);
console.log(`markers     ${files.paths.join(", ")}`);

// ── 2. detect ───────────────────────────────────────────────────────────────
const detection = detectFramework(files);
const pm = detectPackageManager(files);
console.log(`\ndetected    ${detection.framework} (${detection.runtime}, ${detection.confidence})`);
console.log(`            ${detection.reason}`);
console.log(`build       ${detection.buildCommand ?? "—"}`);
console.log(`start       ${detection.startCommand ?? "—"}`);
console.log(`port        ${servingPort(detection)}`);
console.log(`pkg mgr     ${pm}`);

if (detection.framework === "unknown") {
  console.log("\nRefusing to build an unrecognised repository. Add a Dockerfile.");
  process.exit(1);
}

// ── 3. generate the Dockerfile ──────────────────────────────────────────────
const dockerfile = generateDockerfile({
  detection,
  packageManager: pm,
  publicEnvKeys: [],
});
console.log(`\ndockerfile  ${dockerfile ? `${dockerfile.split("\n").length} lines generated` : "supplied by the repository"}`);

// ── 4. assemble the build request ───────────────────────────────────────────
const deploymentRef = `dpl_${randomBytes(6).toString("hex")}`;
const req: BuildRequest = {
  deploymentRef,
  cloneUrl: `https://github.com/${repoArg}.git`,
  gitRef: branch,
  gitSha: "HEAD",
  dockerfile,
  imageName: `ahura/${repoArg.split("/")[1]}:${deploymentRef}`,
  buildArgs: {},
};

console.log(`deployment  ${deploymentRef}`);

if (!APPLY) {
  console.log("\n── rendered cloud-init (first 60 lines) ──");
  const ci = renderCloudInit(req, { imagePut: "https://r2/IMAGE", logPut: "https://r2/LOG", metaPut: "https://r2/META" });
  console.log(ci.split("\n").slice(0, 60).join("\n"));
  console.log(`… (${ci.split("\n").length} lines total, ${ci.length} bytes)`);
  console.log("\nDry run — nothing was created. Re-run with --apply to build for real.");
  process.exit(0);
}

// ── 5. build ────────────────────────────────────────────────────────────────
console.log("\n── leasing build VM ──");
const vm = await leaseBuildVm(req);
console.log(`linode      ${vm.linodeId} (${vm.label}), deadline ${vm.expiresAt.toISOString()}`);

let result: Awaited<ReturnType<typeof pollBuildResult>> = null;
try {
  result = await pollBuildResult(deploymentRef, {
    onTick: (ms) => process.stdout.write(`\r  building… ${Math.round(ms / 1000)}s`),
  });
  console.log("");
} finally {
  // The VM is destroyed whether the build succeeded, failed or timed out.
  // Nothing is left running on any path out of this block.
  console.log(`\n── destroying VM ${vm.linodeId} ──`);
  await destroyBuildVm(vm.linodeId, vm.ref).catch((e) => console.log(`  destroy failed: ${(e as Error).message}`));
}

// ── 6. report ───────────────────────────────────────────────────────────────
const log = await getObject(r2Keys.buildLog(deploymentRef));
const tar = await getObject(r2Keys.imageTar(deploymentRef));

console.log("\n── result ──");
if (!result) {
  console.log("TIMED OUT — no meta object was written before the deadline.");
} else {
  console.log(`status      ${result.status}`);
  console.log(`digest      ${result.imageDigest || (result as { digest?: string }).digest || "—"}`);
  if (result.error) console.log(`error       ${result.error}`);
}
console.log(`build log   ${log ? `${log.length} bytes in R2` : "not uploaded"}`);
console.log(`image tar   ${tar ? `${(tar.length / 1_048_576).toFixed(1)} MB in R2` : "not uploaded"}`);

if (log) {
  console.log("\n── last 30 log lines ──");
  console.log(log.toString("utf8").trimEnd().split("\n").slice(-30).join("\n"));
}

// ── 7. clean up artifacts and sweep for orphans ─────────────────────────────
for (const k of [r2Keys.buildLog(deploymentRef), r2Keys.imageTar(deploymentRef), r2Keys.buildMeta(deploymentRef)]) {
  await deleteObject(k).catch(() => {});
}
const reaped = await reapExpiredBuildVms(0);
console.log(`\nreaper      ${reaped.length} stale build VM(s) destroyed`);
