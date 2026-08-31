/**
 * Workload reconciliation: Kubernetes Deployments against `paas.deployments`.
 *
 * THE SAME DEFECT AS FLEET DRIFT, ONE LAYER DOWN, AND INVISIBLE TO IT.
 *
 * `scripts/v3/fleet-drift.ts` compares Linode against the control plane, so it
 * sees clusters, nodes and build VMs. It cannot see a workload: a Deployment
 * running with no `paas.deployments` row lives entirely inside Kubernetes, on a
 * node that IS recorded, in a cluster that IS recorded. Fleet drift reports
 * clean while the pod rides along.
 *
 * That is not hypothetical. Every deploy used to leave the previous Deployment
 * at full replicas, silently doubling the pod count per deploy — found by
 * reading a namespace, not by any reconciler. It is fixed now, but the class of
 * defect is not detected by anything else, and this is the layer where a tenant
 * costs the platform money.
 *
 * THE CURRENCY HERE IS PODS, NOT DOLLARS, and that is deliberate. LKE caps pods
 * per cluster — 1,000 standard, 5,000 enterprise — and the plan is explicit
 * that this cap, not CPU or RAM, is what forces a multi-cluster fleet. A pod
 * consumed by a workload nobody knows about is capacity that cannot be sold,
 * and `paas.clusters.pod_allocated` is what placement reads when deciding where
 * the next app goes. If that number drifts from reality, scheduling decisions
 * are made against fiction.
 *
 * Pure. No network. Report-only: nothing here scales, deletes or patches a
 * workload.
 */

export const WORKLOAD_SEVERITY = [
  // First, because it is the only one a customer can see. Everything else here
  // is bookkeeping; this is an app that is supposed to be serving and is not.
  "down",
  "unrecorded",
  "terminal-live",
  "superseded-live",
  "phantom",
  "unplaced",
  // Not a problem — the platform working as designed. It is a distinct STATE
  // rather than a finding, and conflating it with `healthy` is what this
  // status exists to stop: an operator seeing "0 pods, healthy" cannot tell
  // whether four apps are asleep and saving money or four apps are silently
  // not running.
  "asleep",
  "healthy",
] as const;

export type WorkloadStatus = (typeof WORKLOAD_SEVERITY)[number];

export interface WorkloadLike {
  /** Deployment object name, which is the deployment ref. */
  name: string;
  namespace: string;
  deploymentRef: string;
  projectRef: string | null;
  /** `spec.replicas` — what is asked for. */
  desiredReplicas: number;
  /** `status.readyReplicas` — what is actually serving. */
  readyReplicas: number;
}

export interface DeploymentRowLike {
  ref: string;
  state: string;
  project_id: string;
  /** ISO. Used to decide which of a project's deployments is the newest. */
  created_at?: string;
  /**
   * Non-null means asleep ON PURPOSE — scaled to zero by the idle sweep, with
   * an activator in front of the hostname to wake it on request.
   *
   * This is the field that separates a sleeping app from a broken one. Both
   * are a `ready` row with zero running pods, and without it the two are
   * indistinguishable in exactly the direction that matters: the platform's
   * headline cost saving looks identical to four apps being down.
   */
  scaled_to_zero_at?: string | null;
}

export interface PlacementLike {
  deployment_id?: string;
  /** Deployment ref, when the caller has resolved it. */
  ref?: string;
  namespace: string;
}

export interface WorkloadFinding {
  status: WorkloadStatus;
  deploymentRef: string;
  namespace: string;
  projectRef: string | null;
  /** Pods this workload is currently holding. */
  pods: number;
  detail: string;
  action: string;
  actionable: boolean;
}

export interface WorkloadDriftReport {
  findings: WorkloadFinding[];
  /** Deployments asleep on purpose. The cost saving, counted. */
  asleep: number;
  /** Pods held by workloads the control plane does not account for. */
  unaccountedPods: number;
  /** Every tenant pod observed, accounted for or not. */
  observedPods: number;
  clean: boolean;
}

/** A row that claims a workload should be running. */
const LIVE_STATES = new Set(["ready"]);

/** A row that says the deployment finished and produced nothing serving. */
const TERMINAL_STATES = new Set(["error", "canceled"]);

export interface WorkloadReconcileInput {
  workloads: WorkloadLike[];
  deployments: DeploymentRowLike[];
  placements: PlacementLike[];
}

export function reconcileWorkloads(input: WorkloadReconcileInput): WorkloadDriftReport {
  const byRef = new Map(input.deployments.map((d) => [d.ref, d]));
  const placedRefs = new Set(input.placements.map((p) => p.ref).filter(Boolean) as string[]);
  const findings: WorkloadFinding[] = [];

  // The newest `ready` row per project. Anything older still holding pods is
  // a superseded deployment that outlived its replacement.
  const newestByProject = new Map<string, DeploymentRowLike>();
  for (const d of input.deployments) {
    if (!LIVE_STATES.has(d.state)) continue;
    const current = newestByProject.get(d.project_id);
    if (!current || (d.created_at ?? "") > (current.created_at ?? "")) {
      newestByProject.set(d.project_id, d);
    }
  }

  const seen = new Set<string>();
  let observedPods = 0;

  for (const w of input.workloads) {
    const pods = Math.max(w.readyReplicas, 0);
    observedPods += pods;
    seen.add(w.deploymentRef);

    const row = byRef.get(w.deploymentRef);
    const base = {
      deploymentRef: w.deploymentRef,
      namespace: w.namespace,
      projectRef: w.projectRef,
      pods,
    };

    if (!row) {
      findings.push({
        ...base,
        status: "unrecorded",
        detail: `${pods} pod(s) running, no paas.deployments row for ${w.deploymentRef}`,
        action:
          `A workload the control plane does not know about. It consumes pod capacity ` +
          `that placement believes is free, and nothing will ever reap it.`,
        actionable: true,
      });
      continue;
    }

    if (TERMINAL_STATES.has(row.state) && pods > 0) {
      findings.push({
        ...base,
        status: "terminal-live",
        detail: `row says '${row.state}' but ${pods} pod(s) are serving`,
        action:
          `The control plane believes this deployment failed. Something is serving ` +
          `traffic that nothing intends to be running.`,
        actionable: true,
      });
      continue;
    }

    // Asleep on purpose. Checked BEFORE `down`, because both are a ready row
    // with zero pods and only `scaled_to_zero_at` tells them apart — and
    // before `superseded-live`, because a sleeping older revision holds no
    // pods and is therefore not the cost multiplier that finding is about.
    if (LIVE_STATES.has(row.state) && pods === 0 && row.scaled_to_zero_at) {
      findings.push({
        ...base,
        status: "asleep",
        detail: `scaled to zero at ${row.scaled_to_zero_at}, activator serving the hostname`,
        action: "",
        actionable: false,
      });
      continue;
    }

    // A `ready` row asking for replicas and getting none. The deployment
    // succeeded, so the control plane and every alias pointing at it believe
    // this app is live — and nothing is serving. Distinct from `phantom`,
    // where the workload does not exist at all: here it exists and is failing,
    // which usually means a crash loop or an image that will not pull.
    if (LIVE_STATES.has(row.state) && w.desiredReplicas > 0 && pods === 0) {
      findings.push({
        ...base,
        status: "down",
        detail: `row state 'ready', ${w.desiredReplicas} replica(s) wanted, 0 ready`,
        action:
          `This app is not serving. Read the pod's previous container logs — a ready ` +
          `deployment with no ready replicas is usually a crash loop or a failed image pull.`,
        actionable: true,
      });
      continue;
    }

    const newest = newestByProject.get(row.project_id);
    if (pods > 0 && newest && newest.ref !== row.ref && LIVE_STATES.has(row.state)) {
      findings.push({
        ...base,
        status: "superseded-live",
        detail: `superseded by ${newest.ref}, still holding ${pods} pod(s) at full replicas`,
        action:
          `Correct if held warm for instant rollback. If not, this is a per-deploy cost ` +
          `multiplier — at scale, one lingering pod per deploy is the difference between ` +
          `the two cost models in the plan. Scaling to zero keeps rollback a scale-up.`,
        actionable: true,
      });
      continue;
    }

    if (!placedRefs.has(row.ref) && input.placements.length > 0) {
      findings.push({
        ...base,
        status: "unplaced",
        detail: `running with no paas.deployment_placements row`,
        action:
          `Placement accounting cannot see this. clusters.pod_allocated will drift from ` +
          `reality, and the next app is scheduled against a number that is wrong.`,
        actionable: true,
      });
      continue;
    }

    findings.push({
      ...base,
      status: "healthy",
      detail: `${pods}/${w.desiredReplicas} pod(s), row state '${row.state}'`,
      action: "",
      actionable: false,
    });
  }

  // ── rows claiming a workload that does not exist ──────────────────────────

  for (const d of input.deployments) {
    if (seen.has(d.ref)) continue;
    if (!LIVE_STATES.has(d.state)) continue; // only `ready` claims to be serving

    findings.push({
      status: "phantom",
      deploymentRef: d.ref,
      namespace: "—",
      projectRef: null,
      pods: 0,
      detail: `row state 'ready' but no Deployment object exists`,
      action:
        `The control plane says this is live and it is not. An alias pointing here ` +
        `serves nothing, and rollback to it would not work.`,
      actionable: true,
    });
  }

  const rank = (s: WorkloadStatus) => WORKLOAD_SEVERITY.indexOf(s);
  findings.sort(
    (a, b) => rank(a.status) - rank(b.status) || b.pods - a.pods || a.deploymentRef.localeCompare(b.deploymentRef),
  );

  const unaccountedPods = findings
    .filter((f) => f.status === "unrecorded" || f.status === "terminal-live")
    .reduce((n, f) => n + f.pods, 0);

  return {
    findings,
    asleep: findings.filter((f) => f.status === "asleep").length,
    unaccountedPods,
    observedPods,
    clean: findings.every((f) => !f.actionable),
  };
}

export interface CapacityDrift {
  /** What `paas.clusters.pod_allocated` claims. */
  recorded: number;
  /** What the cluster actually runs. */
  observed: number;
  drift: number;
  /** Beyond a pod or two, placement is scheduling against fiction. */
  significant: boolean;
}

/**
 * Compare recorded pod allocation against reality.
 *
 * Placement reads `pod_allocated` to decide where the next app goes. When it
 * drifts low, the cluster is oversubscribed against a cap that LKE enforces
 * hard; when it drifts high, capacity that could be sold looks full.
 *
 * `observedAllPods` MUST BE EVERY POD ON THE CLUSTER, NOT ONLY TENANT PODS.
 *
 * This is the trap, and it caught me. The rest of this module is deliberately
 * tenant-scoped — platform namespaces are filtered out, because a workload
 * with no `paas.deployments` row is only a finding if it was supposed to have
 * one. But `pod_allocated` counts against the LKE POD CAP, and that cap counts
 * everything: kube-system, Traefik, the registry, the gVisor installer, the
 * registry-proxy DaemonSet. Comparing a tenant count to it reported a drift of
 * -20 on a cluster that was perfectly consistent, which is worse than no check
 * — a reconciler crying wolf gets muted, and then it is not there when the
 * number is genuinely wrong.
 *
 * Flagged by the infrastructure lane in the same message that fixed the
 * column, before I had run it.
 */
export function capacityDrift(recorded: number, observedAllPods: number): CapacityDrift {
  const drift = observedAllPods - recorded;
  return { recorded, observed: observedAllPods, drift, significant: Math.abs(drift) > 2 };
}

/** Extract what this module needs from a Kubernetes Deployment object. */
export function workloadFrom(d: {
  metadata: { name: string; namespace: string; labels?: Record<string, string> };
  spec?: { replicas?: number };
  status?: { readyReplicas?: number };
}): WorkloadLike {
  return {
    name: d.metadata.name,
    namespace: d.metadata.namespace,
    // The label is authoritative; the object name is the fallback. v1 used
    // `name` as the primary key of all infrastructure addressing with no
    // uniqueness constraint, which the audit traced to three critical findings.
    deploymentRef: d.metadata.labels?.["ahura.cloud/deployment"] ?? d.metadata.name,
    projectRef: d.metadata.labels?.["ahura.cloud/project"] ?? null,
    desiredReplicas: d.spec?.replicas ?? 0,
    readyReplicas: d.status?.readyReplicas ?? 0,
  };
}
