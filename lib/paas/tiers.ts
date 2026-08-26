/**
 * Instance tiers — the sizes a customer picks from, as code.
 *
 * THIS FILE IS THE SOURCE OF TRUTH. `docs/v2/05-pricing.md` documents the same
 * table for humans, and `tiers.test.ts` parses that document and fails if the
 * two disagree. A price table that exists in two places drifts, and the
 * direction it drifts is always the one nobody notices — we have spent a day on
 * exactly that class of bug.
 *
 * WHY SHARED AND DEDICATED DIFFER IN KUBERNETES TERMS, since the words are
 * marketing until they are a manifest:
 *
 *   SHARED    cpu.request is small, cpu.limit is the advertised ceiling. The app
 *             may burst up to its ceiling when the node has room, and is
 *             throttled when it does not. This is what every competitor means by
 *             "shared", and it is why shared packs densely.
 *
 *   DEDICATED cpu.request EQUALS cpu.limit. Kubernetes reserves the cycles
 *             whether or not they are used, so the app is never throttled by a
 *             neighbour — and the node can hold far fewer of them. That
 *             reservation is the entire product, and the entire reason it costs
 *             more.
 *
 * MEMORY IS ALWAYS request == limit, on both. Overcommitting memory does not
 * produce throttling, it produces an OOM kill on whichever pod happens to
 * allocate next — which may be a different tenant entirely. Memory is a promise
 * we keep exactly, never a ceiling we hope nobody reaches.
 */

export type TierClass = "shared" | "dedicated";

export interface Tier {
  /** Stable id. Stored in the database and used in manifests — never renamed. */
  id: string;
  /** What the customer sees. */
  label: string;
  cls: TierClass;
  memoryMib: number;
  /** Advertised vCPU. The ceiling on shared; the reservation on dedicated. */
  vcpu: number;
  /** Bundled outbound transfer per APP per month, not per instance. */
  transferGb: number;
  priceUsd: number;
  priceInr: number;
  /** Our all-in cost per month if the app never sleeps. See docs/v2/05-pricing.md §2. */
  costUsd: number;
}

export const TIERS: readonly Tier[] = [
  { id: "starter",  label: "Starter",  cls: "shared",    memoryMib: 512,  vcpu: 1, transferGb: 200,  priceUsd: 5,  priceInr: 449,  costUsd: 4.01 },
  { id: "basic",    label: "Basic",    cls: "shared",    memoryMib: 1024, vcpu: 1, transferGb: 300,  priceUsd: 9,  priceInr: 799,  costUsd: 7.89 },
  { id: "standard", label: "Standard", cls: "shared",    memoryMib: 2048, vcpu: 2, transferGb: 500,  priceUsd: 19, priceInr: 1699, costUsd: 15.77 },
  { id: "plus",     label: "Plus",     cls: "shared",    memoryMib: 4096, vcpu: 2, transferGb: 750,  priceUsd: 39, priceInr: 3499, costUsd: 31.54 },
  { id: "pro",      label: "Pro",      cls: "dedicated", memoryMib: 2048, vcpu: 1, transferGb: 500,  priceUsd: 29, priceInr: 2599, costUsd: 22.08 },
  { id: "pro-plus", label: "Pro Plus", cls: "dedicated", memoryMib: 4096, vcpu: 2, transferGb: 1000, priceUsd: 59, priceInr: 5299, costUsd: 47.31 },
];

export const DEFAULT_TIER = "starter";

/**
 * Instance count bounds.
 *
 * The ceiling is not arbitrary: placement reads `pod_allocated` against the LKE
 * pod cap (1,000 standard / 5,000 enterprise), and one customer should not be
 * able to consume a cluster's headroom from a dropdown.
 */
export const MIN_INSTANCES = 1;
export const MAX_INSTANCES = 10;

export function tierById(id: string): Tier | null {
  return TIERS.find((t) => t.id === id) ?? null;
}

/**
 * Resolve a tier, refusing rather than silently substituting.
 *
 * An unknown tier id must NOT fall back to the cheapest one. That would deploy a
 * customer paying for Plus onto Starter resources and report success — the
 * failure would surface as an app that OOMs under load, days later, with nothing
 * in the logs connecting it to a typo'd tier.
 */
export function requireTier(id: string): Tier {
  const t = tierById(id);
  if (!t) {
    throw new Error(
      `[paas/tiers] unknown tier ${JSON.stringify(id)} — known: ${TIERS.map((x) => x.id).join(", ")}. ` +
        "Refusing to substitute a default: that would run a paid tier on another tier's resources.",
    );
  }
  return t;
}

export function clampInstances(n: number): number {
  if (!Number.isInteger(n)) throw new Error(`[paas/tiers] instance count must be an integer, got ${n}`);
  if (n < MIN_INSTANCES || n > MAX_INSTANCES) {
    throw new Error(`[paas/tiers] instance count ${n} is outside ${MIN_INSTANCES}–${MAX_INSTANCES}`);
  }
  return n;
}

export interface K8sResources {
  requests: { cpu: string; memory: string };
  limits: { cpu: string; memory: string };
}

/**
 * The tier as Kubernetes asks for it.
 *
 * CPU is expressed in millicores so a fractional shared request stays exact —
 * `0.05` as a float is a rounding argument waiting to happen, `50m` is not.
 */
export function resourcesFor(tier: Tier): K8sResources {
  const memory = `${tier.memoryMib}Mi`;
  const limitCpu = `${tier.vcpu * 1000}m`;

  if (tier.cls === "dedicated") {
    // request == limit on both axes. This is what "dedicated" means to the
    // scheduler, and it is what makes the pod Guaranteed QoS: last to be evicted
    // under node pressure, never throttled by a neighbour.
    return {
      requests: { cpu: limitCpu, memory },
      limits: { cpu: limitCpu, memory },
    };
  }

  // Shared: a small CPU reservation so the pod is schedulable and gets a fair
  // share under contention, with the advertised ceiling as the limit. The
  // request deliberately does NOT equal the ceiling — if it did, the tier would
  // pack exactly as sparsely as dedicated and cost the same to run.
  return {
    requests: { cpu: tier.vcpu >= 2 ? "100m" : "50m", memory },
    limits: { cpu: limitCpu, memory },
  };
}

/**
 * Monthly price for a sizing choice.
 *
 * Instance count is LINEAR — the Nth instance costs the same as the first. There
 * is no volume discount because there is no volume saving: the tenth pod
 * consumes exactly what the first did. A discount not earned by a cost saving is
 * a margin giveaway wearing a bulk-pricing costume.
 */
export function priceFor(tier: Tier, instances: number): { usd: number; inr: number } {
  const n = clampInstances(instances);
  return { usd: tier.priceUsd * n, inr: tier.priceInr * n };
}

/**
 * What this sizing costs US per month if the app never sleeps.
 *
 * The always-awake case is the one that matters under flat pricing: a customer
 * can keep an app warm with a free uptime pinger, so a tier that is only
 * profitable while asleep is not profitable.
 */
export function costFor(tier: Tier, instances: number): number {
  return Math.round(tier.costUsd * clampInstances(instances) * 100) / 100;
}

export function marginPct(tier: Tier): number {
  return Math.round(((tier.priceUsd - tier.costUsd) / tier.priceUsd) * 1000) / 10;
}
