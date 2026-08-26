/**
 * Turning usage samples into something that outlives the process that took
 * them.
 *
 * `usage.ts` measures. This decides what gets written down and how a period is
 * reconstructed from it, and those are separate problems with a sharp edge
 * between them:
 *
 * EVERY STORED ROW IS AN INTERVAL DELTA, NEVER A RUNNING TOTAL.
 *
 * `accumulate()` folds into a Map that carries totals forward, which is right
 * for a single process reporting at the end. Persisting those totals would be
 * a disaster: each sweep would write a row containing everything since the
 * process started, and summing rows over a period would count the first
 * interval N times. An app warm for one hour would bill for thirty.
 *
 * So the sampler accumulates into a FRESH map each interval — see
 * `sampleDelta` — and the row it writes contains only that interval's
 * contribution. Aggregation is then a plain sum, which is the property that
 * makes the period arithmetic obviously correct rather than subtly wrong.
 *
 * That is the same class of defect as v1's billing meters: not an arithmetic
 * error anyone could see, but a unit error nobody thought to check.
 *
 * Pure. No network, no clock.
 */

import { accumulate, warmFraction, type AppObservation, type UsageBucket, type WarmFraction } from "./usage.ts";

/**
 * One interval's usage for one deployment, ready to insert.
 *
 * Mirrors `paas.usage_samples`. `project_id` is nullable on purpose: several
 * running deployments currently have no paas.deployments row at all, and
 * recording their usage unattributed beats dropping it. Dropping usage for an
 * app we failed to record is the same defect as never metering it.
 */
export interface UsageSampleRow {
  sampled_at: string;
  deployment_ref: string;
  project_id: string | null;
  pod_seconds: number;
  warm_seconds: number;
  peak_pods: number;
  restarts: number;
  unobserved_seconds: number;
}

/**
 * The usage attributable to ONE interval, and nothing before it.
 *
 * Deliberately starts from an empty Map on every call. Reusing a carried-over
 * Map here is exactly the bug this module exists to prevent, and making it
 * impossible to express is better than commenting against it.
 */
export function sampleDelta(
  observations: AppObservation[],
  opts: { now: Date; previousAt: Date | null },
): Map<string, UsageBucket> {
  return accumulate(new Map(), observations, opts);
}

/**
 * Rows for one interval.
 *
 * Buckets with no measurable usage are dropped rather than written as zeros:
 * the first sample of a period always attributes zero by design, and a table
 * full of zero rows makes a gap in sampling indistinguishable from an idle
 * app. `unobservedSeconds` is kept even so, because a gap is information.
 */
export function toSampleRows(
  buckets: Map<string, UsageBucket>,
  sampledAt: Date,
  projectIdOf: (bucket: UsageBucket) => string | null = () => null,
): UsageSampleRow[] {
  const rows: UsageSampleRow[] = [];
  for (const b of buckets.values()) {
    if (b.podSeconds === 0 && b.warmSeconds === 0 && b.unobservedSeconds === 0) continue;
    rows.push({
      sampled_at: sampledAt.toISOString(),
      deployment_ref: b.appKey,
      project_id: projectIdOf(b),
      pod_seconds: Number(b.podSeconds.toFixed(3)),
      warm_seconds: Number(b.warmSeconds.toFixed(3)),
      peak_pods: b.peakPods,
      restarts: b.restarts,
      unobserved_seconds: Number(b.unobservedSeconds.toFixed(3)),
    });
  }
  return rows;
}

/** A stored row as it comes back from PostgREST — numerics arrive as strings. */
export interface StoredSample {
  sampled_at: string;
  deployment_ref: string;
  project_id: string | null;
  pod_seconds: number | string;
  warm_seconds: number | string;
  peak_pods: number;
  restarts: number;
  unobserved_seconds: number | string;
}

const num = (v: number | string): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface PeriodUsage {
  deploymentRef: string;
  projectId: string | null;
  podSeconds: number;
  warmSeconds: number;
  peakPods: number;
  restarts: number;
  unobservedSeconds: number;
  samples: number;
  firstSeen: string;
  lastSeen: string;
}

/**
 * Rebuild a period from stored deltas.
 *
 * Sums are correct precisely because rows are deltas. `peak_pods` is a maximum
 * rather than a sum — three replicas for an hour is a peak of three, not
 * three hundred — and `restarts` is a sum because each interval records only
 * what it saw.
 */
export function aggregatePeriod(
  rows: StoredSample[],
  periodStart: Date,
  periodEnd: Date,
): PeriodUsage[] {
  const byRef = new Map<string, PeriodUsage>();

  for (const r of rows) {
    const at = Date.parse(r.sampled_at);
    if (!Number.isFinite(at)) continue;
    if (at < periodStart.getTime() || at > periodEnd.getTime()) continue;

    const existing = byRef.get(r.deployment_ref);
    const current: PeriodUsage = existing ?? {
      deploymentRef: r.deployment_ref,
      projectId: r.project_id,
      podSeconds: 0,
      warmSeconds: 0,
      peakPods: 0,
      restarts: 0,
      unobservedSeconds: 0,
      samples: 0,
      firstSeen: r.sampled_at,
      lastSeen: r.sampled_at,
    };

    current.podSeconds += num(r.pod_seconds);
    current.warmSeconds += num(r.warm_seconds);
    current.unobservedSeconds += num(r.unobserved_seconds);
    current.restarts += r.restarts ?? 0;
    current.peakPods = Math.max(current.peakPods, r.peak_pods ?? 0);
    current.samples += 1;
    if (r.sampled_at < current.firstSeen) current.firstSeen = r.sampled_at;
    if (r.sampled_at > current.lastSeen) current.lastSeen = r.sampled_at;
    // A later row may carry the attribution an earlier one lacked.
    if (current.projectId === null && r.project_id !== null) current.projectId = r.project_id;

    byRef.set(r.deployment_ref, current);
  }

  return [...byRef.values()].sort((a, b) => b.podSeconds - a.podSeconds);
}

/**
 * Warm fraction over a stored period.
 *
 * Reuses the tested arithmetic in usage.ts by shaping the aggregate back into
 * a UsageBucket, so there is one implementation of the number the whole cost
 * model rests on rather than two that can drift apart.
 */
export function periodWarmFraction(usage: PeriodUsage, periodSeconds: number): WarmFraction {
  return warmFraction(
    {
      appKey: usage.deploymentRef,
      projectRef: usage.projectId ?? "",
      namespace: "",
      podSeconds: usage.podSeconds,
      warmSeconds: usage.warmSeconds,
      peakPods: usage.peakPods,
      restarts: usage.restarts,
      samples: usage.samples,
      firstSeen: usage.firstSeen,
      lastSeen: usage.lastSeen,
      unobservedSeconds: usage.unobservedSeconds,
    },
    periodSeconds,
  );
}

export interface FleetWarmSummary {
  apps: number;
  /** Mean warm fraction across apps, weighted equally per app. */
  meanFraction: number;
  alwaysWarm: number;
  /** Apps whose figure is not safe to bill from. */
  degraded: number;
  /** Total pod-seconds, the resource-cost unit. */
  podSeconds: number;
}

/**
 * The fleet-level number the plan's economics turn on.
 *
 * Weighted per APP rather than per pod-second on purpose. The plan's model is
 * a distribution over apps — "5% continuously busy, 15% warm ~30% of the day,
 * 80% warm ~2%" — so the question is what share of apps are warm, not what
 * share of compute. Weighting by pod-seconds would let a handful of busy apps
 * hide a fleet that is otherwise correctly scaling to zero, or the reverse.
 */
export function fleetWarmSummary(usage: PeriodUsage[], periodSeconds: number): FleetWarmSummary {
  if (usage.length === 0) {
    return { apps: 0, meanFraction: 0, alwaysWarm: 0, degraded: 0, podSeconds: 0 };
  }

  const fractions = usage.map((u) => periodWarmFraction(u, periodSeconds));
  return {
    apps: usage.length,
    meanFraction: fractions.reduce((n, f) => n + f.fraction, 0) / fractions.length,
    alwaysWarm: fractions.filter((f) => f.alwaysWarm).length,
    degraded: fractions.filter((f) => f.degraded).length,
    podSeconds: usage.reduce((n, u) => n + u.podSeconds, 0),
  };
}
