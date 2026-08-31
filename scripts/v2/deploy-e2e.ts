/**
 * Full pipeline proof: repository -> build -> publish -> run in Kubernetes.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/deploy-e2e.ts <owner/repo> [--apply] [--skip-build]
 *
 * --skip-build reuses an already-uploaded artifact by deployment ref:
 *   node --env-file=.env --env-file=.env.local scripts/v2/deploy-e2e.ts <repo> --apply --ref dpl_xxx
 */

import { detectFramework, detectPackageManager, DETECTION_FILES, type RepoFiles } from "../../lib/paas/build/detect.ts";
import { generateDockerfile, servingPort, runtimeUid } from "../../lib/paas/build/dockerfile.ts";
import { leaseBuildVm, pollBuildResult, destroyBuildVm, reapExpiredBuildVms, type BuildRequest } from "../../lib/paas/build/vm.ts";
import { presign, getObject, r2Keys } from "../../lib/paas/build/r2.ts";
import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";
import {
  PAAS_NAMESPACE,
  REGISTRY_PUSH,
  REGISTRY_PULL,
  namespaceManifest,
  publisherJob,
  appDeployment,
  appService,
  tenantNetworkPolicy,
} from "../../lib/paas/k8s/manifests.ts";
import { randomBytes } from "node:crypto";

const repoArg = process.argv.find((a) => /^[\w.-]+\/[\w.-]+$/.test(a)) ?? "heroku/node-js-getting-started";
const APPLY = process.argv.includes("--apply");
const refIdx = process.argv.indexOf("--ref");
const reuseRef = refIdx >= 0 ? process.argv[refIdx + 1] : null;
const UA = "ahuracloud-deploy-v2";
const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";

const k = kube(loadKubeconfig(KUBECONFIG));

const MARKER_FILES = [
  "Dockerfile", "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb",
  "requirements.txt", "pyproject.toml", "Pipfile", "manage.py", "go.mod", "Gemfile",
  "pom.xml", "build.gradle", "composer.json", "index.html", ...DETECTION_FILES,
];

async function probe(repo: string, branch: string, path: string): Promise<string | null> {
  const r = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/${path}`, { headers: { "User-Agent": UA } });
  return r.ok ? r.text() : null;
}

console.log(`\nFull pipeline: ${repoArg}\n` + "═".repeat(80));

// ── detect ──────────────────────────────────────────────────────────────────
let branch = "main";
if ((await probe(repoArg, "main", "README.md")) === null && (await probe(repoArg, "main", "package.json")) === null) {
  branch = "master";
}
const files: RepoFiles = { paths: [], contents: {} };
for (const f of [...new Set(MARKER_FILES)]) {
  const body = await probe(repoArg, branch, f);
  if (body === null) continue;
  files.paths.push(f);
  if ((DETECTION_FILES as readonly string[]).includes(f)) files.contents[f] = body;
}
const detection = detectFramework(files);
const pm = detectPackageManager(files);
const port = servingPort(detection);

console.log(`\n[1/5] detect`);
console.log(`      ${detection.framework} (${detection.runtime}) on ${branch}, port ${port} — ${detection.reason}`);
if (detection.framework === "unknown") { console.log("      refusing to build"); process.exit(1); }

const dockerfile = generateDockerfile({ detection, packageManager: pm, publicEnvKeys: [] });
const deploymentRef = reuseRef ?? `dpl${randomBytes(5).toString("hex")}`;
const projectRef = `prj-${repoArg.split("/")[1].toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30)}`;
const tenantNs = `app-${projectRef}`;
const pushRef = `${REGISTRY_PUSH}/${projectRef}:${deploymentRef}`;
const pullRef = `${REGISTRY_PULL}/${projectRef}:${deploymentRef}`;

console.log(`      deployment=${deploymentRef} project=${projectRef} ns=${tenantNs}`);
console.log(`      push=${pushRef}`);
console.log(`      pull=${pullRef}`);

if (!APPLY) { console.log("\nDry run. Re-run with --apply."); process.exit(0); }

// ── build ───────────────────────────────────────────────────────────────────
if (!reuseRef) {
  console.log(`\n[2/5] build on a throwaway Linode`);
  const req: BuildRequest = {
    deploymentRef,
    cloneUrl: `https://github.com/${repoArg}.git`,
    gitRef: branch,
    gitSha: "HEAD",
    dockerfile,
    imageName: `${projectRef}:${deploymentRef}`,
    buildArgs: {},
  };
  const vm = await leaseBuildVm(req);
  console.log(`      linode ${vm.linodeId} leased`);
  let result;
  try {
    result = await pollBuildResult(deploymentRef, {
      onTick: (ms) => process.stdout.write(`\r      building… ${Math.round(ms / 1000)}s`),
    });
    console.log("");
  } finally {
    await destroyBuildVm(vm.linodeId, vm.ref).catch(() => {});
    console.log(`      linode ${vm.linodeId} destroyed`);
  }
  if (!result || result.status !== "success") {
    const log = await getObject(r2Keys.buildLog(deploymentRef));
    console.log(`      BUILD FAILED: ${result?.error ?? "timed out"}`);
    if (log) console.log(log.toString("utf8").split("\n").slice(-20).join("\n"));
    process.exit(1);
  }
  console.log(`      built ${result.imageDigest}`);
} else {
  console.log(`\n[2/5] build  skipped, reusing ${reuseRef}`);
}

const tar = await getObject(r2Keys.imageTar(deploymentRef));
if (!tar) { console.log("      no image tarball in R2 for this ref"); process.exit(1); }
console.log(`      artifact ${(tar.length / 1_048_576).toFixed(1)} MB in R2`);

// ── publish ─────────────────────────────────────────────────────────────────
console.log(`\n[3/5] publish into the in-cluster registry`);
const jobName = `pub-${deploymentRef.toLowerCase()}`;
await k.delete(`/apis/batch/v1/namespaces/${PAAS_NAMESPACE}/jobs/${jobName}?propagationPolicy=Background`);
await new Promise((r) => setTimeout(r, 2000));

await k.apply(
  `/apis/batch/v1/namespaces/${PAAS_NAMESPACE}/jobs/${jobName}`,
  publisherJob({
    deploymentRef,
    presignedTarUrl: presign("GET", r2Keys.imageTar(deploymentRef), 1800),
    imageRef: pushRef,
  }),
);

const pubDeadline = Date.now() + 6 * 60_000;
let published = false;
while (Date.now() < pubDeadline) {
  let job = null;
  try {
    job = await k.get<{ status?: { succeeded?: number; failed?: number } }>(
      `/apis/batch/v1/namespaces/${PAAS_NAMESPACE}/jobs/${jobName}`, true,
    );
  } catch { /* transient API blip: keep polling rather than abandoning the run */ }
  if (job?.status?.succeeded) { published = true; break; }
  if (job?.status?.failed) break;
  process.stdout.write(`\r      publishing…`);
  await new Promise((r) => setTimeout(r, 5000));
}
console.log("");

if (!published) {
  console.log("      PUBLISH FAILED — publisher pod state:");
  for (const p of await k.listPods(PAAS_NAMESPACE)) {
    if (!p.metadata.name.startsWith(jobName)) continue;
    console.log(`      ${p.metadata.name} phase=${p.status?.phase}`);
    for (const c of p.status?.containerStatuses ?? []) console.log(`        ready=${c.ready} restarts=${c.restartCount}`);
  }
  process.exit(1);
}
console.log(`      pushed ${pushRef}`);

// ── run ─────────────────────────────────────────────────────────────────────
console.log(`\n[4/5] run in Kubernetes`);
await k.apply(`/api/v1/namespaces/${tenantNs}`, namespaceManifest(tenantNs, { "ahura.cloud/project": projectRef }));
await k.apply(`/apis/networking.k8s.io/v1/namespaces/${tenantNs}/networkpolicies/tenant-isolation`, tenantNetworkPolicy(tenantNs));
await k.apply(
  `/apis/apps/v1/namespaces/${tenantNs}/deployments/${deploymentRef}`,
  appDeployment({ deploymentRef, projectRef, namespace: tenantNs, image: pullRef, port, runAsUser: runtimeUid(detection) }),
);
await k.apply(
  `/api/v1/namespaces/${tenantNs}/services/${projectRef}`,
  appService({ deploymentRef, projectRef, namespace: tenantNs, port }),
);
console.log(`      applied namespace, NetworkPolicy, Deployment, Service`);

const runDeadline = Date.now() + 5 * 60_000;
let running = false;
let lastState = "";
while (Date.now() < runDeadline) {
  const pods = (await k.listPods(tenantNs)).filter((p) => p.metadata.labels?.["ahura.cloud/deployment"] === deploymentRef);
  running = pods.some((p) => p.status?.phase === "Running" && (p.status?.containerStatuses ?? []).every((c) => c.ready));
  if (running) break;
  lastState = pods.map((p) => {
    const cs = p.status?.containerStatuses?.[0];
    return `${p.status?.phase}${cs ? ` ready=${cs.ready} restarts=${cs.restartCount}` : ""}`;
  }).join(", ") || "no pod yet";
  process.stdout.write(`\r      ${lastState.padEnd(70)}`);
  await new Promise((r) => setTimeout(r, 5000));
}
console.log("");

if (!running) {
  console.log(`      DID NOT BECOME READY — last state: ${lastState}`);
  for (const p of await k.listPods(tenantNs)) {
    console.log(`\n      pod ${p.metadata.name}: ${p.status?.phase}`);
    const raw = await k.get<{ status?: { containerStatuses?: Array<{ state?: Record<string, { reason?: string; message?: string }> }> } }>(
      `/api/v1/namespaces/${tenantNs}/pods/${p.metadata.name}`, true,
    );
    for (const cs of raw?.status?.containerStatuses ?? []) {
      for (const [phase, detail] of Object.entries(cs.state ?? {})) {
        console.log(`        ${phase}: ${detail.reason ?? ""} ${detail.message ?? ""}`);
      }
    }
  }
  process.exit(1);
}
console.log(`      pod is Running and Ready`);

// ── verify over HTTP ────────────────────────────────────────────────────────
console.log(`\n[5/5] verify it actually serves HTTP`);
const probeName = `probe-${deploymentRef.toLowerCase()}`;
await k.delete(`/apis/batch/v1/namespaces/${PAAS_NAMESPACE}/jobs/${probeName}?propagationPolicy=Background`);
await new Promise((r) => setTimeout(r, 2000));

await k.apply(`/apis/batch/v1/namespaces/${PAAS_NAMESPACE}/jobs/${probeName}`, {
  apiVersion: "batch/v1",
  kind: "Job",
  metadata: { name: probeName, namespace: PAAS_NAMESPACE, labels: { "app.kubernetes.io/managed-by": "ahura-paas" } },
  spec: {
    backoffLimit: 2,
    ttlSecondsAfterFinished: 300,
    template: {
      spec: {
        restartPolicy: "Never",
        containers: [{
          name: "curl",
          image: "curlimages/curl:8.11.0",
          command: ["sh", "-c",
            `code=$(curl -s -o /tmp/b -w '%{http_code}' --max-time 20 http://${projectRef}.${tenantNs}.svc.cluster.local/); ` +
            `echo "HTTP $code"; head -c 300 /tmp/b; echo; [ "$code" = "200" ]`],
        }],
      },
    },
  },
});

const probeDeadline = Date.now() + 3 * 60_000;
let served: boolean | null = null;
while (Date.now() < probeDeadline) {
  let job = null;
  try {
    job = await k.get<{ status?: { succeeded?: number; failed?: number } }>(
      `/apis/batch/v1/namespaces/${PAAS_NAMESPACE}/jobs/${probeName}`, true,
    );
  } catch { /* transient API blip */ }
  if (job?.status?.succeeded) { served = true; break; }
  if (job?.status?.failed) { served = false; break; }
  process.stdout.write(`\r      probing…`);
  await new Promise((r) => setTimeout(r, 4000));
}
console.log("");

console.log("\n" + "═".repeat(80));
if (served) {
  console.log(`SUCCESS — ${repoArg} is built, published and serving HTTP 200 inside the cluster.`);
  console.log(`  namespace ${tenantNs}   service ${projectRef}:80 -> :${port}`);
  console.log(`  image     ${pullRef}`);
} else {
  console.log(`Pod runs but the HTTP probe ${served === false ? "failed" : "timed out"}.`);
}

const reaped = await reapExpiredBuildVms(0);
if (reaped.length) console.log(`\nreaper destroyed ${reaped.length} stale build VM(s)`);
