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

const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const APPLY = process.argv.includes("--apply");
const NOW = new Date();
const PERIOD = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate(), NOW.getUTCHours()));

type Verdict = "charged" | "already-charged" | "insufficient" | "no-payer" | "invalid-amount";

interface Billed {
  project: string;
  tier: string;
  instances: number;
  amount: number;
  verdict: Verdict | "would-charge";
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
      billed.push({ project: p.ref, tier: tierId, instances, amount, verdict: "would-charge" });
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
      billed.push({ project: p.ref, tier: tierId, instances, amount, verdict });
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
    for (const b of insufficient) console.log(`    ${b.project}  needed $${b.amount.toFixed(6)}`);
    console.log(`  Not suspended here. Stopping a customer's app is a decision with a person`);
    console.log(`  behind it, and a metering sweep is the wrong place to make it.`);
  }

  if (!APPLY) {
    console.log(`\n  DRY RUN — nothing was charged. Re-run with --apply.`);
  }

  process.exitCode = noPayer.length ? EXIT_URGENT : insufficient.length || problems.length ? EXIT_FINDINGS : EXIT_CLEAN;
}

await main();
