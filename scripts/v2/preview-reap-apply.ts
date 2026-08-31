/**
 * Actually remove expired previews. The other half of `scripts/v3/preview-reap.ts`.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/preview-reap-apply.ts [--apply]
 *
 * WHY THIS IS A SEPARATE SCRIPT, AND NOT A CRONJOB
 *
 * The sweep reports; this deletes. Keeping them apart is the r2-reap precedent:
 * a classification that is wrong once is a bad report, and the same
 * classification wired to a timer is wrong every hour until somebody notices.
 * A preview reaper deletes RUNNING ENVIRONMENTS, so the licence to delete comes
 * from a person who has read the plan, not from the plan being computable.
 *
 * It refuses to act unless e6's `checkReapPlan` — which examines the plan from
 * outside, and can therefore catch the bug that makes the classifier classify
 * everything the same way — reports nothing. That check is not permission; it
 * is the floor below which a human should not even be asked.
 *
 * ORDER: DNS FIRST, THEN THE ALIAS ROW.
 *
 * Not arbitrary, and the reverse is dangerous. Deleting the alias first and then
 * failing on DNS leaves a record pointing at the gateway that no Ingress routes
 * — a CLAIMABLE hostname, which is exactly what `dns-drift` exists to catch and
 * what the next Ingress to name it can capture. Deleting DNS first and then
 * failing on the alias leaves an alias and Ingress that nothing resolves to:
 * invisible, harmless, and retried on the next run. Both halves can fail; only
 * one order makes the failure benign.
 *
 * The pod and the Ingress are not deleted here. Removing the alias row makes the
 * reconciler do both — it scales any deployment no alias points at to zero, and
 * collects routes whose alias is gone. One thing converges the cluster, and this
 * is not it.
 *
 * EXIT CODES: 0 clean, 1 could not run, 10 found something, 11 urgent.
 */

import { aliases, deployments, environments, projects, db } from "../../lib/paas/db.ts";
import { planReap, shouldReap, mayReap, PREVIEW_TTL_HOURS, type PreviewAlias } from "../../lib/paas/previews.ts";
import { indexPreviews } from "../../lib/paas/telemetry/preview-index.ts";
import { checkReapPlan } from "../../lib/paas/telemetry/reap-safety.ts";
import { listDnsRecords, deleteDnsRecord } from "../../lib/paas/edge/cloudflare.ts";
import { reconcileProject, kubeContextFromEnv } from "../../lib/paas/reconciler.ts";
import { kube } from "../../lib/paas/k8s/client.ts";

const APPLY = process.argv.includes("--apply");
const EXIT_CANNOT_RUN = 1;
const EXIT_FOUND = 10;
const EXIT_URGENT = 11;

const line = () => console.log("─".repeat(96));


async function main(): Promise<void> {
  if (!(await db.reachable())) {
    console.error("control plane unreachable — refusing to reap. Every preview would look unrecorded.");
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }

  const now = new Date();
  const allProjects = await projects.list();
  const k = kube(kubeContextFromEnv());

  // Pod presence, read once. NULL on a failed read, never false — collapsing
  // "could not ask the cluster" into "nothing is running" is what would let a
  // live preview be classified as an empty one.
  let livePods: Set<string> | null = null;
  try {
    const pods = await k.get<{ items?: Array<{ metadata?: { labels?: Record<string, string> } }> }>(
      "/api/v1/pods?labelSelector=" + encodeURIComponent("ahura.cloud/deployment"),
    );
    livePods = new Set(
      (pods?.items ?? []).map((p) => p.metadata?.labels?.["ahura.cloud/deployment"]).filter(Boolean) as string[],
    );
  } catch {
    livePods = null;
  }

  const envs: Array<Parameters<typeof indexPreviews>[0]["environments"][number]> = [];
  const deps: Array<Parameters<typeof indexPreviews>[0]["deployments"][number]> = [];
  const als: Array<Parameters<typeof indexPreviews>[0]["aliases"][number]> = [];
  const projectOf = new Map<string, (typeof allProjects)[number]>();

  for (const p of allProjects) {
    for (const e of await environments.forProject(p.id)) {
      if (e.kind !== "preview") continue;
      envs.push({ ref: e.ref, id: e.id, projectRef: p.ref, kind: e.kind, name: e.name, createdAt: e.created_at });
      projectOf.set(e.ref, p);
      for (const d of await deployments.forEnvironment(e.id)) {
        deps.push({ ref: d.ref, id: d.id, environmentId: d.environment_id, queuedAt: d.queued_at });
      }
    }
    for (const a of await aliases.forProject(p.id)) {
      als.push({ ref: a.ref, hostname: a.hostname, deploymentId: a.deployment_id });
    }
  }

  const index = indexPreviews({
    environments: envs,
    deployments: deps,
    aliases: als,
    hasPod: (deploymentRef) => (livePods === null ? null : livePods.has(deploymentRef)),
    now,
  });

  console.log(`\nPreview reaping — ${APPLY ? "APPLYING" : "DRY RUN"}, ${PREVIEW_TTL_HOURS}h TTL`);
  line();
  console.log(`  ${index.environments} preview environment(s): ${index.indexed.length} indexed, ${index.invisible.length} invisible.`);

  const urgent = index.invisible.filter((i) => i.urgent);
  if (urgent.length) {
    console.log();
    console.log(`  ${urgent.length} RUNNING preview(s) with no alias — no sweep reaches these, and they bill.`);
    for (const u of urgent) console.log(`    ${u.environmentRef}  ${u.name}  ${u.deployments} deployment(s)`);
    console.log(`  Not reaped here: they have no alias to remove, so removing them is a`);
    console.log(`  different operation and a person should choose it.`);
  }

  const candidates: PreviewAlias[] = index.indexed.map((i) => ({
    ref: i.aliasRef,
    hostname: i.hostname,
    projectRef: i.projectRef,
    lastPushAt: i.lastPushAt,
  }));

  const plan = planReap(candidates, now);
  // Ages come from shouldReap, the same parser planReap used — NOT recomputed
  // here. Passing ageHours: null would trip the safety check's own unknown-age
  // refusal, and a reaper that has to defeat its safety check to run is not one
  // anybody should trust.
  const safety = checkReapPlan(
    {
      examined: plan.examined,
      reap: plan.reap.map((a) => {
        const v = shouldReap(a, now);
        return { ref: a.ref, ageHours: v.ageHours, reason: v.reason };
      }),
      keep: plan.keep.map((kpt) => ({ ref: kpt.alias.ref, reason: kpt.reason })),
    },
    PREVIEW_TTL_HOURS,
  );

  console.log();
  console.log(`  examined ${plan.examined}, past TTL ${plan.reap.length}, kept ${plan.keep.length}`);

  if (!safety.safeToReview) {
    console.log();
    console.log("  PLAN REFUSED — not fit to act on:");
    for (const r of safety.refusals) console.log(`    ${r.kind}: ${r.detail}`);
    console.log();
    console.log("  Nothing was deleted. A plan that cannot be trusted to describe itself");
    console.log("  cannot be trusted to delete.");
    process.exitCode = EXIT_FOUND;
    return;
  }

  if (!plan.reap.length) {
    console.log();
    for (const kpt of plan.keep) console.log(`    keep ${kpt.alias.ref.padEnd(22)} ${kpt.reason}`);
    console.log();
    console.log("  Nothing is past its TTL.");
    if (urgent.length) process.exitCode = EXIT_URGENT;
    return;
  }

  line();
  console.log(`  ${APPLY ? "REAPING" : "WOULD REAP"} ${plan.reap.length}:`);

  const failures: string[] = [];
  const touchedProjects = new Set<string>();

  for (const a of plan.reap) {
    const p = allProjects.find((x) => x.ref === a.projectRef);
    console.log(`    ${a.hostname}  (alias ${a.ref})`);

    if (!APPLY) continue;

    // Never, under any circumstance, on anything that is not a branch alias.
    // The plan is built from preview environments so this should be impossible;
    // it is asserted anyway because the cost of the impossible happening is a
    // customer's production hostname.
    const row = (await aliases.forProject(p!.id)).find((x) => x.ref === a.ref);
    const gate = mayReap(row);
    if (!gate.ok) {
      failures.push(`${a.ref}: ${gate.reason} — refusing to delete`);
      continue;
    }

    // 1. DNS first. See the header: the reverse order leaves a claimable hostname.
    try {
      const recs = (await listDnsRecords(a.hostname)).filter((r) => r.name === a.hostname);
      for (const r of recs) await deleteDnsRecord(r.id);
      console.log(`      dns    ${recs.length} record(s) removed`);
    } catch (e) {
      // Stop on this preview rather than continuing to the alias. Deleting the
      // alias now is what creates the claimable hostname.
      failures.push(`${a.hostname}: DNS delete failed (${(e as Error).message.slice(0, 120)}) — alias left in place`);
      continue;
    }

    // 2. The alias row. The reconciler turns this into a removed Ingress and a
    //    deployment scaled to zero.
    try {
      await db.delete("aliases", `ref=eq.${a.ref}`);
      console.log(`      alias  ${a.ref} removed`);
      touchedProjects.add(p!.ref);
    } catch (e) {
      failures.push(`${a.ref}: alias delete failed (${(e as Error).message.slice(0, 120)})`);
    }
  }

  // 3. Converge, so the route stops routing and the pod stops running.
  if (APPLY && touchedProjects.size) {
    console.log();
    for (const ref of touchedProjects) {
      const p = allProjects.find((x) => x.ref === ref)!;
      const report = await reconcileProject(kubeContextFromEnv(), p, { appDomain: "" });
      for (const act of report.actions) {
        if (act.kind === "noop") continue;
        console.log(`      converge ${act.kind} ${act.target} — ${act.detail}`);
      }
    }
  }

  console.log();
  if (failures.length) {
    line();
    console.log("  INCOMPLETE — these were not reaped:");
    for (const f of failures) console.log(`    ${f}`);
    console.log();
    console.log("  Reported rather than retried. A reaper that retries its own failures");
    console.log("  silently is how a partial deletion becomes an invisible one.");
    process.exitCode = EXIT_FOUND;
    return;
  }

  console.log(APPLY ? `  Reaped ${plan.reap.length}.` : "  DRY RUN — nothing was deleted. Re-run with --apply.");
  if (urgent.length) process.exitCode = EXIT_URGENT;
}

await main();
