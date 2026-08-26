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

import { kube, loadKubeconfig, type KubeContext } from "./k8s/client.ts";
import {
  appDeployment,
  appService,
  tenantNetworkPolicy,
  namespaceManifest,
  REGISTRY_PULL,
  envSecret,
  envSecretName,
} from "./k8s/manifests.ts";
import { ACTIVATOR_NAME, activatorAliasService } from "./k8s/activator.ts";
import { appIngress } from "./k8s/gateway.ts";
import { projects, deployments, aliases, envVars, type ProjectRow, type DeploymentRow, type AliasRow } from "./db.ts";
import { decryptEnvValue, pgHexToBytes } from "./secrets.ts";
import { createHash } from "node:crypto";

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

interface LiveDeployment {
  replicas: number;
  image: string | null;
  envSecret: string | null;
  envHash: string | null;
}

/**
 * Read enough of the live Deployment to tell whether applying would actually
 * change anything. Server-Side Apply does not report that, and a loop that
 * says "all converged" while quietly rewriting a spec is the same dishonest
 * reporting this project exists to stop.
 */
async function liveDeployment(
  k: ReturnType<typeof kube>,
  ns: string,
  name: string,
): Promise<LiveDeployment | null> {
  const dep = await k.get<{
    spec?: {
      replicas?: number;
      template?: {
        metadata?: { annotations?: Record<string, string> };
        spec?: { containers?: Array<{ image?: string; envFrom?: Array<{ secretRef?: { name?: string } }> }> };
      };
    };
  }>(`/apis/apps/v1/namespaces/${ns}/deployments/${name}`, true);
  if (!dep) return null;
  const c = dep.spec?.template?.spec?.containers?.[0];
  return {
    replicas: dep.spec?.replicas ?? 0,
    image: c?.image ?? null,
    envSecret: c?.envFrom?.[0]?.secretRef?.name ?? null,
    envHash: dep.spec?.template?.metadata?.annotations?.["ahura.cloud/env-hash"] ?? null,
  };
}

async function deploymentAnnotation(
  k: ReturnType<typeof kube>,
  ns: string,
  name: string,
  key: string,
): Promise<string | null> {
  const d = await k.get<{ metadata?: { annotations?: Record<string, string> } }>(
    `/apis/apps/v1/namespaces/${ns}/deployments/${name}`,
    true,
  );
  return d?.metadata?.annotations?.[key] ?? null;
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

    // Sync this deployment's runtime configuration before the pod that will
    // consume it. A pod starting against a Secret that does not exist yet
    // crash-loops on missing configuration and reads as an application bug.
    let envSecretRef: string | undefined;
    let envHash: string | undefined;
    try {
      const rows = await envVars.listForSync(project.id, d.environment_id);
      // PUBLIC-prefixed values are already baked into the image as build args.
      // Injecting them again at runtime would let a later edit silently
      // disagree with what the bundle already contains.
      const runtime = rows.filter((r) => !r.is_public);
      if (runtime.length) {
        const values: Record<string, string> = {};
        for (const row of runtime) {
          // Decryption throws on any failure and never substitutes a
          // placeholder. v1 returned raw ciphertext as the value here, which
          // was then written into the Secret and into the customer's .env
          // download — the app started with garbage and nothing said why.
          values[row.key] = decryptEnvValue(project.ref, row.key, pgHexToBytes(row.value_ct), row.dek_id);
        }
        // Hash the CONTENT, sorted so key order cannot make an identical
        // config look changed. This is what rolls the pods when a value edits.
        envHash = createHash("sha256")
          .update(Object.keys(values).sort().map((kk) => kk + "=" + values[kk]).join(String.fromCharCode(30)))
          .digest("hex")
          .slice(0, 16);
        envSecretRef = envSecretName(d.ref);
        if (!dry) {
          await k.apply(
            `/api/v1/namespaces/${ns}/secrets/${envSecretRef}`,
            envSecret({ deploymentRef: d.ref, projectRef: project.ref, namespace: ns, values }),
          );
        }
        actions.push({ kind: "noop", target: envSecretRef, detail: `${runtime.length} runtime var(s) synced` });
      }
    } catch (e) {
      // Refuse to run the pod rather than start it with configuration we could
      // not decrypt. A container running against missing secrets fails in ways
      // that look like application bugs and waste hours.
      actions.push({
        kind: "error",
        target: name,
        detail: `env sync failed, not starting: ${(e as Error).message.slice(0, 180)}`,
      });
      continue;
    }

    const live = await liveDeployment(k, ns, name);
    const replicas = live?.replicas ?? null;
    const specDrifted =
      live !== null &&
      (live.image !== image ||
        live.envSecret !== (envSecretRef ?? null) ||
        live.envHash !== (envHash ?? null));

    // ALWAYS apply the full spec, not only on first creation.
    //
    // The earlier version applied the manifest only when the Deployment did
    // not exist, so adding an env var to a RUNNING app changed nothing: the
    // Secret was written and the pod kept `envFrom: null`. Observed live.
    // Server-Side Apply is idempotent, so converging the whole spec every pass
    // costs one PATCH and is what makes this a reconciler rather than a
    // create-once script. A changed envFrom alters the pod template, which
    // rolls the pods — correct, since configuration changes should restart the
    // app rather than apply on some later unrelated deploy.
    // One apply covers all three cases — create, converge an existing spec, and
    // scale a stopped deployment back up — because `replicas: 1` is part of the
    // desired state. Splitting them was what let a running deployment keep a
    // stale spec: the scale-up path never re-applied the manifest, so an app
    // resurrected by a rollback came back with whatever envFrom it had before.
    // ASLEEP ON PURPOSE. A deployment an alias points at would normally be
    // scaled to 1 — that is what "targeted" means. But an app the idle sweep
    // put to sleep is at zero DELIBERATELY, and the activator wakes it when a
    // request arrives.
    //
    // Without this the reconciler and the sweep disagree about desired state:
    // the sweep scales to zero, the next pass sees a targeted deployment with
    // no replicas and "corrects" it, and the saving lasts until the interval
    // fires. The symptom would read as flapping rather than as two components
    // holding different opinions.
    // Did the activator wake this since we put it to sleep? It has no database
    // credential, so it stamps the Deployment and the control plane reads the
    // stamp back. Comparing TIMESTAMPS rather than just checking replicas
    // avoids the race in the other direction: the sweep sets the flag and then
    // scales down, and a pass landing between those two steps would otherwise
    // see "asleep with replicas" and wrongly conclude a wake.
    let asleep = d.scaled_to_zero_at != null;
    if (asleep) {
      const wokenAt = await deploymentAnnotation(k, ns, name, "ahura.cloud/woken-at");
      if (wokenAt && Date.parse(wokenAt) > Date.parse(d.scaled_to_zero_at!)) {
        actions.push({ kind: "repoint", target: name, detail: `woken by a request at ${wokenAt} — clearing sleep` });
        if (!dry) await deployments.clearSleep(d.ref);
        asleep = false;
        // Update the ROW IN MEMORY too. The alias loop below reads
        // scaled_to_zero_at off this same object, and without this it sees the
        // stale value, concludes the app is still asleep, and repoints the
        // hostname back at the activator in the very pass that woke it —
        // leaving the activator in the hot path for a warm app, which is
        // exactly what it must never be. Observed live.
        d.scaled_to_zero_at = null;
      }
    }

    if (asleep) {
      actions.push({
        kind: "noop",
        target: name,
        detail: `asleep since ${d.scaled_to_zero_at} — activator wakes it on request`,
      });
      continue;
    }

    actions.push(
      replicas === null
        ? { kind: "create", target: name, detail: `creating from ${d.image_digest.slice(0, 19)}…` }
        : replicas === 0
          ? { kind: "scale-up", target: name, detail: "alias points here; scaling 0 -> 1" }
          : specDrifted
            ? {
                kind: "repoint" as const,
                target: name,
                detail:
                  live!.envSecret !== (envSecretRef ?? null)
                    ? `config changed: envFrom ${live!.envSecret ?? "(none)"} -> ${envSecretRef ?? "(none)"} — pods will roll`
                    : live!.envHash !== (envHash ?? null)
                      ? `env values changed (${live!.envHash ?? "none"} -> ${envHash ?? "none"}) — pods will roll`
                    : `image changed: ${String(live!.image).slice(-19)} -> ${image.slice(-19)}`,
              }
            : { kind: "noop" as const, target: name, detail: `converged (${replicas} replica(s))` },
    );
    if (!dry) {
      await k.apply(
        `/apis/apps/v1/namespaces/${ns}/deployments/${name}`,
        appDeployment({
          deploymentRef: d.ref,
          projectRef: project.ref,
          namespace: ns,
          image,
          // From the DEPLOYMENT, not from today's detection: rolling back must
          // restore the port and uid that build actually ran with.
          port: d.container_port ?? 3000,
          runAsUser: d.run_as_user ?? undefined,
          replicas: 1,
          envSecretName: envSecretRef,
          envHash,
        }),
      );
    }
  }

  // ── 2. superseded deployments scale to zero ───────────────────────────────
  // Kept, not deleted: the object is what makes rollback a scale-up instead of
  // a rebuild. Deleting would make "instant rollback" a lie.
  for (const d of ready) {
    if (targeted.has(d.id)) continue;
    const name = k8sName(d);
    const cur = await liveDeployment(k, ns, name);
    if (cur === null || cur.replicas === 0) continue;
    const replicas = cur.replicas;
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
    // The annotation must declare `ports` as well as `selector`: the port is
    // read two lines below, and an annotation narrower than the reads it feeds
    // means the compiler checks nothing about the shape that actually matters.
    const svc = await k.get<{
      spec?: {
        selector?: Record<string, string>;
        ports?: Array<{ targetPort?: number | string; port?: number; name?: string }>;
      };
    }>(`/api/v1/namespaces/${ns}/services/${project.ref}`, true);
    const currently = svc?.spec?.selector?.["ahura.cloud/deployment"];
    const currentPort = svc?.spec?.ports?.[0]?.targetPort;
    const desiredPort = target.container_port ?? 3000;

    // ALWAYS apply, exactly like the Deployment above. Applying only when the
    // SELECTOR changed meant a corrected targetPort never converged: the pod
    // was healthy on 8000 while the Service still pointed at 3000, and the
    // gateway returned 502 with nothing obviously wrong anywhere. Conditional
    // apply is how a reconciler quietly stops reconciling.
    const svcDrifted = svc != null && (currently !== target.ref || currentPort !== desiredPort);
    if (svc == null || svcDrifted) {
      actions.push({
        kind: "repoint",
        target: project.ref,
        detail:
          currently !== target.ref
            ? `service selector ${currently ?? "(none)"} -> ${target.ref}`
            : `service targetPort ${currentPort} -> ${desiredPort}`,
      });
    }
    {
      if (!dry) {
        await k.apply(
          `/api/v1/namespaces/${ns}/services/${project.ref}`,
          appService({ deploymentRef: target.ref, projectRef: project.ref, namespace: ns, port: target.container_port ?? 3000 }),
        );
      }
    }
  }

  // ── 3b. a Service per targeted deployment ─────────────────────────────────
  //
  // The project-level Service above is production's. It is not enough on its
  // own: every alias's Ingress pointed at it, so two hostnames on one project
  // both resolved to whatever production selected. A branch preview served
  // production's build while paas.aliases recorded that it served its own —
  // the control plane believing something untrue, and a pod running for a
  // hostname that could never reach it.
  for (const id of targeted) {
    const d = byId.get(id)!;
    if (!d.image_repo || !d.image_digest) continue;
    if (!dry) {
      await k.apply(
        `/api/v1/namespaces/${ns}/services/${d.ref}`,
        appService({
          name: d.ref,
          deploymentRef: d.ref,
          projectRef: project.ref,
          namespace: ns,
          port: d.container_port ?? 3000,
        }),
      );
    }
  }

  // ── 4. every alias hostname routes to ITS OWN deployment ──────────────────
  for (const a of projectAliases) {
    if (!a.deployment_id || !byId.has(a.deployment_id)) continue;
    const target = byId.get(a.deployment_id)!;

    const existing = await k.get<{
      spec?: { rules?: Array<{ http?: { paths?: Array<{ backend?: { service?: { name?: string } } }> } }> };
    }>(`/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses/${a.ref}`, true);
    const currentBackend = existing?.spec?.rules?.[0]?.http?.paths?.[0]?.backend?.service?.name;

    // A sleeping app routes to the ACTIVATOR, which holds the first request,
    // scales the app up, points this Ingress back at it, and forwards. Routing
    // a sleeping hostname at its own Service would serve a 503 from a Service
    // with no endpoints — scale-to-zero without a wake path is just downtime.
    if (target.scaled_to_zero_at != null) {
      if (currentBackend !== ACTIVATOR_NAME) {
        actions.push({
          kind: "repoint",
          target: a.hostname,
          detail: `asleep — ingress backend ${currentBackend ?? "(none)"} -> ${ACTIVATOR_NAME}`,
        });
      }
      if (!dry) {
        // A namespace-local name for the shared activator. An Ingress backend
        // cannot cross namespaces, and a backend that does not resolve is a 404
        // rather than an error.
        await k.apply(`/api/v1/namespaces/${ns}/services/${ACTIVATOR_NAME}`, activatorAliasService(ns));
        await k.apply(
          `/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses/${a.ref}`,
          appIngress({
            aliasRef: a.ref,
            projectRef: project.ref,
            namespace: ns,
            hostname: a.hostname,
            serviceName: ACTIVATOR_NAME,
            wakeTarget: target.ref,
            wakePort: target.container_port ?? 3000,
          }),
        );
      }
      continue;
    }

    // ALWAYS apply. This read used to be `if (existing) continue` — the fourth
    // instance of the same bug: an Ingress that needed to change its backend
    // never converged, because it already existed. Server-Side Apply is
    // idempotent; the read is only here to describe what changed.
    if (!existing) {
      actions.push({ kind: "route", target: a.hostname, detail: `creating Ingress ${a.ref}` });
    } else if (currentBackend !== target.ref) {
      actions.push({
        kind: "repoint",
        target: a.hostname,
        detail: `ingress backend ${currentBackend ?? "(none)"} -> ${target.ref}`,
      });
    }
    if (!dry) {
      await k.apply(
        `/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses/${a.ref}`,
        appIngress({
          aliasRef: a.ref,
          projectRef: project.ref,
          namespace: ns,
          hostname: a.hostname,
          serviceName: target.ref,
        }),
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

// ── entrypoints ─────────────────────────────────────────────────────────────
//
// A control loop with no runner is not a control loop. The functions above were
// only ever invoked by a proof script, which meant an alias write from the UI
// moved the database pointer and nothing reached the cluster until a human ran
// a script. Peer review caught that; these are the callers that close it.
//
// Two triggers, deliberately, because they fail differently:
//
//   EDGE-TRIGGERED (promoteAndConverge) — converge immediately after a write,
//   so a promote takes effect in seconds rather than whenever a timer fires.
//   Fast, but it is lost if the process dies mid-call.
//
//   LEVEL-TRIGGERED (the loop in scripts/v2/reconcile-loop.ts) — re-derive
//   desired state from scratch on an interval, so anything the edge trigger
//   missed is repaired without anyone noticing. Slow, but it cannot lose work.
//
// Neither alone is sufficient: edge-only diverges silently on any failure,
// level-only makes every promote feel broken for up to one interval.

/** Kube context from the environment, so callers need not know the file path. */
export function kubeContextFromEnv(): KubeContext {
  const path = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";
  return loadKubeconfig(path);
}

/** Converge one project by its ref. Safe to call from a request handler. */
export async function reconcileProjectByRef(
  projectRef: string,
  opts: { dryRun?: boolean } = {},
): Promise<ReconcileReport> {
  const project = await projects.byRef(projectRef);
  if (!project) throw new Error(`project ${projectRef} not found`);
  return reconcileProject(kubeContextFromEnv(), project, {
    dryRun: opts.dryRun,
    appDomain: process.env.V2_APP_DOMAIN ?? "ahurasense.com",
  });
}

/**
 * Promote and converge in one call. This is what a promote button should hit.
 *
 * The alias write is the source of truth and happens FIRST, so if convergence
 * fails the desired state is still recorded and the background loop repairs it.
 * Reversing the order would mean a cluster change with no record — the same
 * create-before-record mistake that left infrastructure untracked earlier.
 */
export async function promoteAndConverge(
  projectId: string,
  deploymentRef: string,
): Promise<{ alias: AliasRow; report: ReconcileReport | null; convergeError?: string }> {
  const alias = await promote(projectId, deploymentRef);

  const project = (await projects.list()).find((p) => p.id === projectId);
  if (!project) return { alias, report: null, convergeError: "project not found after promote" };

  try {
    const report = await reconcileProject(kubeContextFromEnv(), project, {
      appDomain: process.env.V2_APP_DOMAIN ?? "ahurasense.com",
    });
    return { alias, report };
  } catch (e) {
    // The pointer moved and is durable; the loop will finish the job. Report it
    // rather than throwing, so the caller can say "promoted, converging" rather
    // than implying the promote failed when it did not.
    return { alias, report: null, convergeError: (e as Error).message.slice(0, 300) };
  }
}
