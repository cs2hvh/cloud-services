/**
 * Bill every running v2 app for the current hour.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/meter-apps.ts [--apply]
 *
 * This is the sweep that makes `paas.charge_project_hour` actually happen.
 * Without it the function exists and nothing calls it, which is the same as not
 * having it — every project ran free while usage_samples quietly collected.
 *
 * WHAT IS BILLED: a project with a POD RUNNING RIGHT NOW, at its tier's hourly
 * rate times its instance count. A project scaled to zero is not billed, and
 * that is the product promise rather than an oversight — "idle resources cost
 * you nothing" is on the pricing page.
 *
 * WHICH HOUR: the one currently in progress, keyed on its start. That is
 * pay-as-you-go from the moment the resource exists, which is what Linode and
 * DigitalOcean do and what "billed by the hour" is taken to mean. An app that
 * starts at 10:59 pays for the 10:00 hour; the alternative — billing only
 * completed hours — lets a workload that starts and stops inside every hour run
 * forever for free.
 *
 * A CLUSTER WE CANNOT READ IS NOT AN EMPTY CLUSTER, and here that distinction
 * decides whether a customer is charged for something nobody verified. If the
 * pod list cannot be fetched this sweep BILLS NOTHING and says so.
 *
 * The asymmetry is what settles it. Under-billing is recoverable: the charge is
 * keyed on (project, hour), so a later run charges the hour that was missed and
 * the unique constraint stops it happening twice. Over-billing is not
 * recoverable — it is money taken for something we could not show was running,
 * and it is found by a customer rather than by us.
 *
 * EXIT CODES: 0 clean, 1 could not run, 10 found something, 11 urgent.
 */

import { EXIT_CLEAN, EXIT_FINDINGS, EXIT_URGENT, EXIT_CANNOT_RUN } from "../../lib/paas/telemetry/exit-codes.ts";
import { db, projects, deployments, type ProjectRow } from "../../lib/paas/db.ts";
import { loadKubeconfig, kube } from "../../lib/paas/k8s/client.ts";
import { requireTier, hourlyRateUsd, clampInstances } from "../../lib/paas/tiers.ts";
import { assessArrears, shouldSuspend, GRACE_HOURS, type ArrearsVerdict } from "../../lib/paas/arrears.ts";

const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const APPLY = process.argv.includes("--apply");
const NOW = new Date();
const PERIOD = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate(), NOW.getUTCHours()));

type Verdict = "charged" | "already-charged" | "insufficient" | "no-payer" | "invalid-amount";

interface Billed {
  project: string;
  projectId: string;
  tier: string;
  instances: number;
  amount: number;
  verdict: Verdict | "would-charge";
  arrears: ArrearsVerdict;
}

const line = () => console.log("─".repeat(96));

async function main(): Promise<void> {
  let all: ProjectRow[];
  try {
    all = await projects.list();
  } catch (e) {
    console.error(`control plane unreadable — billed nothing: ${(e as Error).message.slice(0, 200)}`);
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }

  // Running pods, by deployment ref. NULL on a failed read — never an empty
  // list, which would silently mean "nothing is running, bill nobody" and hand
  // out free compute for the duration of an outage.
  let running: Set<string> | null = null;
  try {
    const k = kube(loadKubeconfig(KUBECONFIG));
    if (await k.healthz()) {
      const pods = await k.get<{ items?: Array<{ metadata?: { name?: string }; status?: { phase?: string } }> }>(
        "/api/v1/pods",
        true,
      );
      running = new Set(
        (pods?.items ?? [])
          .filter((p) => p.status?.phase === "Running")
          .map((p) => p.metadata?.name ?? "")
          .filter(Boolean),
      );
    }
  } catch {
    running = null;
  }

  console.log(`\nMetering — hour beginning ${PERIOD.toISOString()}  ${APPLY ? "APPLYING" : "DRY RUN"}`);
  line();

  if (running === null) {
    console.error(`  CLUSTER UNREADABLE — billed nothing.`);
    console.error(`  An unreadable cluster is not an empty one. Charging here would take money`);
    console.error(`  for work nobody verified; skipping is recoverable, because the hour is`);
    console.error(`  keyed and a later run will charge it exactly once.`);
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }

  const billed: Billed[] = [];
  const idle: string[] = [];
  const problems: string[] = [];

  for (const p of all) {
    let ready;
    try {
      ready = await deployments.readyForProject(p.id);
    } catch (e) {
      problems.push(`${p.ref}: could not read deployments (${(e as Error).message.slice(0, 80)})`);
      continue;
    }

    const live = ready.some((d) => [...running!].some((n) => n.startsWith(`${d.ref}-`)));
    if (!live) {
      idle.push(p.ref);
      continue;
    }

    let amount: number;
    let tierId: string;
    let instances: number;
    try {
      const tier = requireTier(p.tier);
      tierId = tier.id;
      instances = clampInstances(p.instance_count ?? 1);
      amount = hourlyRateUsd(tier, instances);
    } catch (e) {
      // An unknown tier must NOT fall back to the cheapest — that bills a Pro
      // Plus customer at Starter rates and the difference is never noticed.
      problems.push(`${p.ref}: cannot price (${(e as Error).message.slice(0, 100)})`);
      continue;
    }

    if (!APPLY) {
      billed.push({
        project: p.ref, projectId: p.id, tier: tierId, instances, amount,
        verdict: "would-charge",
        arrears: assessArrears(p.arrears_since, NOW),
      });
      continue;
    }

    try {
      const verdict = (await db.rpc<Verdict>("charge_project_hour", {
        p_project_id: p.id,
        p_period_start: PERIOD.toISOString(),
        p_amount: amount,
        p_tier: tierId,
        p_instances: instances,
      })) as unknown as Verdict;
      // MARK ARREARS ON FAILURE, in its own statement. The charge function
      // rolls its own exception block back, so a write inside it would vanish —
      // and without a start time the grace window can never begin, which means
      // an unpaid app is never overdue no matter how long it runs.
      //
      // mark_arrears is once-only by construction (`is null` in its WHERE), so
      // calling it every hour cannot restart the clock.
      if (verdict === "insufficient") {
        try {
          await db.rpc("mark_arrears", { p_project_id: p.id, p_at: NOW.toISOString() });
        } catch (e) {
          problems.push(`${p.ref}: could not record arrears (${(e as Error).message.slice(0, 80)})`);
        }
      }

      // Re-read rather than reuse the row: charge_project_hour CLEARS arrears on
      // success, and mark_arrears may have just set them. The row fetched before
      // the charge is stale in both directions.
      let arrearsSince = p.arrears_since;
      try {
        const fresh = await projects.byRef(p.ref);
        arrearsSince = fresh?.arrears_since ?? null;
      } catch {
        // Keep the pre-charge value rather than inventing one.
      }

      billed.push({
        project: p.ref, projectId: p.id, tier: tierId, instances, amount, verdict,
        arrears: assessArrears(arrearsSince, NOW),
      });
    } catch (e) {
      problems.push(`${p.ref}: charge failed (${(e as Error).message.slice(0, 120)})`);
    }
  }

  for (const b of billed) {
    console.log(
      `  ${String(b.verdict).padEnd(16)} ${b.project.padEnd(20)} ${b.tier.padEnd(10)} x${b.instances}  $${b.amount.toFixed(6)}`,
    );
  }
  if (idle.length) {
    console.log(`\n  ${idle.length} project(s) not running — not billed, which is the promise:`);
    console.log(`    ${idle.join(", ")}`);
  }

  const insufficient = billed.filter((b) => b.verdict === "insufficient");
  const noPayer = billed.filter((b) => b.verdict === "no-payer");
  const charged = billed.filter((b) => b.verdict === "charged");
  const total = charged.reduce((s, b) => s + b.amount, 0);

  console.log();
  line();
  console.log(
    `  ${charged.length} charged, ${billed.filter((b) => b.verdict === "already-charged").length} already, ` +
      `${insufficient.length} out of credit, ${idle.length} idle.  $${total.toFixed(6)} this hour.`,
  );

  if (problems.length) {
    console.log(`\n  ${problems.length} problem(s):`);
    for (const p of problems) console.log(`    ${p}`);
  }

  if (noPayer.length) {
    // An app nobody can be billed for is running at our expense indefinitely.
    console.log(`\n  ${noPayer.length} project(s) with NO PAYER — running at our cost:`);
    for (const b of noPayer) console.log(`    ${b.project}`);
  }

  if (insufficient.length) {
    console.log(`\n  ${insufficient.length} project(s) OUT OF CREDIT and still running:`);
    for (const b of insufficient) {
      console.log(`    ${b.project.padEnd(20)} needed $${b.amount.toFixed(6)}  ${b.arrears.reason}`);
    }
  }

  // WHO IS PAST GRACE, reported separately from "out of credit" because they are
  // different facts: failing this hour is a payment hiccup, failing for three
  // days is an app nobody is paying for. Collapsing them would put a customer
  // whose card expired an hour ago in the same list as one who left.
  const overdue = billed.filter((x) => shouldSuspend(x.arrears));
  const unknownArrears = billed.filter((x) => x.arrears.state === "unknown");

  if (overdue.length) {
    console.log(`\n  ${overdue.length} project(s) PAST THE ${GRACE_HOURS}h GRACE WINDOW:`);
    for (const b of overdue) console.log(`    ${b.project.padEnd(20)} ${b.arrears.reason}`);
    console.log(`  NOT SUSPENDED. Stopping a customer's app is destructive and public, and a`);
    console.log(`  metering sweep is the wrong place to decide it. When suspension does land it`);
    console.log(`  scales to zero and never deletes — a suspended app has to come back exactly`);
    console.log(`  as it was the moment the balance is topped up.`);
  }

  if (unknownArrears.length) {
    // Surfaced rather than silently skipped. These are never suspended, which is
    // right, but a growing count here means something is corrupting the column
    // and the silence would be the only symptom.
    console.log(`\n  ${unknownArrears.length} project(s) with an UNREADABLE arrears timestamp — never suspended:`);
    for (const b of unknownArrears) console.log(`    ${b.project.padEnd(20)} ${b.arrears.reason}`);
  }

  if (!APPLY) {
    console.log(`\n  DRY RUN — nothing was charged. Re-run with --apply.`);
  }

  process.exitCode = noPayer.length
    ? EXIT_URGENT
    : overdue.length || insufficient.length || problems.length || unknownArrears.length
      ? EXIT_FINDINGS
      : EXIT_CLEAN;
}

await main();
