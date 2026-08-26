/**
 * How many tenant pods actually fit on a node — measured, then extrapolated,
 * with the boundary between those two stated.
 *
 * WHY THIS EXISTS: every margin in 05-pricing.md rests on a pod-density table
 * that was DERIVED rather than measured. The deploy lane said so plainly and
 * asked for it to be checked, which is the right instinct — a price computed
 * from an estimate is a guess wearing a decimal point.
 *
 * THE THING THE ESTIMATE MISSES IS THE KUBELET, and it is not small.
 *
 * A node does not offer its RAM to pods. The kubelet reserves a slice for the
 * OS, itself, and the eviction threshold BEFORE any pod is scheduled, and that
 * reservation is tiered — proportionally huge on small nodes and still
 * material on large ones. Measured on this cluster's `g6-standard-4`:
 *
 *   capacity     8,138,636 Ki   (Linode sells it as "8 GB")
 *   allocatable  6,147,980 Ki
 *   reserved     1,990,656 Ki   = 1.90 GiB, or 24.5% of capacity
 *
 * The pricing table allows "4 GB per node for system overhead (Cilium, gVisor
 * installer, metrics, DaemonSets)" — which describes SYSTEM PODS. Those are a
 * different deduction, and on this cluster they request 0.89 GiB across both
 * nodes. The kubelet's cut comes first and is larger.
 *
 * So the two deductions are stacked here rather than merged, because
 * conflating them is what produces a usable figure that is too high.
 *
 * Pure. No network.
 */

/**
 * The kubelet's memory reservation, by the standard tiered formula.
 *
 * 25% of the first 4 GB, 20% of the next 4, 10% of the next 8, 6% of the rest,
 * plus a 100 MiB eviction threshold.
 *
 * THIS IS THE EXTRAPOLATION, AND IT IS THE WEAK LINK. It reproduces the
 * observed 1.90 GiB on an 8 GB node to within the eviction threshold, which is
 * good evidence it is the formula LKE uses — but "matches at one point" is not
 * "verified across the range". Any figure this produces for a node size we do
 * not run is derived, and `nodeDensity` labels it as such rather than letting
 * it pass as measurement.
 */
export function kubeletReservedBytes(capacityBytes: number): number {
  const GB = 1024 ** 3;
  const tiers: Array<[number, number]> = [
    [4 * GB, 0.25],
    [4 * GB, 0.2],
    [8 * GB, 0.1],
    [Infinity, 0.06],
  ];

  let remaining = capacityBytes;
  let reserved = 0;
  for (const [size, rate] of tiers) {
    if (remaining <= 0) break;
    const slice = Math.min(remaining, size);
    reserved += slice * rate;
    remaining -= slice;
  }
  return reserved + 100 * 1024 ** 2; // eviction threshold
}

export interface NodeFacts {
  /** What the node reports, in bytes. */
  capacityBytes: number;
  /** What the node reports as schedulable, in bytes. Null when extrapolating. */
  allocatableBytes: number | null;
  /** kubelet's own ceiling. 110 by default and it binds more often than RAM. */
  maxPods: number;
}

export interface DensityInput {
  node: NodeFacts;
  /** Memory a tenant pod requests. */
  podBytes: number;
  /** Per-pod sandbox overhead — the gVisor sentry. */
  sentryBytes: number;
  /** Memory system pods request ON THIS NODE. */
  systemPodBytes: number;
}

export interface Density {
  /** Bytes left for tenant pods after the kubelet and system pods. */
  usableBytes: number;
  /** How many fit by RAM alone. */
  byMemory: number;
  /** The actual answer: whichever ceiling binds first. */
  pods: number;
  /** Which limit decided it — the distinction that decides whether RAM matters. */
  boundBy: "kubelet-cap" | "memory";
  /**
   * True when allocatable was MEASURED from a live node, false when the
   * kubelet's cut was derived from the formula.
   */
  measured: boolean;
}

export function nodeDensity(input: DensityInput): Density {
  const { node, podBytes, sentryBytes, systemPodBytes } = input;

  const measured = node.allocatableBytes !== null;
  const allocatable = node.allocatableBytes ?? node.capacityBytes - kubeletReservedBytes(node.capacityBytes);

  const usableBytes = Math.max(0, allocatable - systemPodBytes);
  const perPod = podBytes + sentryBytes;
  const byMemory = perPod > 0 ? Math.floor(usableBytes / perPod) : 0;

  const pods = Math.min(byMemory, node.maxPods);
  return {
    usableBytes,
    byMemory,
    pods,
    boundBy: pods === node.maxPods && node.maxPods <= byMemory ? "kubelet-cap" : "memory",
    measured,
  };
}

/** Monthly cost of one tenant pod at a given density. */
export function costPerPod(nodeMonthlyUsd: number, pods: number): number | null {
  return pods > 0 ? nodeMonthlyUsd / pods : null;
}

export interface DensityComparison {
  podLabel: string;
  claimedPods: number;
  actualPods: number;
  claimedCostUsd: number;
  actualCostUsd: number | null;
  /** Positive means the real world fits FEWER pods than the table claims. */
  shortfall: number;
  /** Fractional cost error. Positive means the table understates cost. */
  costErrorPct: number | null;
  boundBy: Density["boundBy"];
  measured: boolean;
}

/**
 * Compare a claimed density row against a computed one.
 *
 * Reports the direction explicitly, because it is the whole point: a table
 * that OVERSTATES density understates cost per pod, which inflates every
 * margin downstream of it. An error in the other direction is money left on
 * the table and nothing worse.
 */
export function compareDensity(
  claim: { podLabel: string; podBytes: number; pods: number; costUsd: number },
  density: Density,
  nodeMonthlyUsd: number,
): DensityComparison {
  const actualCost = costPerPod(nodeMonthlyUsd, density.pods);
  return {
    podLabel: claim.podLabel,
    claimedPods: claim.pods,
    actualPods: density.pods,
    claimedCostUsd: claim.costUsd,
    actualCostUsd: actualCost,
    shortfall: claim.pods - density.pods,
    costErrorPct: actualCost === null ? null : (actualCost - claim.costUsd) / claim.costUsd,
    boundBy: density.boundBy,
    measured: density.measured,
  };
}
