/**
 * The deployment reconciler.
 *
 * Postgres is the desired state; Kubernetes is converged to match it. Nothing
 * here issues an imperative "deploy" — it reads what should be true and makes
 * it so, which means running it twice is a no-op and running it after a partial
 * failure repairs rather than duplicates.
 *
 * v1 had no such loop. It fired imperative commands at the cluster from request
 * handlers and from Jenkins pipelines, with two racing finalizers writing
 * different results for the same build; whichever landed second silently
 * discarded the other's health verification.
 *
 * THREE INVARIANTS IT ENFORCES
 *
 * 1. The Service selector matches the alias's deployment. Promotion and
 *    rollback are one UPDATE of `aliases.deployment_id`; this loop is what
 *    turns that row change into traffic actually moving. No rebuild, no retag.
 *
 * 2. The alias target runs; everything superseded scales to ZERO. Without this
 *    every deploy leaves the previous Deployment running at full replicas —
 *    observed live, and it silently doubles cost per deploy. The objects are
 *    kept, not deleted, because that is what makes rollback a scale-up rather
 *    than a rebuild.
 *
 * 3. Ingress exists for every alias hostname. A hostname in the database that
 *    routes nowhere is a lie the control plane is telling.
 */

import { kube, type KubeContext } from "./k8s/client.ts";
import {
  appDeployment,
  appService,
  tenantNetworkPolicy,
  namespaceManifest,
  REGISTRY_PULL,
} from "./k8s/manifests.ts";
import { appIngress } from "./k8s/gateway.ts";
import { projects, deployments, aliases, type ProjectRow, type DeploymentRow, type AliasRow } from "./db.ts";

export interface ReconcileAction {
  kind: "create" | "scale-up" | "scale-down" | "repoint" | "route" | "noop" | "error";
  target: string;
  detail: string;
}

export interface ReconcileReport {
  project: string;
  actions: ReconcileAction[];
}

function tenantNamespace(project: ProjectRow): string {
  return `app-${project.ref}`;
}

/** Deployment objects are named for the deployment ref — immutable, never the display name. */
function k8sName(d: DeploymentRow): string {
  return d.ref;
}

async function currentReplicas(
  k: ReturnType<typeof kube>,
  ns: string,
  name: string,
): Promise<number | null> {
  const dep = await k.get<{ spec?: { replicas?: number } }>(
    `/apis/apps/v1/namespaces/${ns}/deployments/${name}`,
    true,
  );
  return dep ? (dep.spec?.replicas ?? 0) : null;
}

async function scale(
  k: ReturnType<typeof kube>,
  ns: string,
  name: string,
  replicas: number,
): Promise<void> {
  await k.raw({
    method: "PATCH",
    path: `/apis/apps/v1/namespaces/${ns}/deployments/${name}/scale`,
    body: { spec: { replicas } },
    contentType: "application/merge-patch+json",
  });
}

/**
 * Converge one project.
 *
 * `dryRun` reports what would change without touching the cluster, so the loop
 * can be inspected before it is trusted — this runs unattended and it moves
 * production traffic.
 */
export async function reconcileProject(
  ctx: KubeContext,
  project: ProjectRow,
  opts: { dryRun?: boolean; appDomain: string } = { appDomain: "ahurasense.com" },
): Promise<ReconcileReport> {
  const k = kube(ctx);
  const ns = tenantNamespace(project);
  const actions: ReconcileAction[] = [];
  const dry = opts.dryRun === true;

  const [projectAliases, ready] = await Promise.all([
    aliases.forProject(project.id),
    deployments.readyForProject(project.id),
  ]);

  if (!ready.length) {
    actions.push({ kind: "noop", target: project.ref, detail: "no ready deployment yet" });
    return { project: project.ref, actions };
  }

  const byId = new Map(ready.map((d) => [d.id, d]));

  // Every deployment any alias points at must be running. Everything else must
  // not be. Computing the set first means a deployment serving two aliases is
  // never scaled down by the second pass.
  const targeted = new Set<string>();
  for (const a of projectAliases) {
    if (a.deployment_id && byId.has(a.deployment_id)) targeted.add(a.deployment_id);
  }

  if (!targeted.size) {
    actions.push({
      kind: "noop",
      target: project.ref,
      detail: `${projectAliases.length} alias(es) but none point at a ready deployment`,
    });
    return { project: project.ref, actions };
  }

  if (!dry) {
    await k.apply(`/api/v1/namespaces/${ns}`, namespaceManifest(ns, { "ahura.cloud/project": project.ref }));
    await k.apply(
      `/apis/networking.k8s.io/v1/namespaces/${ns}/networkpolicies/tenant-isolation`,
      tenantNetworkPolicy(ns),
    );
  }

  // ── 1. every targeted deployment exists and runs ──────────────────────────
  for (const id of targeted) {
    const d = byId.get(id)!;
    const name = k8sName(d);
    if (!d.image_repo || !d.image_digest) {
      actions.push({ kind: "error", target: name, detail: "ready deployment has no image — refusing to run it" });
      continue;
    }

    // Digest-pinned, always. A tag can be moved beneath us; a digest cannot,
    // which is what makes rollback to an old deployment mean what it says.
    const image = `${REGISTRY_PULL}/${project.ref}@${d.image_digest}`;
    const replicas = await currentReplicas(k, ns, name);

    if (replicas === null) {
      actions.push({ kind: "create", target: name, detail: `creating from ${d.image_digest.slice(0, 19)}…` });
      if (!dry) {
        await k.apply(
          `/apis/apps/v1/namespaces/${ns}/deployments/${name}`,
          appDeployment({
            deploymentRef: d.ref,
            projectRef: project.ref,
            namespace: ns,
            image,
            port: 3000,
            replicas: 1,
          }),
        );
      }
    } else if (replicas === 0) {
      actions.push({ kind: "scale-up", target: name, detail: "alias points here; scaling 0 -> 1" });
      if (!dry) await scale(k, ns, name, 1);
    } else {
      actions.push({ kind: "noop", target: name, detail: `already running (${replicas})` });
    }
  }

  // ── 2. superseded deployments scale to zero ───────────────────────────────
  // Kept, not deleted: the object is what makes rollback a scale-up instead of
  // a rebuild. Deleting would make "instant rollback" a lie.
  for (const d of ready) {
    if (targeted.has(d.id)) continue;
    const name = k8sName(d);
    const replicas = await currentReplicas(k, ns, name);
    if (replicas === null || replicas === 0) continue;
    actions.push({
      kind: "scale-down",
      target: name,
      detail: `superseded; scaling ${replicas} -> 0 (kept for rollback)`,
    });
    if (!dry) await scale(k, ns, name, 0);
  }

  // ── 3. the Service points at the production alias's deployment ────────────
  const production = projectAliases.find((a) => a.kind === "production");
  if (production?.deployment_id && byId.has(production.deployment_id)) {
    const target = byId.get(production.deployment_id)!;
    const svc = await k.get<{ spec?: { selector?: Record<string, string> } }>(
      `/api/v1/namespaces/${ns}/services/${project.ref}`,
      true,
    );
    const currently = svc?.spec?.selector?.["ahura.cloud/deployment"];
    if (currently !== target.ref) {
      actions.push({
        kind: "repoint",
        target: project.ref,
        detail: `service selector ${currently ?? "(none)"} -> ${target.ref}`,
      });
      if (!dry) {
        await k.apply(
          `/api/v1/namespaces/${ns}/services/${project.ref}`,
          appService({ deploymentRef: target.ref, projectRef: project.ref, namespace: ns, port: 3000 }),
        );
      }
    }
  }

  // ── 4. every alias hostname routes ────────────────────────────────────────
  for (const a of projectAliases) {
    if (!a.deployment_id || !byId.has(a.deployment_id)) continue;
    const existing = await k.get(
      `/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses/${a.ref}`,
      true,
    );
    if (existing) continue;
    actions.push({ kind: "route", target: a.hostname, detail: `creating Ingress ${a.ref}` });
    if (!dry) {
      await k.apply(
        `/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses/${a.ref}`,
        appIngress({ aliasRef: a.ref, projectRef: project.ref, namespace: ns, hostname: a.hostname }),
      );
    }
  }

  return { project: project.ref, actions };
}

export async function reconcileAll(
  ctx: KubeContext,
  opts: { dryRun?: boolean; appDomain?: string } = {},
): Promise<ReconcileReport[]> {
  const all = await projects.list();
  const out: ReconcileReport[] = [];
  for (const p of all) {
    try {
      out.push(await reconcileProject(ctx, p, { dryRun: opts.dryRun, appDomain: opts.appDomain ?? "ahurasense.com" }));
    } catch (e) {
      // One broken project must not stop the loop for every other tenant.
      out.push({
        project: p.ref,
        actions: [{ kind: "error", target: p.ref, detail: (e as Error).message.slice(0, 200) }],
      });
    }
  }
  return out;
}

/**
 * Promote a deployment: point the production alias at it. That is the entire
 * operation — one row update. The reconciler does the rest.
 */
export async function promote(projectId: string, deploymentRef: string): Promise<AliasRow> {
  const d = await deployments.byRef(deploymentRef);
  if (!d) throw new Error(`deployment ${deploymentRef} not found`);
  if (d.state !== "ready") throw new Error(`deployment ${deploymentRef} is ${d.state}, not ready`);
  if (d.project_id !== projectId) throw new Error(`deployment ${deploymentRef} belongs to another project`);

  const alias = await aliases.production(projectId);
  if (!alias) throw new Error("project has no production alias");
  return aliases.point(alias.ref, d.id);
}
