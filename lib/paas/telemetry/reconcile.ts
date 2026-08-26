/**
 * Fleet reconciliation: what Linode is charging for, against what the control
 * plane recorded.
 *
 * THIS EXISTS BECAUSE OF TWO REAL INCIDENTS, ONE OF THEM TODAY.
 *
 * `paas.clusters` and `paas.build_vms` were designed so that infrastructure
 * cannot outlive its record. Then the provisioning scripts created an LKE
 * cluster, two worker nodes and a NodeBalancer — about $116/month — and wrote
 * no rows at all. Both tables sat empty while the money ran. Nothing in the
 * system noticed. A person did.
 *
 * Separately, a build script crashed between leasing a Linode and parsing the
 * response, leaving a live instance with no record anywhere. It was recovered
 * only because the reaper keys on a Linode tag rather than on the database.
 *
 * Those are one defect seen from two sides, and it is v1's defect too: five
 * billing meters outlived the apps they billed for. A row and a cloud resource
 * are two claims about the world, and nothing was comparing them.
 *
 * This module is the comparison, and it is deliberately pure — no network, no
 * database, no clock of its own. Classification is where the subtle mistakes
 * live, so it is testable without credentials, and a bug here fails in a unit
 * test rather than in a report nobody can reproduce.
 *
 * IT REPORTS. IT DOES NOT DELETE. Reaping live infrastructure on the strength
 * of a classification is how a reporting bug becomes an outage.
 * `scripts/v2/teardown.ts --apply` remains the only thing that destroys, run
 * by a human who has read the report.
 */

/** Hours billed per month. Matches scripts/v2/teardown.ts so the two agree. */
export const MONTH_HOURS = 730;

/**
 * A reserved row that never got a cloud id is benign — that is the intended
 * outcome of a crash between RESERVE and ATTACH. Past this age it stops being
 * benign and starts being evidence that something crashed and never retried.
 */
export const RESERVED_STALE_MS = 60 * 60 * 1000;

/**
 * Worst first. Drives sort order, and everything above `foreign` is worth a
 * human's attention.
 */
export const SEVERITY = [
  "unrecorded",
  "denied",
  "expired",
  "phantom",
  "mismatched",
  "reserved",
  "foreign",
  "tracked",
] as const;

export type DriftStatus = (typeof SEVERITY)[number];

// ── what Linode says exists ─────────────────────────────────────────────────

export interface RawLkeCluster {
  id: number;
  label: string;
  region: string;
  k8s_version: string;
  tags: string[];
  /** Present on the API response as control_plane.high_availability. */
  ha: boolean;
}

export interface RawInstance {
  id: number;
  label: string;
  region: string;
  type: string;
  status: string;
  tags: string[];
}

export interface RawNodeBalancer {
  id: number;
  label: string;
  /** null when the NodeBalancer is not LKE-managed. */
  lkeClusterId: number | null;
}

/**
 * Prices are looked up, never assumed. `instanceHourly` returns undefined for
 * a type it does not know rather than zero.
 *
 * That distinction is the whole point. teardown.ts does `?? 0`, so an unknown
 * type — Linode adds one, or a paginated /linode/types drains short — is
 * silently priced at nothing, and the report reads as reassuring precisely
 * when it is wrong. A cost report that can round real money to zero is the
 * same class of defect as a meter that never runs.
 */
export interface Pricing {
  instanceHourly: (typeId: string) => number | undefined;
  nodeBalancerHourly: number;
  /** LKE's standard control plane is free; HA is not. */
  lkeHaHourly: number;
}

// ── what the control plane recorded ─────────────────────────────────────────
//
// Structural subsets of ClusterRow / BuildVmRow in lib/paas/db.ts. Declared
// structurally rather than imported so this module keeps its zero-dependency
// property and stays testable with literals.

export interface ClusterRecord {
  ref: string;
  name: string;
  region: string;
  lke_cluster_id: number | null;
  k8s_version: string | null;
  state: string;
  created_at?: string;
}

export interface BuildVmRecord {
  ref: string;
  linode_id: number | null;
  region: string;
  instance_type: string;
  state: string;
  expires_at: string;
  destroyed_at?: string | null;
  created_at?: string;
}

/** States in which a row asserts the instance is gone. */
const DEAD_VM_STATES = new Set(["destroyed", "leaked"]);

/**
 * Kinds that are supposed to exist for minutes, not months. Their cost is real
 * but must never be projected forward — see `transientHourly`.
 */
const TRANSIENT_KINDS = new Set(["build-vm", "build-vm-row"]);

// ── findings ────────────────────────────────────────────────────────────────

export interface Finding {
  status: DriftStatus;
  kind: "lke" | "build-vm" | "instance" | "nodebalancer" | "cluster-row" | "build-vm-row";
  label: string;
  /** Linode's id, or null when the finding is about a row with no resource. */
  cloudId: number | null;
  /** Control-plane ref, or null when the finding is about an unrecorded resource. */
  ref: string | null;
  /** Cost per hour. null means the price is genuinely unknown, not zero. */
  hourly: number | null;
  detail: string;
  /** What a human should do. Empty for `tracked`. */
  action: string;
  /**
   * Linode is charging for this and no row admits it is alive. This is the
   * flag the money question turns on, and it is deliberately not the same as
   * `status !== "tracked"` — a phantom row costs nothing, a denied resource
   * costs real money.
   */
  unaccounted: boolean;
  /** Worth waking someone for. Drives the process exit code. */
  actionable: boolean;
}

export interface DriftReport {
  findings: Finding[];
  /** v2's total known spend per hour. Excludes foreign and unpriced resources. */
  totalHourly: number;
  /**
   * The part of `totalHourly` that actually persists — clusters, their nodes
   * and NodeBalancers. This is the only number a monthly projection may be
   * built from.
   */
  standingHourly: number;
  /**
   * Build VMs, which exist for minutes. Reported per-hour and NEVER multiplied
   * out to a month: a throwaway VM projected across 730 hours turns $0.002 of
   * real spend into $26/month of fiction, and a cost report that inflates is
   * no more useful than one that understates.
   */
  transientHourly: number;
  /** Of `totalHourly`, the part no control-plane row accounts for. */
  unaccountedHourly: number;
  /** Spend visible to the token that is not v2's. Should be zero. */
  foreignHourly: number;
  /** Resources whose Linode type carried no price. Cost is understated by these. */
  unpriced: string[];
  /** True when nothing needs a human. */
  clean: boolean;
}

export interface ReconcileInput {
  lkeClusters: RawLkeCluster[];
  instances: RawInstance[];
  nodeBalancers: RawNodeBalancer[];
  clusterRows: ClusterRecord[];
  buildVmRows: BuildVmRecord[];
  pricing: Pricing;
  /** Injected, never read from the process, so tests are deterministic. */
  now: Date;
  v2Tag: string;
  buildTag: string;
}

/**
 * Which LKE cluster a worker node belongs to.
 *
 * LKE names every node `lke<clusterId>-<poolId>-<hash>`. teardown.ts already
 * depends on this convention; the difference here is that it is under test.
 * If LKE ever changes the format this returns null, every node reads as
 * unrecorded, and the report screams — which is the correct direction to fail.
 * Silently attributing a node to nothing would report "no drift" while money
 * runs, the exact failure this module exists to catch.
 */
export function parseNodeClusterId(label: string): number | null {
  const m = /^lke(\d+)-/.exec(label);
  return m ? Number(m[1]) : null;
}

function ageMs(iso: string | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : now.getTime() - t;
}

function humanAge(ms: number): string {
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.round(ms / 60_000)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export function reconcile(input: ReconcileInput): DriftReport {
  const { pricing, now, v2Tag, buildTag } = input;
  const findings: Finding[] = [];
  const unpriced: string[] = [];

  const priceInstance = (typeId: string, what: string): number | null => {
    const p = pricing.instanceHourly(typeId);
    if (p === undefined) {
      unpriced.push(`${what} (type ${typeId})`);
      return null;
    }
    return p;
  };

  // ── index the control plane ───────────────────────────────────────────────

  const clusterByLkeId = new Map<number, ClusterRecord>();
  for (const c of input.clusterRows) {
    if (c.lke_cluster_id !== null) clusterByLkeId.set(c.lke_cluster_id, c);
  }
  const vmByLinodeId = new Map<number, BuildVmRecord>();
  for (const v of input.buildVmRows) {
    if (v.linode_id !== null) vmByLinodeId.set(v.linode_id, v);
  }

  const seenClusterRefs = new Set<string>();
  const seenVmRefs = new Set<string>();

  // ── attribute nodes and NodeBalancers to their cluster ────────────────────
  //
  // Neither is recorded individually — paas.clusters carries the cluster, and
  // its nodes and NodeBalancer are implied. So their cost belongs to the
  // cluster's finding. Today's incident is therefore ONE unrecorded cluster
  // carrying ~$116/mo, not four unrelated unrecorded resources, which is both
  // truer and the only form an operator can act on.

  const nodesByCluster = new Map<number, RawInstance[]>();
  const buildVms: RawInstance[] = [];
  const strayInstances: RawInstance[] = [];

  for (const i of input.instances) {
    if (i.tags.includes(buildTag)) {
      buildVms.push(i);
      continue;
    }
    const parent = parseNodeClusterId(i.label);
    if (parent !== null) {
      const list = nodesByCluster.get(parent);
      if (list) list.push(i);
      else nodesByCluster.set(parent, [i]);
      continue;
    }
    strayInstances.push(i);
  }

  const nbByCluster = new Map<number, RawNodeBalancer[]>();
  const strayNbs: RawNodeBalancer[] = [];
  for (const nb of input.nodeBalancers) {
    if (nb.lkeClusterId === null) {
      strayNbs.push(nb);
      continue;
    }
    const list = nbByCluster.get(nb.lkeClusterId);
    if (list) list.push(nb);
    else nbByCluster.set(nb.lkeClusterId, [nb]);
  }

  const ourClusterIds = new Set(
    input.lkeClusters.filter((c) => c.tags.includes(v2Tag)).map((c) => c.id),
  );

  // ── LKE clusters ──────────────────────────────────────────────────────────

  for (const c of input.lkeClusters) {
    const nodes = nodesByCluster.get(c.id) ?? [];
    const nbs = nbByCluster.get(c.id) ?? [];

    let hourly = c.ha ? pricing.lkeHaHourly : 0;
    let priceKnown = true;
    for (const n of nodes) {
      const p = priceInstance(n.type, `node ${n.label}`);
      if (p === null) priceKnown = false;
      else hourly += p;
    }
    hourly += nbs.length * pricing.nodeBalancerHourly;

    const parts = [
      `${nodes.length} node${nodes.length === 1 ? "" : "s"}`,
      `${nbs.length} nodebalancer${nbs.length === 1 ? "" : "s"}`,
      c.ha ? "HA control plane" : "standard control plane",
    ].join(" + ");
    const detail = `${c.k8s_version} ${c.region} — ${parts}`;

    if (!c.tags.includes(v2Tag)) {
      findings.push({
        status: "foreign",
        kind: "lke",
        label: c.label,
        cloudId: c.id,
        ref: null,
        hourly: priceKnown ? hourly : null,
        detail,
        action: "Not tagged for v2. Listed for visibility; left alone.",
        unaccounted: false,
        actionable: false,
      });
      continue;
    }

    const row = clusterByLkeId.get(c.id);
    if (!row) {
      findings.push({
        status: "unrecorded",
        kind: "lke",
        label: c.label,
        cloudId: c.id,
        ref: null,
        hourly: priceKnown ? hourly : null,
        detail,
        action:
          `No paas.clusters row references lke_cluster_id=${c.id}. This is spend nobody ` +
          `is tracking. Insert the row (reserve + attach) or destroy the cluster.`,
        unaccounted: true,
        actionable: true,
      });
      continue;
    }

    seenClusterRefs.add(row.ref);

    const mismatches: string[] = [];
    if (row.region !== c.region) mismatches.push(`region ${row.region} != ${c.region}`);
    if (row.k8s_version && row.k8s_version !== c.k8s_version) {
      mismatches.push(`k8s_version ${row.k8s_version} != ${c.k8s_version}`);
    }
    if (row.state === "retired") {
      mismatches.push(`row state 'retired' but the cluster is live`);
    }

    if (mismatches.length) {
      const denies = row.state === "retired";
      findings.push({
        status: denies ? "denied" : "mismatched",
        kind: "lke",
        label: c.label,
        cloudId: c.id,
        ref: row.ref,
        hourly: priceKnown ? hourly : null,
        detail: `${detail} — ${mismatches.join("; ")}`,
        action: denies
          ? `Row ${row.ref} says retired while Linode still bills for it. The teardown ` +
            `path did not complete. Investigate before writing the row to match.`
          : `Row ${row.ref} disagrees with Linode. Correct whichever is wrong.`,
        unaccounted: denies,
        actionable: true,
      });
      continue;
    }

    findings.push({
      status: "tracked",
      kind: "lke",
      label: c.label,
      cloudId: c.id,
      ref: row.ref,
      hourly: priceKnown ? hourly : null,
      detail,
      action: "",
      unaccounted: false,
      actionable: false,
    });
  }

  // ── build VMs ─────────────────────────────────────────────────────────────

  for (const i of buildVms) {
    const hourly = priceInstance(i.type, `build VM ${i.label}`);
    const row = vmByLinodeId.get(i.id);
    const detail = `${i.type} ${i.status} ${i.region}`;

    if (!row) {
      findings.push({
        status: "unrecorded",
        kind: "build-vm",
        label: i.label,
        cloudId: i.id,
        ref: null,
        hourly,
        detail,
        action:
          `Tagged ${buildTag} but no paas.build_vms row claims linode_id=${i.id}. A build ` +
          `script leased this and crashed before recording it. Destroy it.`,
        unaccounted: true,
        actionable: true,
      });
      continue;
    }

    seenVmRefs.add(row.ref);

    if (DEAD_VM_STATES.has(row.state)) {
      findings.push({
        status: "denied",
        kind: "build-vm",
        label: i.label,
        cloudId: i.id,
        ref: row.ref,
        hourly,
        detail: `${detail} — row state '${row.state}'`,
        action:
          `Row ${row.ref} says '${row.state}' while the instance is still running and ` +
          `billing. The destroy path reported success it did not achieve. Destroy the ` +
          `instance, then find out why the row was written.`,
        unaccounted: true,
        actionable: true,
      });
      continue;
    }

    const overdue = now.getTime() - Date.parse(row.expires_at);
    if (overdue > 0) {
      findings.push({
        status: "expired",
        kind: "build-vm",
        label: i.label,
        cloudId: i.id,
        ref: row.ref,
        hourly,
        detail: `${detail} — ${humanAge(overdue)} past expires_at`,
        action: `Past its deadline and still billing. The reaper should have taken it.`,
        unaccounted: false,
        actionable: true,
      });
      continue;
    }

    findings.push({
      status: "tracked",
      kind: "build-vm",
      label: i.label,
      cloudId: i.id,
      ref: row.ref,
      hourly,
      detail,
      action: "",
      unaccounted: false,
      actionable: false,
    });
  }

  // ── instances and NodeBalancers belonging to nothing we know ──────────────

  for (const i of strayInstances) {
    const ours = i.tags.includes(v2Tag);
    const hourly = priceInstance(i.type, `instance ${i.label}`);
    findings.push({
      status: ours ? "unrecorded" : "foreign",
      kind: "instance",
      label: i.label,
      cloudId: i.id,
      ref: null,
      hourly,
      detail: `${i.type} ${i.status} ${i.region}`,
      action: ours
        ? `Tagged ${v2Tag} but matches no cluster node pattern and no build VM row.`
        : "Not ours. Listed for visibility; left alone.",
      unaccounted: ours,
      actionable: ours,
    });
  }

  for (const nb of strayNbs) {
    findings.push({
      status: "foreign",
      kind: "nodebalancer",
      label: nb.label,
      cloudId: nb.id,
      ref: null,
      hourly: pricing.nodeBalancerHourly,
      detail: "not LKE-managed",
      action: "Not ours. Listed for visibility; left alone.",
      unaccounted: false,
      actionable: false,
    });
  }

  // NodeBalancers whose cluster is not visible to this token would otherwise
  // vanish from the report entirely — attributed to a cluster that never gets
  // iterated. Charge them explicitly.
  for (const [clusterId, nbs] of nbByCluster) {
    if (input.lkeClusters.some((c) => c.id === clusterId)) continue;
    for (const nb of nbs) {
      const ours = ourClusterIds.has(clusterId);
      findings.push({
        status: ours ? "unrecorded" : "foreign",
        kind: "nodebalancer",
        label: nb.label,
        cloudId: nb.id,
        ref: null,
        hourly: pricing.nodeBalancerHourly,
        detail: `LKE-managed by cluster ${clusterId}, which this token cannot see`,
        action: `Billing for a NodeBalancer whose cluster is not listable. Investigate.`,
        unaccounted: false,
        actionable: true,
      });
    }
  }

  // ── rows with no cloud resource ───────────────────────────────────────────

  for (const row of input.clusterRows) {
    if (seenClusterRefs.has(row.ref)) continue;
    if (row.state === "retired") continue; // correctly recorded as gone

    if (row.lke_cluster_id === null) {
      const age = ageMs(row.created_at, now);
      const stale = age !== null && age > RESERVED_STALE_MS;
      findings.push({
        status: "reserved",
        kind: "cluster-row",
        label: row.name,
        cloudId: null,
        ref: row.ref,
        hourly: 0,
        detail: `state '${row.state}', no lke_cluster_id${age === null ? "" : `, ${humanAge(age)} old`}`,
        action: stale
          ? `Reserved ${humanAge(age as number)} ago and never attached. Provisioning ` +
            `crashed between RESERVE and CREATE. Costs nothing; delete the row.`
          : "Reserved, not yet created. Costs nothing. Benign if provisioning is in flight.",
        unaccounted: false,
        actionable: stale,
      });
      continue;
    }

    findings.push({
      status: "phantom",
      kind: "cluster-row",
      label: row.name,
      cloudId: row.lke_cluster_id,
      ref: row.ref,
      hourly: 0,
      detail: `claims lke_cluster_id=${row.lke_cluster_id}, which Linode does not list`,
      action:
        `The cluster is gone but the row still says '${row.state}'. Costs nothing, but ` +
        `placement reads this table — a phantom row can be scheduled onto. Mark it retired.`,
      unaccounted: false,
      actionable: true,
    });
  }

  for (const row of input.buildVmRows) {
    if (seenVmRefs.has(row.ref)) continue;
    if (DEAD_VM_STATES.has(row.state)) continue; // correctly recorded as gone

    if (row.linode_id === null) {
      const age = ageMs(row.created_at, now);
      const stale = age !== null && age > RESERVED_STALE_MS;
      findings.push({
        status: "reserved",
        kind: "build-vm-row",
        label: row.ref,
        cloudId: null,
        ref: row.ref,
        hourly: 0,
        detail: `state '${row.state}', no linode_id${age === null ? "" : `, ${humanAge(age)} old`}`,
        action: stale
          ? `Reserved ${humanAge(age as number)} ago and never attached. The lease crashed ` +
            `between RESERVE and CREATE. Costs nothing; mark it destroyed.`
          : "Reserved, not yet leased. Costs nothing. Benign if a build is in flight.",
        unaccounted: false,
        actionable: stale,
      });
      continue;
    }

    findings.push({
      status: "phantom",
      kind: "build-vm-row",
      label: row.ref,
      cloudId: row.linode_id,
      ref: row.ref,
      hourly: 0,
      detail: `claims linode_id=${row.linode_id}, which Linode does not list`,
      action:
        `The instance is gone but the row still says '${row.state}'. Costs nothing. Mark ` +
        `it destroyed so the reaper stops considering it.`,
      unaccounted: false,
      actionable: true,
    });
  }

  // ── totals ────────────────────────────────────────────────────────────────

  const rank = (s: DriftStatus) => SEVERITY.indexOf(s);
  findings.sort((a, b) => rank(a.status) - rank(b.status) || a.label.localeCompare(b.label));

  let totalHourly = 0;
  let standingHourly = 0;
  let transientHourly = 0;
  let unaccountedHourly = 0;
  let foreignHourly = 0;
  for (const f of findings) {
    if (f.hourly === null) continue;
    if (f.status === "foreign") {
      foreignHourly += f.hourly;
    } else {
      totalHourly += f.hourly;
      if (TRANSIENT_KINDS.has(f.kind)) transientHourly += f.hourly;
      else standingHourly += f.hourly;
    }
    if (f.unaccounted) unaccountedHourly += f.hourly;
  }

  return {
    findings,
    totalHourly,
    standingHourly,
    transientHourly,
    unaccountedHourly,
    foreignHourly,
    unpriced,
    clean: findings.every((f) => !f.actionable) && unpriced.length === 0,
  };
}
