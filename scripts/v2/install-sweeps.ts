/**
 * Install the scheduled sweeps as CronJobs.
 *
 * Run:  node --experimental-strip-types --env-file=.env --env-file=.env.local \
 *         scripts/v2/install-sweeps.ts [--apply]
 *
 * Without --apply this is a dry run: it resolves the source closure, builds
 * every manifest, and prints what it WOULD create, touching nothing.
 *
 * THIS SCRIPT VERIFIES ITS OWN WRITES. app-deploy-3 shipped a quota installer
 * an hour before this one that printed "enforced" for three namespaces and
 * created zero ResourceQuotas: the PUTs 404'd, the failure was swallowed by
 * `allowMissing`, and every failure read as a success. So nothing here reports
 * success it has not read back from the API server afterwards, and the exit
 * code is driven by that read-back rather than by the writes appearing to work.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";
import { PAAS_NAMESPACE } from "../../lib/paas/k8s/manifests.ts";
import {
  SWEEP_JOBS,
  SWEEP_SRC_CONFIGMAP,
  sweepClusterRole,
  sweepClusterRoleBinding,
  sweepCronJob,
  sweepSecret,
  sweepServiceAccount,
  sweepSourceConfigMap,
  type SweepJob,
} from "../../lib/paas/k8s/sweeps.ts";

const APPLY = process.argv.includes("--apply");
const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const ROOT = resolve(import.meta.dirname, "../..");

// ── resolve the import closure ──────────────────────────────────────────────
// Shipping all of lib/paas would fit under the 1 MB ConfigMap cap today, but
// only just, and it would fail silently later as the tree grows. Walking the
// actual imports keeps the payload to what is genuinely reachable.

function importsOf(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) out.push(m[1]);
  for (const m of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]);
  return out;
}

function closure(entry: string): Map<string, string> {
  const seen = new Map<string, string>();
  const queue = [resolve(ROOT, entry)];
  while (queue.length) {
    const abs = queue.pop()!;
    const rel = relative(ROOT, abs).replace(/\\/g, "/");
    if (seen.has(rel)) continue;
    let src: string;
    try {
      src = readFileSync(abs, "utf8");
    } catch {
      // A specifier that does not resolve to a file on disk is a bare module
      // (node: builtins). Those need no shipping — but a RELATIVE path that
      // fails to resolve is a real bug, so distinguish them.
      if (rel.includes("..") || rel.startsWith("lib/") || rel.startsWith("scripts/")) {
        throw new Error(`unresolved local import: ${rel}`);
      }
      continue;
    }
    seen.set(rel, src);
    for (const spec of importsOf(src)) {
      if (!spec.startsWith(".")) continue; // node: builtins and bare modules
      queue.push(resolve(dirname(abs), spec));
    }
  }
  return seen;
}

const files = new Map<string, string>();
for (const job of SWEEP_JOBS) {
  for (const [path, contents] of closure(job.script)) files.set(path, contents);
}
const fileList = [...files].map(([path, contents]) => ({ path, contents })).sort((a, b) => a.path.localeCompare(b.path));
const totalBytes = fileList.reduce((n, f) => n + Buffer.byteLength(f.contents), 0);
const srcHash = createHash("sha256").update(fileList.map((f) => f.path + f.contents).join("\0")).digest("hex").slice(0, 16);

console.log(`source closure: ${fileList.length} files, ${(totalBytes / 1024).toFixed(1)} KB, hash ${srcHash}`);

/**
 * Does the shipped source carry the observability lane's exit-code contract?
 *
 * OBSERVED, never assumed. Under the old contract exit 1 meant "found drift";
 * under the new one it means "could not run". Translating findings-codes to
 * success against the WRONG contract turns the alert-worthy case into a green
 * tick, which is strictly worse than the noise it would remove.
 */
const CONTRACT_PATH = "lib/paas/telemetry/exit-codes.ts";
const contractPresent = files.has(CONTRACT_PATH);
console.log(
  contractPresent
    ? `exit-code contract: present — 10/11 (ran and found something) will report success`
    : `exit-code contract: ABSENT (${CONTRACT_PATH} not in closure) — no translation; ` +
        `a sweep that FINDS something will show as a failed Job until the contract ships`,
);

// The cap is 1 MiB for the whole object. Refuse near it rather than letting the
// API server reject a manifest we assembled without checking.
const CAP = 1048576;
if (totalBytes > CAP * 0.9) {
  console.error(`REFUSING: source closure is ${(totalBytes / 1024).toFixed(1)} KB, too close to the ${CAP / 1024} KB ConfigMap cap.`);
  console.error("Split the sweeps across separate ConfigMaps before adding more.");
  process.exit(1);
}

// ── build manifests ─────────────────────────────────────────────────────────

const env = process.env as Record<string, string>;
const manifests: Array<{ kind: string; name: string; ns: string | null; path: string; body: unknown }> = [];

manifests.push({
  kind: "ConfigMap", name: SWEEP_SRC_CONFIGMAP, ns: PAAS_NAMESPACE,
  path: `/api/v1/namespaces/${PAAS_NAMESPACE}/configmaps/${SWEEP_SRC_CONFIGMAP}`,
  body: sweepSourceConfigMap(fileList),
});

const cr = sweepClusterRole();
manifests.push({ kind: "ClusterRole", name: cr.metadata.name, ns: null, path: `/apis/rbac.authorization.k8s.io/v1/clusterroles/${cr.metadata.name}`, body: cr });

const crb = sweepClusterRoleBinding(SWEEP_JOBS);
manifests.push({ kind: "ClusterRoleBinding", name: crb.metadata.name, ns: null, path: `/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/${crb.metadata.name}`, body: crb });

const missing: string[] = [];
for (const job of SWEEP_JOBS) {
  const sa = sweepServiceAccount(job);
  manifests.push({ kind: "ServiceAccount", name: sa.metadata.name, ns: PAAS_NAMESPACE, path: `/api/v1/namespaces/${PAAS_NAMESPACE}/serviceaccounts/${sa.metadata.name}`, body: sa });

  const secret = sweepSecret(job, env);
  const keys = Object.keys(secret.stringData);
  if (keys.length === 0 && job.needs.some((n) => n !== "k8s")) {
    missing.push(`${job.name}: no credentials resolved from the environment`);
  }
  manifests.push({ kind: "Secret", name: secret.metadata.name, ns: PAAS_NAMESPACE, path: `/api/v1/namespaces/${PAAS_NAMESPACE}/secrets/${secret.metadata.name}`, body: secret });

  const cj = sweepCronJob(job, fileList, srcHash, contractPresent);
  manifests.push({ kind: "CronJob", name: cj.metadata.name, ns: PAAS_NAMESPACE, path: `/apis/batch/v1/namespaces/${PAAS_NAMESPACE}/cronjobs/${cj.metadata.name}`, body: cj });

  console.log(`  ${job.name.padEnd(16)} ${job.schedule.padEnd(16)} creds=[${keys.join(", ") || "none"}]`);
}

if (missing.length) {
  console.error("\nREFUSING — a sweep with no credentials would run and report nothing wrong:");
  for (const m of missing) console.error("  " + m);
  process.exit(1);
}

// ── is what is RUNNING the same as what is here? ─────────────────────────────
//
// The ConfigMap is a SNAPSHOT taken at install time, and nothing re-ships it.
// The sweeps therefore keep running whatever source was current when they were
// installed, forever, and the only symptom is behaviour that quietly predates
// the fixes in the tree. That already happened: eleven commits landed —
// including the exit-code contract — while the cluster ran the older copy, and
// nothing anywhere said so.
//
// So the installer reports it. A differing hash is not an error here — a dry
// run is allowed to observe drift — but it IS the answer to "why is the cluster
// not doing what the code says".
{
  const probe = kube(loadKubeconfig(KUBECONFIG));
  const first = SWEEP_JOBS[0].name;
  const deployed = await probe
    .get<{ spec?: { jobTemplate?: { spec?: { template?: { metadata?: { annotations?: Record<string, string> } } } } } }>(
      `/apis/batch/v1/namespaces/${PAAS_NAMESPACE}/cronjobs/sweep-${first}`,
      true,
    )
    .catch(() => null);
  const running = deployed?.spec?.jobTemplate?.spec?.template?.metadata?.annotations?.["ahura.cloud/src-hash"];
  if (!running) {
    console.log("\nrunning source: nothing deployed yet");
  } else if (running === srcHash) {
    console.log(`\nrunning source: ${running} — matches this tree`);
  } else {
    console.log(`\nrunning source: ${running} — STALE; this tree is ${srcHash}`);
    console.log("  the cluster is executing source that predates this checkout. Re-run with --apply.");
  }
}

if (!APPLY) {
  console.log(`\nDRY RUN — ${manifests.length} objects would be applied. Re-run with --apply.`);
  process.exit(0);
}

// ── apply, then read back ───────────────────────────────────────────────────

const k = kube(loadKubeconfig(KUBECONFIG));

for (const m of manifests) {
  await k.apply(m.path, m.body);
  console.log(`applied  ${m.kind}/${m.name}`);
}

console.log("\nread-back — an applied object that is not present is a FAILURE, not a warning:");
let bad = 0;
for (const m of manifests) {
  // Deliberately no allowMissing: a 404 here must throw, not resolve to null.
  const got = await k.get<{ metadata?: { name?: string } }>(m.path).catch(() => null);
  const ok = got?.metadata?.name === m.name;
  if (!ok) bad++;
  console.log(`  ${ok ? "OK      " : "MISSING "} ${m.kind}/${m.name}`);
}

if (bad > 0) {
  console.error(`\nNOT INSTALLED: ${bad} of ${manifests.length} objects are absent after apply.`);
  process.exit(1);
}

// Schedules are only real if the API server accepted them as schedules.
console.log("\nschedules as the API server parsed them:");
for (const job of SWEEP_JOBS) {
  const cj = await k
    .get<{ spec?: { schedule?: string; suspend?: boolean }; status?: { lastScheduleTime?: string } }>(
      `/apis/batch/v1/namespaces/${PAAS_NAMESPACE}/cronjobs/sweep-${job.name}`,
    )
    .catch(() => null);
  const sched = cj?.spec?.schedule ?? "(unreadable)";
  const suspended = cj?.spec?.suspend === true;
  if (sched !== job.schedule || suspended) bad++;
  console.log(`  sweep-${job.name.padEnd(16)} ${sched.padEnd(16)} ${suspended ? "SUSPENDED" : "active"}`);
}

if (bad > 0) {
  console.error("\nA schedule does not match what was requested, or a job is suspended.");
  process.exit(1);
}

console.log(`\nINSTALLED: ${SWEEP_JOBS.length} CronJobs, verified present and scheduled.`);
console.log("Nothing has run yet — a schedule that exists is not a sweep that ran.");
console.log(`Check with: kubectl -n ${PAAS_NAMESPACE} get cronjobs,jobs`);
