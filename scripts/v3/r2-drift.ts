/**
 * What the R2 bucket holds against what the control plane still needs.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/r2-drift.ts
 *   node --env-file=.env --env-file=.env.local scripts/v3/r2-drift.ts --json
 *
 * Nothing prunes this bucket. Every deployment ever made leaves an OCI tarball,
 * a build log and a metadata file, and no code path deletes any of them.
 *
 * REPORT-ONLY, and there is deliberately no --apply. Object deletion is the one
 * operation here with no undo: a mapping bug in a fleet reconciler costs a
 * confusing report, the same bug in a bucket reaper destroys the build logs of
 * every app on the platform. A person should read this, decide, and delete
 * deliberately.
 */

import { EXIT_CLEAN, EXIT_FINDINGS } from "../../lib/paas/telemetry/exit-codes.ts";
import { db } from "../../lib/paas/db.ts";
import { listObjects } from "../../lib/paas/build/r2.ts";
import {
  formatBytes,
  reconcileR2,
  type DeploymentLike,
  type R2Disposition,
} from "../../lib/paas/telemetry/r2-drift.ts";

const JSON_OUT = process.argv.includes("--json");

const [objects, deployments, projects] = await Promise.all([
  listObjects(""),
  db.select<DeploymentLike>("deployments", "select=ref,state,image_digest"),
  db.select<{ ref: string }>("projects", "select=ref"),
]);

const report = reconcileR2({
  objects,
  deployments,
  liveProjectRefs: projects.map((p) => p.ref),
});

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        ...report,
        observed: { objects: objects.length, deployments: deployments.length, projects: projects.length },
      },
      null,
      2,
    ),
  );
  process.exit(report.clean ? EXIT_CLEAN : EXIT_FINDINGS);
}

const line = "─".repeat(96);
console.log(`\nR2 objects vs paas.deployments`);
console.log(line);
console.log(
  `  ${objects.length} object(s), ${formatBytes(report.totalBytes)} total, ` +
    `~$${report.totalMonthlyUsd.toFixed(4)}/month storage`,
);
console.log(`  ${deployments.length} deployment row(s), ${projects.length} project(s)`);
console.log(line);

const order: R2Disposition[] = ["redundant", "orphan", "unknown", "in-flight", "retain"];
for (const d of order) {
  const bucket = report.byDisposition[d];
  if (bucket.objects === 0) continue;
  console.log(`  ${d.toUpperCase().padEnd(11)} ${String(bucket.objects).padStart(4)} object(s)  ${formatBytes(bucket.bytes).padStart(10)}`);
}

console.log(line);
const notable = report.findings.filter(
  (f) => f.disposition === "redundant" || f.disposition === "orphan" || f.disposition === "unknown",
);
for (const f of notable.slice(0, 40)) {
  console.log(`  ${f.disposition.toUpperCase().padEnd(11)} ${formatBytes(f.bytes).padStart(10)}  ${f.key}`);
  console.log(`              ${f.detail}`);
}
if (notable.length > 40) console.log(`  … and ${notable.length - 40} more`);

console.log(line);
console.log(
  `  RECLAIMABLE  ${formatBytes(report.reclaimableBytes)}  ` +
    `~$${report.reclaimableMonthlyUsd.toFixed(4)}/month  ` +
    `(${((report.reclaimableBytes / Math.max(1, report.totalBytes)) * 100).toFixed(0)}% of the bucket)`,
);
console.log(
  report.clean
    ? `  Nothing to reclaim.\n`
    : `\n  Report only. There is no --apply: deleting objects has no undo, and a\n` +
        `  mapping bug here destroys build logs rather than producing a bad report.\n`,
);

process.exit(report.clean ? EXIT_CLEAN : EXIT_FINDINGS);
