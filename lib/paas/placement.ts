/**
 * Placement accounting — how full is each cluster, really.
 *
 * THE BUG THIS FIXES
 *
 * `paas.clusters.pod_allocated` was read in five places and written by none. It
 * had `default 0` and no code path ever incremented it, so placement believed
 * every cluster was empty. app-deploy-3 found it live: 0 recorded against 5
 * pods running.
 *
 * DERIVED, NOT COUNTED
 *
 * The obvious fix — increment on deploy, decrement on teardown — is the wrong
 * one. A counter maintained by every code path is a counter that drifts the
 * first time a path is added, a delete fails halfway, or a pod is evicted by
 * something that is not us. It is the same shape as conditional apply: correct
 * only while everyone remembers.
 *
 * So this derives the number from the cluster on every sweep. Drift becomes
 * impossible rather than unlikely, and a wrong value self-heals on the next
 * pass instead of needing a manual correction.
 *
 * WHY NON-TERMINAL, NOT RUNNING
 *
 * A Pending pod has already claimed its slot against the LKE pod cap. Counting
 * only Running would undercount exactly during a rollout — the moment placement
 * is most likely to be asked for a decision — and undercounting is the
 * dangerous direction: it schedules onto a cluster that is fuller than the
 * record says, and LKE enforces the cap hard.
 */

import { clusters, db, type ClusterRow } from "./db.ts";

/** Pod phases that no longer hold capacity. Everything else counts. */
const TERMINAL = new Set(["Succeeded", "Failed"]);

export interface PodCount {
  total: number;
  byPhase: Record<string, number>;
}

interface PodList {
  items?: Array<{ status?: { phase?: string }; metadata?: { deletionTimestamp?: string } }>;
}

interface NodeList {
  items?: Array<{ status?: { allocatable?: { pods?: string } } }>;
}

/**
 * What the NODES can actually hold, which is not the same as the LKE cluster
 * limit and is usually much smaller.
 *
 * The dev cluster was recorded at 1000 (the LKE standard control-plane cap)
 * while holding two nodes of 110 pods each. Placement therefore believed it had
 * 977 free slots on a cluster with room for 197 — a fourfold overcommit, in the
 * direction that fails hard because the kubelet simply refuses the pod.
 *
 * Effective capacity is the smaller of the two limits. Derived per sweep, so
 * adding a node raises it without anyone remembering to.
 */
export function nodePodCapacity(list: NodeList): number {
  let sum = 0;
  for (const n of list.items ?? []) {
    const v = Number.parseInt(n.status?.allocatable?.pods ?? "0", 10);
    if (Number.isFinite(v)) sum += v;
  }
  return sum;
}

/**
 * Count pods that currently hold capacity on a cluster.
 *
 * Pods with a deletionTimestamp are excluded: they are draining and their slot
 * is being returned. Counting them would overcount during every rollout, and
 * overcounting refuses placements that would have succeeded.
 */
export function countHoldingPods(list: PodList): PodCount {
  const byPhase: Record<string, number> = {};
  let total = 0;
  for (const p of list.items ?? []) {
    const phase = p.status?.phase ?? "Unknown";
    if (p.metadata?.deletionTimestamp) continue;
    if (TERMINAL.has(phase)) continue;
    byPhase[phase] = (byPhase[phase] ?? 0) + 1;
    total++;
  }
  return { total, byPhase };
}

export interface AllocationSync {
  clusterRef: string;
  recorded: number;
  observed: number | null;
  changed: boolean;
  /** True when the cluster holds more pods than pod_capacity claims. */
  overCapacity: boolean;
  capacity: number;
  error?: string;
}

/**
 * Bring one cluster's pod_allocated in line with the cluster itself.
 *
 * ON READ FAILURE THIS WRITES NOTHING. Recording 0 because the API was
 * unreachable would tell placement the cluster is empty at exactly the moment
 * we cannot see it — turning a transient outage into an overcommit. A stale
 * number is recoverable; a confidently wrong zero is not.
 */
export async function syncPodAllocation(
  cluster: ClusterRow,
  k: { get: <T>(path: string, tolerateMissing?: boolean) => Promise<T | null> },
  opts: { dryRun?: boolean } = {},
): Promise<AllocationSync> {
  const base: AllocationSync = {
    clusterRef: cluster.ref,
    recorded: cluster.pod_allocated,
    observed: null,
    changed: false,
    overCapacity: false,
    capacity: cluster.pod_capacity,
  };

  let list: PodList | null;
  let nodes: NodeList | null;
  try {
    [list, nodes] = await Promise.all([
      k.get<PodList>("/api/v1/pods?limit=5000", false),
      k.get<NodeList>("/api/v1/nodes", false),
    ]);
  } catch (e) {
    return { ...base, error: (e as Error).message };
  }
  if (!list) return { ...base, error: "pod list returned nothing" };

  const { total } = countHoldingPods(list);

  // Effective capacity: the nodes may hold far less than the LKE cluster cap.
  // Only lower it to something we actually observed — a node list we could not
  // read must never shrink capacity to zero.
  const fromNodes = nodes ? nodePodCapacity(nodes) : 0;
  const effectiveCapacity = fromNodes > 0 ? Math.min(cluster.pod_capacity, fromNodes) : cluster.pod_capacity;
  const capacityChanged = effectiveCapacity !== cluster.pod_capacity;

  const overCapacity = total > effectiveCapacity;
  const changed = total !== cluster.pod_allocated || capacityChanged;

  const result: AllocationSync = {
    ...base, observed: total, changed, overCapacity, capacity: effectiveCapacity,
  };
  if (!changed || opts.dryRun) return result;

  const patch: Record<string, number> = { pod_allocated: total };
  if (capacityChanged) patch.pod_capacity = effectiveCapacity;
  await db.update<ClusterRow>("clusters", `ref=eq.${cluster.ref}`, patch);
  return result;
}

/** Sync every ready cluster. One unreachable cluster must not stop the others. */
export async function syncAllPodAllocations(
  clientFor: (c: ClusterRow) => { get: <T>(path: string, tolerateMissing?: boolean) => Promise<T | null> } | null,
  opts: { dryRun?: boolean } = {},
): Promise<AllocationSync[]> {
  const all = (await clusters.list()).filter((c) => c.state === "ready");
  const out: AllocationSync[] = [];
  for (const c of all) {
    const k = clientFor(c);
    if (!k) {
      out.push({
        clusterRef: c.ref, recorded: c.pod_allocated, observed: null, changed: false,
        overCapacity: false, capacity: c.pod_capacity, error: "no kubeconfig for this cluster",
      });
      continue;
    }
    out.push(await syncPodAllocation(c, k, opts));
  }
  return out;
}

/**
 * Headroom for placement. Returns null when the cluster's allocation could not
 * be established, so a caller must decide explicitly rather than receiving a
 * number that looks like capacity.
 */
export function headroom(c: ClusterRow): number {
  return Math.max(0, c.pod_capacity - c.pod_allocated);
}
