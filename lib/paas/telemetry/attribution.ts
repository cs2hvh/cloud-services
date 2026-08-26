/**
 * What each app costs us against what its tier pays, and whether it is shaped
 * like the tier it is on.
 *
 * WHY THIS IS THE ABUSE SIGNAL NOW. Under warm-time pricing, an app that ran
 * hot paid more, so consumption and revenue moved together. Flat pricing breaks
 * that link deliberately: the customer pays the same whether the app sleeps or
 * pins its ceiling all month. That is a good product and it means the only
 * thing separating a profitable app from an unprofitable one is a measurement
 * nobody is otherwise taking.
 *
 * THREE DIFFERENT THINGS GO WRONG AND THEY ARE NOT THE SAME FINDING:
 *
 *   TIER DRIFT       the pods deployed do not match the tier billed. Either we
 *                    are giving away resources or a paying customer is running
 *                    on less than they bought. Both are wrong; they are wrong
 *                    for opposite people, so the direction is reported.
 *   INSTANCE DRIFT   running pod count differs from `instance_count`. Same
 *                    shape, at the other axis of the price.
 *   OUTGROWN TIER    the app is within its limits and sustainedly near them.
 *                    Not a fault at all — shared CPU is sold as burstable, so
 *                    using it is the product working. It is a signal that the
 *                    app wants dedicated, which is a sales conversation before
 *                    it is an abuse one.
 *
 * MEMORY IS NOT AN ABUSE VECTOR HERE and it is worth saying why, since it is
 * the axis pricing is built on: memory request equals limit on every tier, so
 * an app cannot consume more than it reserved — it gets OOM-killed instead. The
 * exploitable axis is CPU on the shared tiers, where the request is 50m and the
 * ceiling is 1000m. An app sitting at its ceiling consumes twenty times what it
 * reserves, pays the shared price, and takes those cycles from its neighbours.
 *
 * Pure. No network.
 */

import type { Tier } from "../tiers.ts";
import { resourcesFor } from "../tiers.ts";
import { parseQuantity } from "./metrics.ts";

/**
 * Sustained CPU at or above this fraction of the tier's ceiling means the app
 * is living at its limit rather than bursting to it.
 *
 * Deliberately high. Bursting is the product; only sustained occupancy of the
 * ceiling says the tier is wrong for the workload.
 */
export const OUTGROWN_CPU_FRACTION = 0.8;

/** Memory this close to the limit is worth naming — the next allocation OOMs. */
export const MEMORY_PRESSURE_FRACTION = 0.9;

export interface AppObserved {
  projectRef: string;
  /** What they are billed for. */
  tier: Tier;
  instanceCount: number;
  /** Pods actually running for this project. */
  runningPods: number;
  /**
   * Memory each pod requests, in bytes. Null when it could not be read — which
   * is not the same as a pod that requests nothing.
   */
  podMemoryBytes: number | null;
  /** CPU limit per pod, in cores. Null when unread. */
  podCpuLimitCores: number | null;
  /** Observed CPU across all this app's pods, in cores. Null when unread. */
  usedCpuCores: number | null;
  /** Observed memory across all this app's pods, in bytes. Null when unread. */
  usedMemoryBytes: number | null;
  /** Pods whose usage could not be read at all. */
  unreadablePods: number;
}

export type AttributionKind = "tier-drift" | "instance-drift" | "outgrown-tier" | "memory-pressure" | "unobserved";

export interface AttributionFinding {
  kind: AttributionKind;
  projectRef: string;
  detail: string;
  /**
   * Which way it cuts. `platform` means it costs us, `customer` means they are
   * getting less than they bought, `neither` means it is informational.
   *
   * Collapsing these would be the expensive simplification: "deployed pods do
   * not match the tier" is a refund in one direction and a leak in the other.
   */
  against: "platform" | "customer" | "neither";
}

export interface AppAttribution {
  projectRef: string;
  tierId: string;
  instanceCount: number;
  runningPods: number;
  /** What this app is billed, per month. */
  priceUsd: number;
  /** What it costs us at its tier's measured density, per month. */
  costUsd: number;
  /** Price minus cost. Negative means we lose money on it every month. */
  marginUsd: number;
  /** Fraction of its CPU ceiling actually in use. Null when unread. */
  cpuUtilisation: number | null;
  /** Fraction of its memory reservation in use. Null when unread. */
  memoryUtilisation: number | null;
  findings: AttributionFinding[];
}

export function attributeApp(app: AppObserved): AppAttribution {
  const { tier, projectRef } = app;
  const findings: AttributionFinding[] = [];

  const priceUsd = tier.priceUsd * app.instanceCount;
  const costUsd = tier.costUsd * app.instanceCount;

  // What the tier says the pods should look like, from the same function that
  // builds the manifests — so this cannot drift from what is deployed by
  // disagreeing about the tier's own definition.
  const want = resourcesFor(tier);
  const wantMemory = parseQuantity(want.requests.memory);
  const wantCpuLimit = parseQuantity(want.limits.cpu);

  if (app.podMemoryBytes === null) {
    findings.push({
      kind: "unobserved",
      projectRef,
      detail: "pod memory request could not be read — cannot confirm the deployed shape matches the tier",
      against: "neither",
    });
  } else if (wantMemory !== null && app.podMemoryBytes !== wantMemory) {
    const short = app.podMemoryBytes < wantMemory;
    findings.push({
      kind: "tier-drift",
      projectRef,
      detail:
        `pods request ${(app.podMemoryBytes / 1024 ** 2).toFixed(0)}Mi, ` +
        `tier ${tier.id} specifies ${(wantMemory / 1024 ** 2).toFixed(0)}Mi`,
      // Short-changing a paying customer and over-provisioning them are both
      // defects, but only one of them is theirs to be angry about.
      against: short ? "customer" : "platform",
    });
  }

  if (app.runningPods !== app.instanceCount) {
    const fewer = app.runningPods < app.instanceCount;
    findings.push({
      kind: "instance-drift",
      projectRef,
      detail: `${app.runningPods} pod(s) running, billed for ${app.instanceCount}`,
      against: fewer ? "customer" : "platform",
    });
  }

  // Utilisation is per-pod, not fleet-summed: an app with three pods at 10%
  // each is not a 30% app, and summing would invent an outgrown tier out of
  // ordinary horizontal scaling.
  const perPodCpu =
    app.usedCpuCores !== null && app.runningPods > 0 ? app.usedCpuCores / app.runningPods : null;
  const perPodMemory =
    app.usedMemoryBytes !== null && app.runningPods > 0 ? app.usedMemoryBytes / app.runningPods : null;

  const cpuUtilisation =
    perPodCpu !== null && app.podCpuLimitCores !== null && app.podCpuLimitCores > 0
      ? perPodCpu / app.podCpuLimitCores
      : null;
  const memoryUtilisation =
    perPodMemory !== null && app.podMemoryBytes !== null && app.podMemoryBytes > 0
      ? perPodMemory / app.podMemoryBytes
      : null;

  if (app.unreadablePods > 0 || cpuUtilisation === null) {
    findings.push({
      kind: "unobserved",
      projectRef,
      detail:
        app.unreadablePods > 0
          ? `${app.unreadablePods} pod(s) reported no usage — consumption is understated by whatever they use`
          : "no usage reading — this app's consumption is unknown, not low",
      against: "neither",
    });
  }

  if (cpuUtilisation !== null && cpuUtilisation >= OUTGROWN_CPU_FRACTION) {
    findings.push({
      kind: "outgrown-tier",
      projectRef,
      detail:
        `sustained ${(cpuUtilisation * 100).toFixed(0)}% of its CPU ceiling — living at the limit ` +
        `rather than bursting to it, on a ${tier.cls} tier`,
      // Not a fault: burst is what shared is sold as. It costs us in cycles
      // taken from neighbours, so it counts against the platform.
      against: "platform",
    });
  }

  if (memoryUtilisation !== null && memoryUtilisation >= MEMORY_PRESSURE_FRACTION) {
    findings.push({
      kind: "memory-pressure",
      projectRef,
      detail: `using ${(memoryUtilisation * 100).toFixed(0)}% of its memory reservation — the next allocation OOMs`,
      // Their app dies, not ours. Memory is request==limit, so this cannot
      // spill onto a neighbour.
      against: "customer",
    });
  }

  return {
    projectRef,
    tierId: tier.id,
    instanceCount: app.instanceCount,
    runningPods: app.runningPods,
    priceUsd,
    costUsd: Math.round(costUsd * 100) / 100,
    marginUsd: Math.round((priceUsd - costUsd) * 100) / 100,
    cpuUtilisation,
    memoryUtilisation,
    findings,
  };
}

export interface FleetAttribution {
  apps: AppAttribution[];
  /** Monthly revenue across observed apps. */
  priceUsd: number;
  /** Monthly cost across observed apps. */
  costUsd: number;
  marginUsd: number;
  /** Apps whose price does not cover their cost. */
  unprofitable: number;
  /** Apps with at least one finding that is not merely informational. */
  withFindings: number;
  /** Apps carrying an `unobserved` finding — their consumption is unknown. */
  unobserved: number;
}

export function attributeFleet(apps: AppAttribution[]): FleetAttribution {
  const round = (n: number) => Math.round(n * 100) / 100;
  const priceUsd = apps.reduce((n, a) => n + a.priceUsd, 0);
  const costUsd = apps.reduce((n, a) => n + a.costUsd, 0);

  return {
    // Worst margin first. An app losing money every month is the one to see.
    apps: [...apps].sort((a, b) => a.marginUsd - b.marginUsd),
    priceUsd: round(priceUsd),
    costUsd: round(costUsd),
    marginUsd: round(priceUsd - costUsd),
    unprofitable: apps.filter((a) => a.marginUsd < 0).length,
    withFindings: apps.filter((a) => a.findings.some((f) => f.kind !== "unobserved")).length,
    unobserved: apps.filter((a) => a.findings.some((f) => f.kind === "unobserved")).length,
  };
}
