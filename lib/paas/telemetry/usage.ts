/**
 * Usage metering — the input billing will eventually read.
 *
 * WHAT V1 DID, WHICH THIS DELIBERATELY DOES NOT:
 *
 *   Bandwidth metering ran only when a customer opened their own dashboard
 *   page. An app nobody visited was never metered and never billed. Collection
 *   here is a pure function over a SAMPLE, and the sampler runs on a schedule
 *   with no reference to anyone looking at anything. Nothing in this file can
 *   be reached from a page render.
 *
 *   It metered pod-level network bytes, so a customer's own database traffic
 *   and package-registry pulls were billed as if they were web traffic. There
 *   is deliberately NO bandwidth figure in this module. The only honest source
 *   is the gateway, which sees requests to the app and nothing else; a pod's
 *   counters cannot distinguish a user download from an npm install. Metering
 *   the wrong number confidently is worse than not metering it, because an
 *   invoice built on it looks correct.
 *
 * WHY WARM-SECONDS IS THE HEADLINE NUMBER. The approved plan puts the whole
 * business case on the warm fraction: always-on costs about $52k/month and
 * $5.20 per app, which loses money at $5; idle-to-zero costs $18–20k and
 * $2.30–$3.62. The difference is entirely how much of the day a pod is warm,
 * and the plan says plainly that this is unmeasured and that customers can
 * force it to 1.0 with a free uptime pinger. This module measures it. It needs
 * no metrics-server — pod phase and container start time come from the core
 * API — so the number the economics depend on is available today.
 *
 * SAMPLING IS AN APPROXIMATION AND SAYS SO. Everything here is a Riemann sum
 * over discrete observations. The limitations are named in `UsageBucket` rather
 * than hidden, because a meter whose error is undocumented gets treated as
 * exact by whoever writes the invoice.
 *
 * Pure. No network, no clock of its own.
 */

/** Attribution beyond this from a single interval is a guess, not a measurement. */
export const MAX_ATTRIBUTION_SECONDS = 15 * 60;

export interface PodObservation {
  podName: string;
  /** When the current container instance started. Null when not yet running. */
  startedAt: string | null;
  restarts: number;
}

export interface AppObservation {
  /** Stable identity for accumulation. The deployment ref. */
  appKey: string;
  projectRef: string;
  deploymentRef: string;
  namespace: string;
  /** RUNNING pods only. A Pending or Succeeded pod consumes no runtime. */
  pods: PodObservation[];
}

export interface UsageBucket {
  appKey: string;
  projectRef: string;
  namespace: string;

  /**
   * Σ over pods of seconds spent running. This is the resource-cost unit: two
   * pods for an hour is two pod-hours, and costs twice one pod for an hour.
   */
  podSeconds: number;

  /**
   * Seconds during which the app had AT LEAST ONE running pod. This is the
   * warm fraction's numerator, and it is deliberately not podSeconds — an app
   * scaled to three replicas is not three times as warm, it is warm once.
   */
  warmSeconds: number;

  peakPods: number;
  restarts: number;
  samples: number;

  firstSeen: string;
  lastSeen: string;

  /**
   * Seconds this bucket could NOT observe, because the sampler was down or an
   * interval exceeded MAX_ATTRIBUTION_SECONDS. Under-billing, always — time is
   * dropped rather than guessed. Surface it: a period with a large gap is not
   * safe to invoice from.
   */
  unobservedSeconds: number;
}

function emptyBucket(o: AppObservation, at: string): UsageBucket {
  return {
    appKey: o.appKey,
    projectRef: o.projectRef,
    namespace: o.namespace,
    podSeconds: 0,
    warmSeconds: 0,
    peakPods: 0,
    restarts: 0,
    samples: 0,
    firstSeen: at,
    lastSeen: at,
    unobservedSeconds: 0,
  };
}

const secondsBetween = (a: Date, b: Date) => (a.getTime() - b.getTime()) / 1000;

export interface AccumulateOptions {
  now: Date;
  /**
   * When the previous sample was taken. Null on the first sample of a period,
   * which therefore attributes ZERO — time before measurement began was not
   * observed and must not be billed, however long the pod has actually been up.
   */
  previousAt: Date | null;
}

/**
 * Fold one observation into the running totals.
 *
 * Per-pod attribution is `min(interval, now - startedAt)`. The min is what
 * makes a pod that started halfway through an interval bill for half of it
 * rather than all of it — and, because a restart moves `startedAt` forward, it
 * also stops a crash-looping pod being billed for time it spent dead.
 */
export function accumulate(
  buckets: Map<string, UsageBucket>,
  observations: AppObservation[],
  opts: AccumulateOptions,
): Map<string, UsageBucket> {
  const { now, previousAt } = opts;
  const nowIso = now.toISOString();

  const rawInterval = previousAt === null ? 0 : Math.max(0, secondsBetween(now, previousAt));
  const interval = Math.min(rawInterval, MAX_ATTRIBUTION_SECONDS);
  const gap = rawInterval - interval;

  for (const o of observations) {
    const bucket = buckets.get(o.appKey) ?? emptyBucket(o, nowIso);

    const running = o.pods.length;
    let warmThisInterval = 0;

    for (const p of o.pods) {
      let seconds = interval;
      if (p.startedAt) {
        const since = Math.max(0, secondsBetween(now, new Date(p.startedAt)));
        // NaN from an unparseable timestamp must not poison the total.
        if (Number.isFinite(since)) seconds = Math.min(interval, since);
      }
      bucket.podSeconds += seconds;
      warmThisInterval = Math.max(warmThisInterval, seconds);
    }

    bucket.warmSeconds += warmThisInterval;
    bucket.peakPods = Math.max(bucket.peakPods, running);
    bucket.restarts = Math.max(
      bucket.restarts,
      o.pods.reduce((n, p) => n + (p.restarts ?? 0), 0),
    );
    bucket.samples += 1;
    bucket.lastSeen = nowIso;
    bucket.unobservedSeconds += gap;

    buckets.set(o.appKey, bucket);
  }

  return buckets;
}

export interface WarmFraction {
  appKey: string;
  projectRef: string;
  /** 0..1 — the share of the period the app was warm. */
  fraction: number;
  warmSeconds: number;
  periodSeconds: number;
  /** True when observation gaps make the figure unsafe to bill from. */
  degraded: boolean;
  /**
   * Warm essentially all period. The plan names this as the thing that breaks
   * the unit economics, and a free uptime pinger produces it deliberately.
   */
  alwaysWarm: boolean;
}

/** Above this, an app is warm often enough to cost what an always-on app costs. */
export const ALWAYS_WARM_THRESHOLD = 0.95;

export function warmFraction(bucket: UsageBucket, periodSeconds: number): WarmFraction {
  const period = Math.max(1, periodSeconds);
  const observed = Math.max(0, period - bucket.unobservedSeconds);
  // Divide by what was actually observed, not by the nominal period. Dividing
  // by the period after a sampler outage reports a low warm fraction for an app
  // that may have been warm throughout, and that error flatters the cost model.
  const denominator = Math.max(1, observed);
  const fraction = Math.min(1, bucket.warmSeconds / denominator);

  return {
    appKey: bucket.appKey,
    projectRef: bucket.projectRef,
    fraction,
    warmSeconds: bucket.warmSeconds,
    periodSeconds: period,
    degraded: bucket.unobservedSeconds > period * 0.05,
    alwaysWarm: fraction >= ALWAYS_WARM_THRESHOLD,
  };
}

// ── build minutes ───────────────────────────────────────────────────────────

export interface BuildVmLifetime {
  ref: string;
  deployment_id: string | null;
  created_at: string;
  destroyed_at: string | null;
  instance_type: string;
}

export interface BuildUsage {
  builds: number;
  /** Exact, not sampled — these come from recorded timestamps. */
  buildSeconds: number;
  /** Builds with no destroyed_at. Either in flight, or leaked. */
  unterminated: number;
  longestSeconds: number;
}

/**
 * Build time from recorded VM lifetimes.
 *
 * Exact rather than sampled, because paas.build_vms records both ends. A row
 * with no destroyed_at contributes NOTHING: it is either a build in flight, or
 * a leak the fleet reconciler will report, and billing an open-ended interval
 * would turn a leaked VM into an unbounded invoice.
 */
export function buildUsage(rows: BuildVmLifetime[], periodStart: Date, periodEnd: Date): BuildUsage {
  let builds = 0;
  let buildSeconds = 0;
  let unterminated = 0;
  let longestSeconds = 0;

  for (const r of rows) {
    const started = new Date(r.created_at);
    if (!Number.isFinite(started.getTime())) continue;
    if (started < periodStart || started > periodEnd) continue;

    builds += 1;
    if (!r.destroyed_at) {
      unterminated += 1;
      continue;
    }
    const ended = new Date(r.destroyed_at);
    if (!Number.isFinite(ended.getTime())) continue;

    const seconds = Math.max(0, secondsBetween(ended, started));
    buildSeconds += seconds;
    longestSeconds = Math.max(longestSeconds, seconds);
  }

  return { builds, buildSeconds, unterminated, longestSeconds };
}

// ── turning observations into what a sampler stores ─────────────────────────

export interface PodLike {
  metadata: { name: string; namespace: string; labels?: Record<string, string> };
  status?: {
    phase?: string;
    containerStatuses?: Array<{
      restartCount?: number;
      state?: { running?: { startedAt?: string } };
    }>;
  };
}

/**
 * Group a namespace's pods into per-app observations.
 *
 * Only Running pods are counted. A Pending pod consumes scheduling attention
 * but no runtime, and a Succeeded pod — the publisher jobs in ahura-system are
 * the live example — has finished and must not accrue seconds forever.
 */
export function observeNamespace(
  namespace: string,
  projectRef: string,
  pods: PodLike[],
  deploymentRefOf: (pod: PodLike) => string,
): AppObservation[] {
  const byApp = new Map<string, AppObservation>();

  for (const p of pods) {
    if (p.status?.phase !== "Running") continue;

    const deploymentRef = deploymentRefOf(p);
    const appKey = deploymentRef;
    const statuses = p.status?.containerStatuses ?? [];

    const observation = byApp.get(appKey) ?? {
      appKey,
      projectRef,
      deploymentRef,
      namespace,
      pods: [],
    };

    observation.pods.push({
      podName: p.metadata.name,
      startedAt: statuses.find((c) => c.state?.running?.startedAt)?.state?.running?.startedAt ?? null,
      restarts: statuses.reduce((n, c) => n + (c.restartCount ?? 0), 0),
    });

    byApp.set(appKey, observation);
  }

  return [...byApp.values()];
}

/**
 * The deployment a pod belongs to, from its label, falling back to its name.
 *
 * Kubernetes names a Deployment's pods `<deployment>-<replicaset>-<pod>`, so
 * stripping two trailing segments recovers the Deployment name. v1 used `name`
 * as the primary key of all infrastructure addressing with no uniqueness
 * constraint, which the audit traced to three separate critical findings — so
 * this prefers an explicit label and treats the name as a fallback only.
 */
export function deploymentRefFromPod(pod: PodLike): string {
  const labelled = pod.metadata.labels?.["ahura.cloud/deployment"];
  if (labelled) return labelled;
  return pod.metadata.name.split("-").slice(0, -2).join("-") || pod.metadata.name;
}
