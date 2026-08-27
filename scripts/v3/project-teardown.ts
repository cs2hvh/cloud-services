/**
 * Tear down projects the customer deleted.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v3/project-teardown.ts [--apply]
 *
 * DELETE /api/v2/projects/{ref} soft-deletes and says:
 *
 *   "Running infrastructure is removed by the reconciler, not by this call."
 *
 * There was no such reconciler, and the way it failed is worse than it sounds.
 * `reconcileAll` iterates `projects.list()`, which filters `deleted_at=is.null`
 * — so a deleted project does not merely go un-torn-down, it becomes INVISIBLE
 * to the loop that would have done it. Its pods keep running, its Ingress keeps
 * routing, its DNS keeps resolving, and once metering is switched on its owner
 * keeps being charged for an app they deleted.
 *
 * That is v1's defect exactly: $543.17 billed across three users for apps that
 * no longer existed, because a delete removed the app row and left everything
 * else behind. The v2 route was written to avoid it — it deliberately does NOT
 * claim the infrastructure is gone — and then nothing finished the job.
 *
 * IDEMPOTENT BY CONSTRUCTION, so no "torn down" flag is needed. Every run
 * ensures the same end state: zero replicas, no Ingress, no DNS record. Running
 * it twice changes nothing the second time, which means a missed run is
 * self-healing rather than permanent.
 *
 * THE ROWS ARE KEPT. Deployments and aliases explain what a tenant was charged
 * for, and paas.project_charges references the project. Deleting the history to
 * tidy up the infrastructure would destroy the only record of why someone owes
 * what they owe.
 *
 * EXIT CODES: 0 clean, 1 could not run, 10 found something.
 */

import { EXIT_CLEAN, EXIT_FINDINGS, EXIT_CANNOT_RUN } from "../../lib/paas/telemetry/exit-codes.ts";
import { db, deployments, aliases, type ProjectRow } from "../../lib/paas/db.ts";
import { kube, loadKubeconfig } from "../../lib/paas/k8s/client.ts";
import { listDnsRecords, deleteDnsRecord } from "../../lib/paas/edge/cloudflare.ts";

const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
const APPLY = process.argv.includes("--apply");
const line = () => console.log("─".repeat(96));

interface Action {
  project: string;
  kind: "scale-down" | "remove-ingress" | "remove-dns" | "noop";
  target: string;
  detail: string;
}

async function main(): Promise<void> {
  let deleted: ProjectRow[];
  try {
    // The one query that must NOT filter deleted_at — these are precisely the
    // rows every other caller is right to hide.
    deleted = await db.select<ProjectRow>("projects", "select=*&deleted_at=not.is.null&order=deleted_at");
  } catch (e) {
    console.error(`control plane unreadable — tore down nothing: ${(e as Error).message.slice(0, 200)}`);
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }

  console.log(`\nProject teardown — ${deleted.length} deleted project(s)  ${APPLY ? "APPLYING" : "DRY RUN"}`);
  line();

  if (!deleted.length) {
    console.log(`  Nothing deleted. Examined every project with deleted_at set — none exist.`);
    console.log(`  That is a real answer, not an empty read: the query asks for deleted rows`);
    console.log(`  specifically rather than filtering them out like every other caller does.`);
    return;
  }

  let k;
  try {
    k = kube(loadKubeconfig(KUBECONFIG));
    if (!(await k.healthz())) throw new Error("cluster health check failed");
  } catch (e) {
    // Refuse the whole run. Half a teardown leaves a customer's app partly up
    // and partly gone, and the half that is up is the half still costing money.
    console.error(`  cluster unreadable — tore down nothing: ${(e as Error).message.slice(0, 160)}`);
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }

  const actions: Action[] = [];
  const failures: string[] = [];

  for (const p of deleted) {
    const ns = `app-${p.ref}`;

    // 1. Scale every deployment to zero. This is where the money stops.
    try {
      const deps = await k.get<{ items?: Array<{ metadata?: { name?: string }; spec?: { replicas?: number } }> }>(
        `/apis/apps/v1/namespaces/${ns}/deployments`,
        true,
      );
      for (const d of deps?.items ?? []) {
        const name = d.metadata?.name;
        const replicas = d.spec?.replicas ?? 0;
        if (!name || replicas === 0) continue;
        actions.push({ project: p.ref, kind: "scale-down", target: name, detail: `${replicas} -> 0` });
        if (APPLY) {
          await k.raw({
            method: "PATCH",
            path: `/apis/apps/v1/namespaces/${ns}/deployments/${name}/scale`,
            body: { spec: { replicas: 0 } },
            contentType: "application/merge-patch+json",
          });
        }
      }
    } catch (e) {
      failures.push(`${p.ref}: scale-down failed (${(e as Error).message.slice(0, 100)})`);
    }

    // 2. Remove the routes. Only ours, by owner label — the same three gates the
    //    reconciler's route collector uses.
    try {
      const ing = await k.get<{ items?: Array<{ metadata?: { name?: string; labels?: Record<string, string> } }> }>(
        `/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses?labelSelector=${encodeURIComponent("app.kubernetes.io/managed-by=ahura-paas")}`,
        true,
      );
      for (const i of ing?.items ?? []) {
        const name = i.metadata?.name;
        if (!name) continue;
        actions.push({ project: p.ref, kind: "remove-ingress", target: name, detail: "route removed" });
        if (APPLY) {
          await k.raw({ method: "DELETE", path: `/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses/${name}` });
        }
      }
    } catch (e) {
      failures.push(`${p.ref}: ingress removal failed (${(e as Error).message.slice(0, 100)})`);
    }

    // 3. Remove DNS for this project's own hostnames.
    //
    //    Driven by paas.aliases rather than by guessing the label, because a
    //    project can hold hostnames that do not follow the default pattern —
    //    and a guessed name is how a delete removes somebody else's record.
    try {
      const rows = await aliases.forProject(p.id);
      for (const a of rows) {
        const recs = (await listDnsRecords(a.hostname)).filter((r) => r.name === a.hostname);
        for (const r of recs) {
          actions.push({ project: p.ref, kind: "remove-dns", target: a.hostname, detail: r.content });
          if (APPLY) await deleteDnsRecord(r.id);
        }
      }
    } catch (e) {
      failures.push(`${p.ref}: DNS removal failed (${(e as Error).message.slice(0, 100)})`);
    }

    if (!actions.some((a) => a.project === p.ref)) {
      actions.push({ project: p.ref, kind: "noop", target: p.ref, detail: "already torn down" });
    }
  }

  for (const a of actions) {
    console.log(`  ${a.kind.padEnd(15)} ${a.project.padEnd(20)} ${a.target.padEnd(34)} ${a.detail}`);
  }

  const real = actions.filter((a) => a.kind !== "noop");
  console.log();
  line();
  console.log(
    `  ${deleted.length} deleted project(s), ${real.length} action(s) ${APPLY ? "applied" : "pending"}, ` +
      `${actions.length - real.length} already clean.`,
  );

  // Deliberately NOT reported as "deleted". The rows stay — deployments and
  // aliases explain what the tenant was charged for, and project_charges
  // references the project.
  console.log(`  Database rows are KEPT. Build history is what explains a bill.`);

  if (failures.length) {
    console.log(`\n  ${failures.length} failure(s) — the project stays deleted and will be retried:`);
    for (const f of failures) console.log(`    ${f}`);
  }

  if (!APPLY && real.length) console.log(`\n  DRY RUN — nothing changed. Re-run with --apply.`);

  process.exitCode = failures.length || (!APPLY && real.length) ? EXIT_FINDINGS : EXIT_CLEAN;
}

await main();
