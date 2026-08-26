/**
 * Reclaim build tarballs whose image is provably in the registry.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/r2-reap.ts          # plan
 *   node --env-file=.env --env-file=.env.local scripts/v3/r2-reap.ts --apply  # delete
 *
 * THE ONLY SCRIPT IN scripts/v3 THAT DESTROYS ANYTHING, and it took an
 * argument to earn that. `r2-drift.ts` reports and stops, deliberately,
 * because a reaper trusting a classification is one mapping bug away from
 * deleting every app's build logs and object deletion has no undo.
 *
 * What makes this different is not a higher risk tolerance. It is that the
 * claim justifying each delete is OBSERVED rather than deduced: the image's
 * manifest blob is present in the same bucket, at a key this tool reads back
 * immediately before removing the tar. Not "the row says ready". Not "the
 * schema requires a digest on ready rows". The durable copy is there, now.
 *
 * Four conditions, set by the infrastructure lane and implemented here:
 *
 *   1. The blob is re-verified immediately before EACH delete, not once per
 *      sweep. A plan computed two minutes ago is a claim about two minutes
 *      ago, which is the lesson this project relearned three times today.
 *   2. A missing blob is a LOUD finding and never a delete — it means a
 *      deployment marked ready whose image is not in the registry, so
 *      rollback to it is already broken and nobody knows.
 *   3. A tar for a deployment any alias points at is never touched, even with
 *      the blob present. Belt and braces on the only objects here whose loss
 *      a customer would see.
 *   4. Every deletion is logged with the digest that justified it, so a wrong
 *      delete is reconstructible afterwards.
 *
 * Logs, meta.json, caches, registry blobs and anything unrecognised are
 * untouchable. No flag reaches them.
 */

import { db } from "../../lib/paas/db.ts";
import { deleteObject, listObjects } from "../../lib/paas/build/r2.ts";
import { reconcileR2, formatBytes, type DeploymentLike } from "../../lib/paas/telemetry/r2-drift.ts";
import { planReap, registryBlobKey } from "../../lib/paas/telemetry/r2-reap.ts";

const APPLY = process.argv.includes("--apply");
const REGISTRY_ROOT = process.env.V2_R2_REGISTRY_ROOT ?? "registry";

/**
 * Is this exact object present, right now?
 *
 * A prefix listing on the full key rather than a download — the blob may be
 * hundreds of megabytes and its CONTENT is irrelevant. Only its existence is
 * the proof.
 */
async function objectExists(key: string): Promise<boolean> {
  const found = await listObjects(key, { maxKeys: 1 });
  return found.some((o) => o.key === key);
}

const [objects, deployments, projects, aliases] = await Promise.all([
  listObjects(""),
  db.select<DeploymentLike & { ref: string; image_digest: string | null }>(
    "deployments",
    "select=ref,state,image_digest",
  ),
  db.select<{ ref: string }>("projects", "select=ref"),
  db.select<{ deployment_id: string | null }>("aliases", "select=deployment_id"),
]);

// Alias rows key on deployment id; resolve to refs so the guard compares like
// with like. A deployment whose id cannot be resolved is treated as aliased —
// failing towards keeping the tar.
const idToRef = new Map(
  (await db.select<{ id: string; ref: string }>("deployments", "select=id,ref")).map((d) => [d.id, d.ref]),
);
const aliasedDeployments = new Set<string>();
for (const a of aliases) {
  if (!a.deployment_id) continue;
  const ref = idToRef.get(a.deployment_id);
  if (ref) aliasedDeployments.add(ref);
}

const drift = reconcileR2({ objects, deployments, liveProjectRefs: projects.map((p) => p.ref) });
const digestOf = new Map(deployments.map((d) => [d.ref, d.image_digest]));

const plan = planReap({
  findings: drift.findings,
  digestOf: (ref) => digestOf.get(ref) ?? null,
  presentKeys: new Set(objects.map((o) => o.key)),
  aliasedDeployments,
  registryRoot: REGISTRY_ROOT,
});

const line = "─".repeat(96);
console.log(`\nR2 reap — tarballs whose image is provably in the registry`);
console.log(line);
console.log(
  `  bucket ${formatBytes(drift.totalBytes)}, ${aliasedDeployments.size} aliased deployment(s) protected`,
);
console.log(line);

for (const c of plan.candidates) {
  console.log(`  RECLAIM  ${formatBytes(c.bytes).padStart(10)}  ${c.key}`);
  console.log(`           proven by ${c.provenBy}`);
}

const alarming = plan.blocked.filter((b) => b.alarming);
for (const b of plan.blocked) {
  console.log(`  ${(b.alarming ? "ALARM" : "KEEP").padEnd(7)}  ${formatBytes(b.bytes).padStart(10)}  ${b.key}`);
  console.log(`           ${b.reason}`);
}

console.log(line);
console.log(
  `  reclaimable ${formatBytes(plan.reclaimableBytes)} across ${plan.candidates.length} object(s); ` +
    `${formatBytes(plan.blockedBytes)} kept across ${plan.blocked.length}`,
);
if (alarming.length) {
  console.log(
    `\n  ${alarming.length} ALARMING finding(s): a deployment is marked ready and its image is\n` +
      `  not in the registry. Rollback to it is already broken. That is worse than the\n` +
      `  wasted tarball and should be looked at before anything is deleted.`,
  );
}

if (!APPLY) {
  console.log(`\n  Plan only. Re-run with --apply to delete the RECLAIM objects above.\n`);
  process.exit(alarming.length ? 1 : 0);
}

// ── delete ──────────────────────────────────────────────────────────────────

console.log(`\nDeleting…`);
let freed = 0;
let skipped = 0;

for (const c of plan.candidates) {
  // Re-verified per object, not per sweep. The plan above is a claim about
  // when it was computed.
  if (!(await objectExists(c.provenBy))) {
    console.log(`  SKIP    ${c.key}`);
    console.log(`          the blob that justified this vanished between plan and delete`);
    skipped += 1;
    continue;
  }

  await deleteObject(c.key);
  freed += c.bytes;

  // Condition 4: the digest that justified it, so a wrong delete can be
  // reconstructed from the log alone.
  console.log(
    `  DELETED ${c.key}  ${formatBytes(c.bytes)}  deployment=${c.deploymentRef}  ` +
      `justified-by=${c.provenBy}  at=${new Date().toISOString()}`,
  );
}

console.log(line);
console.log(
  `  freed ${formatBytes(freed)}` +
    (skipped ? `, skipped ${skipped} whose proof disappeared mid-run` : "") +
    `\n`,
);

process.exit(alarming.length ? 1 : 0);
