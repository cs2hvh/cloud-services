/**
 * What an app has actually been doing, from the samples already being taken.
 *
 * `sweep-usage-sample` has written to paas.usage_samples every fifteen minutes
 * since the platform existed — pod seconds, warm seconds, peak pods, restarts —
 * and nothing has ever read it. The data for "is my app healthy" was on disk
 * the whole time with no API and no UI in front of it.
 *
 * THE ARITHMETIC IS HERE, NOT IN THE PAGE, because it has one trap in it and a
 * page is the wrong place to get that wrong. See `uptime`.
 */

/** One row of paas.usage_samples, as this module needs it. */
export interface UsageSample {
  sampled_at: string;
  pod_seconds: number | string | null;
  warm_seconds: number | string | null;
  peak_pods: number | string | null;
  restarts: number | string | null;
  unobserved_seconds: number | string | null;
  period_seconds: number | string | null;
}

export interface HealthSummary {
  /** Samples that contributed. Zero means no data, not a healthy app. */
  samples: number;
  /** Seconds we were actually watching. The denominator for uptime. */
  observedSeconds: number;
  /** Seconds at least one pod was ready. */
  warmSeconds: number;
  /**
   * Percentage of OBSERVED time the app was serving, or null when nothing was
   * observed. Never 0 for an app nobody watched — see below.
   */
  uptimePct: number | null;
  /** Container restarts across the window. */
  restarts: number;
  /** The most pods running at once. */
  peakPods: number;
  /** Time inside the window that nobody could measure. */
  unobservedSeconds: number;
  /** From when to when. Null on an empty window. */
  from: string | null;
  to: string | null;
}

const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Summarise a window of samples.
 *
 * UPTIME EXCLUDES UNOBSERVED TIME FROM THE DENOMINATOR, and this is the whole
 * reason the arithmetic is not inlined in a page.
 *
 * A sample records `period_seconds` (how long the window was) and
 * `unobserved_seconds` (how much of it nobody could measure — the sweep was
 * down, the cluster was unreachable). Dividing warm by period would report an
 * app as 40% up because OUR sampler was down for nine hours, and the customer
 * would go looking for a fault in their application. The honest denominator is
 * the time we were actually watching.
 *
 * When nothing was observed at all, uptime is NULL rather than 0. Zero means
 * "we watched and it was down"; null means "we cannot say". Those are opposite
 * messages and collapsing them is the same bug this codebase keeps removing.
 */
export function summariseHealth(samples: readonly UsageSample[]): HealthSummary {
  let periodSeconds = 0;
  let unobserved = 0;
  let warm = 0;
  let restarts = 0;
  let peak = 0;
  let from: string | null = null;
  let to: string | null = null;

  for (const s of samples) {
    periodSeconds += num(s.period_seconds);
    unobserved += num(s.unobserved_seconds);
    warm += num(s.warm_seconds);
    restarts += num(s.restarts);
    peak = Math.max(peak, num(s.peak_pods));

    const at = s.sampled_at;
    if (typeof at === "string" && Number.isFinite(Date.parse(at))) {
      if (from === null || at < from) from = at;
      if (to === null || at > to) to = at;
    }
  }

  // Clamped at zero: a sample claiming more unobserved time than its own period
  // is corrupt, and a negative denominator would produce an uptime above 100%,
  // which reads as a bug in the app rather than in the sample.
  const observed = Math.max(0, periodSeconds - unobserved);

  return {
    samples: samples.length,
    observedSeconds: observed,
    warmSeconds: warm,
    uptimePct: observed > 0 ? Math.min(100, Math.round((warm / observed) * 1000) / 10) : null,
    restarts,
    peakPods: peak,
    unobservedSeconds: unobserved,
    from,
    to,
  };
}

/**
 * How to describe this app's health in one word.
 *
 * `unknown` is a first-class answer. An app with no samples is not healthy and
 * not unhealthy — nobody has looked — and saying "healthy" there is how a
 * dashboard becomes something people stop trusting.
 */
export function healthVerdict(h: HealthSummary): {
  state: "healthy" | "degraded" | "down" | "unknown";
  reason: string;
} {
  if (h.samples === 0 || h.uptimePct === null) {
    return { state: "unknown", reason: "No samples yet — nothing has measured this app." };
  }
  if (h.uptimePct >= 99) {
    return {
      state: "healthy",
      reason:
        h.restarts > 0
          ? `Serving ${h.uptimePct}% of observed time, with ${h.restarts} restart${h.restarts === 1 ? "" : "s"}.`
          : `Serving ${h.uptimePct}% of observed time.`,
    };
  }
  if (h.uptimePct >= 50) {
    return { state: "degraded", reason: `Serving only ${h.uptimePct}% of observed time.` };
  }
  return { state: "down", reason: `Serving ${h.uptimePct}% of observed time.` };
}

/** Seconds as something a person reads. */
export function humanDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (h < 48) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${Math.round(h / 24)}d`;
}
