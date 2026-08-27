/**
 * Make Cloudflare agree with paas.domains.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/domain-reconcile.ts [--apply]
 *
 * WHY THIS EXISTS. The DELETE route SOFT-removes a domain — it sets
 * state='removed' and returns "The edge configuration is removed by the
 * reconciler." That is the right design: tearing down inline means a Cloudflare
 * failure leaves a row already marked gone with nothing to retry it.
 *
 * There was no reconciler. The note described one that did not exist, so every
 * removed domain left a live custom hostname on the zone that nothing would
 * ever clean up — the same shape as v1's billing meters outliving their apps,
 * and found the same way: by removing one and then looking.
 *
 * IT TEARS DOWN, IT DOES NOT CREATE. Issuance belongs to the claim path, where
 * a customer is waiting and can be told what to add. A reconciler that also
 * issued would re-create a hostname somebody had just removed, racing the
 * person who removed it.
 *
 * ORPHANS ARE REPORTED, NEVER DELETED. A Cloudflare hostname with no row could
 * be a leak — or a row this sweep cannot see, a domain claimed by a lane that
 * does not write paas.domains, or a manual entry someone made deliberately.
 * "No row" is not proof it is unwanted, and deleting a customer's live custom
 * domain is not recoverable by re-running anything.
 *
 * EXIT CODES: 0 clean, 1 could not run, 10 found something.
 */

import { EXIT_CLEAN, EXIT_FINDINGS, EXIT_CANNOT_RUN } from "../../lib/paas/telemetry/exit-codes.ts";
import { db } from "../../lib/paas/db.ts";
import { listCustomHostnames, deleteCustomHostname } from "../../lib/paas/edge/cloudflare.ts";

const APPLY = process.argv.includes("--apply");
const line = () => console.log("─".repeat(96));

interface DomainRow {
  ref: string;
  domain: string;
  state: string;
  cf_hostname_id: string | null;
}

async function main(): Promise<void> {
  let rows: DomainRow[];
  try {
    rows = await db.select<DomainRow>("domains", "select=ref,domain,state,cf_hostname_id");
  } catch (e) {
    console.error(`control plane unreadable — reconciled nothing: ${(e as Error).message.slice(0, 200)}`);
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }

  let hostnames;
  try {
    hostnames = await listCustomHostnames();
  } catch (e) {
    // Cloudflare unreadable is NOT "no hostnames exist". Treating it as an
    // empty edge would make every claimed domain look orphaned and, if this
    // ever gained the power to create, would re-issue all of them.
    console.error(`Cloudflare unreadable — reconciled nothing: ${(e as Error).message.slice(0, 200)}`);
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }

  const byId = new Map(hostnames.map((h) => [h.id, h]));
  const knownIds = new Set(rows.map((r) => r.cf_hostname_id).filter(Boolean) as string[]);

  console.log(`\nDomain reconcile — ${rows.length} row(s), ${hostnames.length} custom hostname(s)  ${APPLY ? "APPLYING" : "DRY RUN"}`);
  line();

  // Rows the customer removed whose edge configuration is still live.
  const toTearDown = rows.filter((r) => r.state === "removed" && r.cf_hostname_id && byId.has(r.cf_hostname_id));
  // Removed rows whose hostname is already gone — nothing to do, and worth
  // counting so "0 to tear down" is distinguishable from "nothing examined".
  const alreadyGone = rows.filter((r) => r.state === "removed" && (!r.cf_hostname_id || !byId.has(r.cf_hostname_id!)));
  const orphans = hostnames.filter((h) => !knownIds.has(h.id));

  const failures: string[] = [];
  for (const r of toTearDown) {
    console.log(`  ${APPLY ? "removing " : "would remove"}  ${r.domain.padEnd(34)} ${r.ref}`);
    if (!APPLY) continue;
    try {
      await deleteCustomHostname(r.cf_hostname_id!);
      // Cleared only AFTER Cloudflare confirms. Clearing first would make a
      // failed delete look finished and strand the hostname permanently, which
      // is the exact bug this sweep exists to fix.
      await db.update("domains", `ref=eq.${r.ref}`, { cf_hostname_id: null });
    } catch (e) {
      failures.push(`${r.domain}: ${(e as Error).message.slice(0, 140)}`);
    }
  }

  if (alreadyGone.length) {
    console.log(`\n  ${alreadyGone.length} removed row(s) with no live hostname — nothing to do.`);
  }

  if (orphans.length) {
    console.log(`\n  ${orphans.length} custom hostname(s) with NO paas.domains row:`);
    for (const h of orphans) console.log(`    ${h.hostname.padEnd(34)} ${h.id.slice(0, 8)}  ${h.status}`);
    console.log(`  REPORTED, NOT DELETED. A missing row is not proof the hostname is unwanted,`);
    console.log(`  and deleting a customer's live custom domain cannot be undone by re-running.`);
  }

  console.log();
  line();
  console.log(
    `  ${APPLY ? toTearDown.length - failures.length : 0} torn down, ` +
      `${APPLY ? 0 : toTearDown.length} pending, ${orphans.length} orphan(s) reported.`,
  );

  if (failures.length) {
    console.log(`\n  ${failures.length} failed — the row keeps its cf_hostname_id and will retry:`);
    for (const f of failures) console.log(`    ${f}`);
  }

  if (!APPLY && toTearDown.length) {
    console.log(`\n  DRY RUN — nothing removed. Re-run with --apply.`);
  }

  process.exitCode = failures.length || orphans.length || (!APPLY && toTearDown.length) ? EXIT_FINDINGS : EXIT_CLEAN;
}

await main();
