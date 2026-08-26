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

// ── reading the claim out of the doc ────────────────────────────────────────

export interface DensityClaim {
  podLabel: string;
  podBytes: number;
  pods: number;
  costUsd: number;
}

export interface PricingClaim {
  nodeType: string;
  usableClaimGb: number;
  rows: DensityClaim[];
}

/**
 * Parse the pod-density table out of 05-pricing.md.
 *
 * PARSED RATHER THAN TRANSCRIBED, and the difference matters. A hand-copied
 * constant is a second copy of a fact, and this lane has now shipped stale
 * prose three times for exactly that reason — tests compare code to code, and
 * nothing compares a sentence to the world. Reading the doc makes the doc the
 * single copy, so correcting it moves the checker with it.
 *
 * Returns null — never a partial or empty table — when the shape is not
 * recognised. A caller must treat that as "could not read the claim" and refuse
 * to run, because an empty claim list compares clean against anything and would
 * report a table it never actually read as verified. That is this lane's
 * recurring defect, and it would be at its most convincing here.
 *
 * The doc writes tier sizes as "512 MB". They denote Kubernetes quantities —
 * the Starter tier is `512Mi` in manifests — so they are read as binary.
 */
export function parseDensityTable(markdown: string): PricingClaim | null {
  // The heading line carries the shape and the usable claim together:
  // | Pod RAM | On `g6-standard-16` (60 GB usable) | $/pod/mo |
  const header = /\|\s*Pod RAM\s*\|\s*On\s*`([^`]+)`\s*\(([\d.]+)\s*GB usable\)\s*\|/.exec(markdown);
  if (!header) return null;

  const nodeType = header[1];
  const usableClaimGb = Number(header[2]);
  if (!Number.isFinite(usableClaimGb)) return null;

  const rows: DensityClaim[] = [];
  // Rows follow the header until the first blank line. Anything between that
  // does not parse as a row aborts the whole read rather than being skipped:
  // a silently dropped row is a claim that never gets checked.
  //
  // Resume from the end of the header LINE, not the end of the matched text —
  // the match stops at the last column it needs, and the trailing cells would
  // otherwise be read as the first row and end the loop before it began.
  const lineEnd = markdown.indexOf("\n", header.index);
  if (lineEnd === -1) return null;
  const after = markdown.slice(lineEnd + 1);
  for (const line of after.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") break;
    if (!trimmed.startsWith("|")) break;
    if (/^\|[\s|:-]+\|$/.test(trimmed)) continue; // the |---|---| separator

    const cells = trimmed.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) return null;

    const size = /^([\d.]+)\s*(MB|GB|Mi|Gi)$/.exec(cells[0]);
    // Pod counts may carry an italic annotation: "110 *(kubelet cap binds)*".
    const pods = /^(\d+)/.exec(cells[1]);
    const cost = /\$\s*([\d.]+)/.exec(cells[2]);
    if (!size || !pods || !cost) return null;

    const n = Number(size[1]);
    const unit = size[2].startsWith("M") ? 1024 ** 2 : 1024 ** 3;
    rows.push({
      podLabel: cells[0],
      podBytes: n * unit,
      pods: Number(pods[1]),
      costUsd: Number(cost[1]),
    });
  }

  return rows.length > 0 ? { nodeType, usableClaimGb, rows } : null;
}

/**
 * Monthly price of a node shape, from the cost-floor table in the same doc.
 *
 * Same contract: null rather than a guess. Pricing the fleet against an
 * invented node price would be the most expensive possible way to be confident.
 */
export function parseNodePrice(markdown: string, nodeType: string): number | null {
  const escaped = nodeType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const row = new RegExp(`\\|\\s*\`${escaped}\`\\s*\\|[^|]*\\|[^|]*\\|\\s*\\*\\*\\$([\\d,.]+)\\*\\*`).exec(markdown);
  if (!row) return null;
  const n = Number(row[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
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
