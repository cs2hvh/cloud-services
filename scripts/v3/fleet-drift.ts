/**
 * Report drift between what Linode is billing for and what the control plane
 * recorded, in both directions, with the cost of each.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/fleet-drift.ts
 *   node --env-file=.env --env-file=.env.local scripts/v3/fleet-drift.ts --json
 *
 * Exits 0 when nothing needs a human, 1 when something does. That makes it
 * safe to run from cron and have silence mean silence — which is the whole
 * point, because the failure this catches announced itself to nobody.
 *
 * READ-ONLY. It never creates, modifies or destroys anything. Reaping stays
 * with `scripts/v2/teardown.ts --apply`, run by a person who read this first.
 *
 * The classification logic lives in lib/paas/telemetry/reconcile.ts and is
 * unit-tested without credentials:
 *
 *   node --test lib/paas/telemetry/reconcile.test.ts
 */

import { MONTH_HOURS, reconcile, type Finding } from "../../lib/paas/telemetry/reconcile.ts";
import {
  assertControlPlaneReachable,
  loadCloudInventory,
  loadControlPlane,
} from "../../lib/paas/telemetry/fleet-source.ts";

const JSON_OUT = process.argv.includes("--json");
const V2_TAG = "ahura-v2";
const BUILD_TAG = "ahura-v2-build";

const money = (n: number | null, places = 4) => (n === null ? "unknown" : `$${n.toFixed(places)}`);

function line(width = 92) {
  return "─".repeat(width);
}

/**
 * One line per finding. Cost first after the status, because the question
 * anyone opens this to answer is "what is this costing me".
 */
function renderFinding(f: Finding): string {
  const cost = f.hourly === null ? "  unknown/hr" : `${money(f.hourly).padStart(11)}/hr`;
  const id = f.cloudId === null ? "—" : String(f.cloudId);
  const ref = f.ref ?? "—";
  return (
    `  ${f.status.toUpperCase().padEnd(11)} ${cost}  ${f.kind.padEnd(14)} ` +
    `${f.label.padEnd(28)} ${id.padEnd(9)} ${ref}\n` +
    `              ${f.detail}` +
    (f.action ? `\n              → ${f.action}` : "")
  );
}

await assertControlPlaneReachable();

const [cloud, plane] = await Promise.all([loadCloudInventory(), loadControlPlane()]);

const report = reconcile({
  lkeClusters: cloud.lkeClusters,
  instances: cloud.instances,
  nodeBalancers: cloud.nodeBalancers,
  clusterRows: plane.clusterRows,
  buildVmRows: plane.buildVmRows,
  pricing: cloud.pricing,
  now: new Date(),
  v2Tag: V2_TAG,
  buildTag: BUILD_TAG,
});

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        ...report,
        monthly: {
          // Only standing spend is projected. Build VMs are per-hour only —
          // see `transientHourly` in reconcile.ts.
          standing: report.standingHourly * MONTH_HOURS,
          foreign: report.foreignHourly * MONTH_HOURS,
        },
        observed: {
          lkeClusters: cloud.lkeClusters.length,
          instances: cloud.instances.length,
          nodeBalancers: cloud.nodeBalancers.length,
          clusterRows: plane.clusterRows.length,
          buildVmRows: plane.buildVmRows.length,
          nodeBalancerPriceIsFallback: cloud.nodeBalancerPriceIsFallback,
        },
      },
      null,
      2,
    ),
  );
  process.exit(report.clean ? 0 : 1);
}

console.log(`\nFleet drift — Linode reality vs paas.clusters / paas.build_vms`);
console.log(line());
console.log(
  `  Linode:        ${cloud.lkeClusters.length} LKE cluster(s), ` +
    `${cloud.instances.length} instance(s), ${cloud.nodeBalancers.length} nodebalancer(s)`,
);
console.log(
  `  Control plane: ${plane.clusterRows.length} cluster row(s), ` +
    `${plane.buildVmRows.length} build VM row(s)`,
);
console.log(line());

if (report.findings.length === 0) {
  console.log("  Nothing on either side. No infrastructure, no records.");
} else {
  for (const f of report.findings) console.log(renderFinding(f));
}

console.log(line());
console.log(
  `  standing        ${money(report.standingHourly)}/hr   ` +
    `${money(report.standingHourly * MONTH_HOURS, 2)}/month   (clusters, nodes, nodebalancers)`,
);
if (report.transientHourly > 0) {
  console.log(
    `  transient       ${money(report.transientHourly)}/hr   ` +
      `${"".padStart(11)}   (build VMs — live for minutes; deliberately not projected)`,
  );
}
console.log(
  `  UNACCOUNTED     ${money(report.unaccountedHourly)}/hr   ` +
    (report.unaccountedHourly > 0
      ? `${money(report.unaccountedHourly * MONTH_HOURS, 2)}/mo if it runs   ` +
        `← billed, and no row admits it exists`
      : ""),
);
if (report.foreignHourly > 0) {
  console.log(
    `  not ours        ${money(report.foreignHourly)}/hr   ` +
      `${money(report.foreignHourly * MONTH_HOURS, 2)}/month   (listed, untouched)`,
  );
}

if (report.unpriced.length) {
  console.log(
    `\n  ${report.unpriced.length} resource(s) had no price in /linode/types, so the ` +
      `totals above are UNDERSTATED:`,
  );
  for (const u of report.unpriced) console.log(`    - ${u}`);
}

if (cloud.nodeBalancerPriceIsFallback) {
  console.log(
    `\n  NodeBalancers priced at the published $0.015/hr — /nodebalancers/types was ` +
      `not available on this API.`,
  );
}

console.log(
  report.clean
    ? `\n  CLEAN — every resource has a record, and every record has a resource.\n`
    : `\n  ${report.findings.filter((f) => f.actionable).length} finding(s) need a human. ` +
        `This script only reports; nothing has been changed.\n`,
);

/**
 * --prove answers the question that matters about anything that reports CLEAN:
 * is it actually checking, or is it always green?
 *
 * A reconciler that silently stops detecting is worse than none, because it
 * converts an unmonitored system into one everybody believes is monitored.
 * This re-runs the SAME live cloud inventory against blanked control-plane
 * tables — the exact state this morning — and shows what it would have said.
 * Nothing is written; the second run only discards rows that were already
 * fetched into memory.
 */
if (process.argv.includes("--prove")) {
  const asIfUnrecorded = reconcile({
    lkeClusters: cloud.lkeClusters,
    instances: cloud.instances,
    nodeBalancers: cloud.nodeBalancers,
    clusterRows: [],
    buildVmRows: [],
    pricing: cloud.pricing,
    now: new Date(),
    v2Tag: V2_TAG,
    buildTag: BUILD_TAG,
  });

  console.log(`  Self-check — the same live infrastructure, with the tables empty:`);
  console.log(line());
  for (const f of asIfUnrecorded.findings) console.log(renderFinding(f));
  console.log(line());
  console.log(
    `  would report   ${money(asIfUnrecorded.unaccountedHourly)}/hr   ` +
      `${money(asIfUnrecorded.standingHourly * MONTH_HOURS, 2)}/month unaccounted`,
  );
  console.log(
    asIfUnrecorded.clean
      ? `\n  SELF-CHECK FAILED — blanking both tables produced no findings. The ` +
          `reconciler is not detecting anything, and its CLEAN above means nothing.\n`
      : `\n  Self-check passed. The CLEAN above is a real result, not an empty one.\n`,
  );

  // A reconciler that cannot detect drift is itself the defect, regardless of
  // what the live report said.
  if (asIfUnrecorded.clean) process.exit(2);
}

process.exit(report.clean ? 0 : 1);
