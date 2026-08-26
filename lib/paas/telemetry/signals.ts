/**
 * Abuse and quota signals, derived from what the meter already collects.
 *
 * DETECTION AND REPORTING ONLY. Enforcement — ResourceQuota, LimitRange,
 * suspending a tenant — is cluster-object work and belongs to whoever owns the
 * cluster. Nothing here acts. That split is deliberate: a detector that
 * enforces has to be right every time, and this one is heuristic by nature.
 * A false positive should cost someone a glance at a dashboard, not cost a
 * customer their running app.
 *
 * THE SIGNAL THAT MATTERS MOST IS `always-warm`, AND IT IS AN ECONOMICS
 * SIGNAL RATHER THAN A SECURITY ONE.
 *
 * The approved plan prices the platform on the warm fraction: always-on is
 * about $52k/month and $5.20 per app, which loses money at $5; idle-to-zero is
 * $18-20k and $2.30-$3.62. The plan then names the way that breaks — "use
 * UptimeRobot to keep your app awake" is standard advice, free, and takes a
 * customer thirty seconds. If enough tenants do it the warm fraction goes to
 * 1.0 and the business is underwater, quietly, with every individual account
 * behaving legitimately.
 *
 * The plan lists this as an open business decision: price warm time, cap free
 * warm hours, or detect and act. Whichever is chosen needs the number first,
 * and this is where the number surfaces. Reporting it is not the same as
 * having a policy for it, and this module does not pretend otherwise.
 */

export type SignalKind =
  | "warm-and-idle"
  | "always-warm"
  | "restart-storm"
  | "replica-sprawl"
  | "orphan-deployment"
  | "unterminated-build"
  | "build-storm";

export type Severity = "info" | "warn" | "critical";

export interface Signal {
  kind: SignalKind;
  severity: Severity;
  /** Project or deployment ref the signal is about. */
  subject: string;
  detail: string;
  action: string;
  /** The observed number that tripped it, and what it was compared against. */
  value: number;
  threshold: number;
}

/**
 * Defaults, all overridable. They are stated here rather than inlined so the
 * numbers can be argued with — every one of them is a guess until there is a
 * fleet to calibrate against, and a threshold nobody can find is a threshold
 * nobody revises.
 */
export interface Thresholds {
  /** Warm fraction at or above which an app costs what an always-on app costs. */
  alwaysWarm: number;
  /** Restarts within the window that indicate a crash loop rather than a blip. */
  restarts: number;
  /** Pods for one deployment beyond which sprawl is worth a look. */
  replicas: number;
  /** Distinct live deployments per project beyond which old ones are lingering. */
  deploymentsPerProject: number;
  /** Builds in the window beyond which someone is hammering the build tier. */
  builds: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  alwaysWarm: 0.95,
  restarts: 5,
  replicas: 5,
  deploymentsPerProject: 1,
  builds: 30,
};

export interface AppUsageLike {
  appKey: string;
  projectRef: string;
  warmFraction: number;
  /** True when observation gaps make the warm figure unsafe to act on. */
  degraded: boolean;
  restarts: number;
  peakPods: number;
  podSeconds: number;
  /**
   * Cores, from metrics.k8s.io. Undefined when metrics-server is not serving.
   *
   * This is what separates warm-and-serving from warm-and-idle, and that is
   * the distinction the $5 price turns on — a busy app holding a pod is a
   * customer getting value, an idle one holding a pod is the platform paying
   * for nothing. Without it, `always-warm` cannot tell them apart.
   */
  cpuCores?: number | null;
}

/**
 * Below this, an app is doing essentially nothing.
 *
 * 10 millicores is 1% of a core. Measured on the live cluster, the three
 * running apps sat at 2–3 millicores — a third of this bar — while each held
 * a full pod slot.
 */
export const IDLE_CORES = 0.01;

export interface BuildUsageLike {
  builds: number;
  /** Past their deadline with no destroyed_at. A leak. */
  overdue: number;
  /** Running, inside their deadline. Normal, and never a signal. */
  inFlight?: number;
  buildSeconds: number;
}

export interface SignalInput {
  apps: AppUsageLike[];
  builds?: BuildUsageLike;
  thresholds?: Partial<Thresholds>;
  /** Length of the window these figures cover, for phrasing. */
  windowSeconds: number;
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function hours(seconds: number): string {
  const h = seconds / 3600;
  return h >= 1 ? `${h.toFixed(1)}h` : `${(seconds / 60).toFixed(0)}m`;
}

export function detectSignals(input: SignalInput): Signal[] {
  const t = { ...DEFAULT_THRESHOLDS, ...(input.thresholds ?? {}) };
  const signals: Signal[] = [];

  for (const app of input.apps) {
    // A degraded warm figure must not raise an economics alarm: the sampler
    // having gaps is our problem, and billing or throttling a customer over
    // our own missing data is the kind of mistake that is very hard to undo.
    const warm = !app.degraded && app.warmFraction >= t.alwaysWarm;
    const idle = typeof app.cpuCores === "number" && app.cpuCores < IDLE_CORES;

    // Warm AND idle is the strongest case in this file, and it is only
    // expressible once metrics exist. An app holding a full pod slot at 0.3%
    // of a core is not a customer getting value — it is the platform paying
    // the always-on price for nothing. `always-warm` alone cannot distinguish
    // this from a genuinely busy app, and those need opposite responses.
    if (warm && idle) {
      signals.push({
        kind: "warm-and-idle",
        severity: "warn",
        subject: app.appKey,
        detail:
          `warm ${pct(app.warmFraction)} of the last ${hours(input.windowSeconds)} at ` +
          `${((app.cpuCores as number) * 1000).toFixed(0)}m CPU — holding a pod slot and ` +
          `doing essentially nothing.`,
        action:
          `The clearest scale-to-zero case there is. Under the plan's model 80% of apps ` +
          `should look like this, and each one currently costs a full always-on pod. ` +
          `A busy always-warm app is a customer to price for; this is not that.`,
        value: app.cpuCores as number,
        threshold: IDLE_CORES,
      });
    }

    if (warm && !idle) {
      signals.push({
        kind: "always-warm",
        severity: "warn",
        subject: app.appKey,
        detail:
          `warm ${pct(app.warmFraction)} of the last ${hours(input.windowSeconds)}. ` +
          `Costs what an always-on app costs, whatever the plan says it is priced at.`,
        action:
          typeof app.cpuCores === "number"
            ? `Warm and actually using CPU — a customer getting value from the pod they ` +
              `hold. This is the one to price for rather than scale to zero.`
            : `Expected while scale-to-zero is unimplemented. Without metrics this cannot ` +
              `be told apart from a warm-and-idle app, and those need opposite responses ` +
              `— one is a customer to price for, the other is the platform paying for nothing.`,
        value: app.warmFraction,
        threshold: t.alwaysWarm,
      });
    }

    if (app.restarts >= t.restarts) {
      signals.push({
        kind: "restart-storm",
        severity: app.restarts >= t.restarts * 4 ? "critical" : "warn",
        subject: app.appKey,
        detail: `${app.restarts} restarts in ${hours(input.windowSeconds)}`,
        action:
          `A crash loop consumes scheduler and image-pull capacity on a shared node ` +
          `without ever serving a request. Check the previous container's logs.`,
        value: app.restarts,
        threshold: t.restarts,
      });
    }

    if (app.peakPods > t.replicas) {
      signals.push({
        kind: "replica-sprawl",
        severity: "warn",
        subject: app.appKey,
        detail: `${app.peakPods} pods at peak`,
        action: `Confirm this is intended. LKE caps pods per cluster, and that cap is what forces a fleet.`,
        value: app.peakPods,
        threshold: t.replicas,
      });
    }
  }

  // ── deployments lingering per project ─────────────────────────────────────
  //
  // Immutable deployments mean an old one can legitimately stay warm for
  // instant rollback. It can equally mean nothing reaped it after a redeploy,
  // and the fleet reconciler will never notice: the node is recorded and the
  // cluster is recorded, so an extra pod rides along invisibly. At 10k apps,
  // one lingering pod per redeploy is the difference between the two cost
  // models in the plan.

  const byProject = new Map<string, Set<string>>();
  for (const a of input.apps) {
    if (a.podSeconds <= 0) continue;
    const set = byProject.get(a.projectRef) ?? new Set<string>();
    set.add(a.appKey);
    byProject.set(a.projectRef, set);
  }

  for (const [projectRef, deployments] of byProject) {
    if (deployments.size <= t.deploymentsPerProject) continue;
    signals.push({
      kind: "orphan-deployment",
      severity: "warn",
      subject: projectRef,
      detail: `${deployments.size} deployments running concurrently: ${[...deployments].sort().join(", ")}`,
      action:
        `Expected if an earlier revision is held warm for rollback. If not, an older ` +
        `deployment outlived its replacement and is billing for nothing.`,
      value: deployments.size,
      threshold: t.deploymentsPerProject,
    });
  }

  // ── build tier ────────────────────────────────────────────────────────────

  if (input.builds) {
    // ONLY overdue VMs. A build running inside its deadline has no
    // destroyed_at either, and firing a critical every time someone deploys is
    // how an alert becomes something people mute. `expires_at` is what tells
    // the two apart, and it is in the schema precisely for this.
    if (input.builds.overdue > 0) {
      signals.push({
        kind: "unterminated-build",
        severity: "critical",
        subject: "build tier",
        detail: `${input.builds.overdue} build VM(s) past expires_at with no destroyed_at`,
        action:
          `The reaper should have taken these and did not. The meter bills an open
           interval as zero, so this leak is invisible in revenue and shows up only on
           the Linode bill. Cross-check scripts/v3/fleet-drift.ts.`.replace(/\s+/g, " "),
        value: input.builds.overdue,
        threshold: 0,
      });
    }

    if (input.builds.builds >= t.builds) {
      signals.push({
        kind: "build-storm",
        severity: "warn",
        subject: "build tier",
        detail: `${input.builds.builds} builds in ${hours(input.windowSeconds)}, ${hours(input.builds.buildSeconds)} of VM time`,
        action:
          `Each build leases a real Linode. A push loop is a cheap way for one tenant ` +
          `to spend the platform's money.`,
        value: input.builds.builds,
        threshold: t.builds,
      });
    }
  }

  const order: Record<Severity, number> = { critical: 0, warn: 1, info: 2 };
  signals.sort((a, b) => order[a.severity] - order[b.severity] || a.subject.localeCompare(b.subject));
  return signals;
}

export interface SignalSummary {
  critical: number;
  warn: number;
  info: number;
  /** True when nothing needs attention. */
  quiet: boolean;
}

export function summarise(signals: Signal[]): SignalSummary {
  const critical = signals.filter((s) => s.severity === "critical").length;
  const warn = signals.filter((s) => s.severity === "warn").length;
  const info = signals.filter((s) => s.severity === "info").length;
  return { critical, warn, info, quiet: signals.length === 0 };
}
