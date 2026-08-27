/**
 * What a hostname's request pattern says about whether anyone is using it.
 *
 * THE PLAN NAMES THIS AS THE BUSINESS RISK, not a nice-to-have. The v2 cost
 * model is a ~5x gap between ~$52k/month always-on and ~$18-20k idle-to-zero,
 * and the plan states plainly that customers can force the warm fraction to
 * 1.0 with a free uptime pinger — "use UptimeRobot to keep your app awake" is
 * standard advice and takes thirty seconds. It lists warm-time pricing as an
 * open business decision.
 *
 * That decision needs the number, and the number is not CPU. An app being
 * pinged is warm, running, and using almost no CPU — indistinguishable from a
 * quiet app that a real person visits twice an hour, unless you look at the
 * SHAPE of the traffic rather than its volume.
 *
 * A pinger is regular. Organic traffic is bursty. That difference survives
 * being small.
 *
 * THIS DESCRIBES A PATTERN. IT DOES NOT PROVE INTENT. A cron job hitting a
 * customer's own health endpoint looks identical to a monitoring service, and
 * both look identical to a genuinely periodic workload. Nothing here should
 * ever throttle or bill on its own — it exists so a policy conversation has a
 * measurement under it instead of an assumption.
 *
 * Pure. No network, no clock.
 */

/** One reading of a monotonically increasing counter. */
export interface TrafficReading {
  /** Epoch milliseconds. */
  at: number;
  /** Cumulative requests, as Traefik reports them. */
  cumulative: number;
}

export interface Interval {
  /** Requests in this interval. */
  requests: number;
  /** Seconds the interval covers. */
  seconds: number;
  /** The counter went backwards, so this interval's volume is unknown. */
  reset: boolean;
}

/**
 * Turn cumulative readings into per-interval deltas.
 *
 * A COUNTER THAT WENT BACKWARDS IS A RESET, NEVER ZERO TRAFFIC. Traefik
 * restarting zeroes every router counter at once, and reading "no increase,
 * therefore idle" would mark the entire fleet idle in a single pass — the
 * infrastructure lane nearly shipped exactly that, and had written a test
 * documenting it as acceptable before spotting it.
 *
 * The interval spanning a reset is marked `reset` and excluded from the shape
 * analysis rather than counted as quiet. Its traffic genuinely is unknown:
 * the counter's pre-restart value is gone.
 */
export function toIntervals(readings: TrafficReading[]): Interval[] {
  const out: Interval[] = [];

  for (let i = 1; i < readings.length; i += 1) {
    const prev = readings[i - 1];
    const cur = readings[i];
    const seconds = (cur.at - prev.at) / 1000;
    if (!(seconds > 0)) continue; // out of order or duplicate timestamps

    if (cur.cumulative < prev.cumulative) {
      out.push({ requests: 0, seconds, reset: true });
      continue;
    }
    out.push({ requests: cur.cumulative - prev.cumulative, seconds, reset: false });
  }

  return out;
}

export type TrafficShape = "no-traffic" | "organic" | "keep-alive-shaped" | "undetermined";

export interface TrafficVerdict {
  shape: TrafficShape;
  /** Requests across every usable interval. */
  requests: number;
  /** Seconds of usable observation. */
  observedSeconds: number;
  requestsPerHour: number;
  /**
   * Spread of per-interval rates, as a coefficient of variation.
   *
   * Near zero means every interval saw the same number of requests, which is
   * what an automated pinger produces and what human traffic essentially
   * never does. Null when there is not enough to compute one.
   */
  regularity: number | null;
  /** Intervals discarded because a counter reset spanned them. */
  resets: number;
  reason: string;
}

/**
 * Below this, an app is not carrying meaningful traffic.
 *
 * 120/hour, not 60, and the difference is the whole point. A monitor hitting
 * a URL every 60 seconds — the canonical keep-alive, and the default on most
 * paid uptime tiers — produces EXACTLY 60 requests/hour. A `< 60` bound puts
 * the most common case in the world precisely on the wrong side of the line
 * and classifies it organic.
 *
 * Caught by a test using the obvious example rather than a convenient one —
 * and the first fix moved the bug up one step, because a 30-second pinger
 * lands exactly on 120. That is not a coincidence to patch around: pingers
 * run on round intervals and therefore produce round rates, so ANY exclusive
 * bound has a canonical case sitting precisely on it.
 *
 * So the comparison is INCLUSIVE. 120/hour covers every common keep-alive
 * interval — 30s, 60s, 5 minutes — and a real app sustaining two requests a
 * minute every single minute is still extremely quiet. The regularity check
 * has to agree before anything is flagged either way.
 */
export const QUIET_REQUESTS_PER_HOUR = 120;

/**
 * Coefficient of variation below which traffic is suspiciously even.
 *
 * A monitor hitting every 60s produces near-zero spread. Real traffic — even
 * a handful of visits — clusters, so its spread is high. 0.35 is comfortably
 * above what a pinger produces and comfortably below organic bursts; it is a
 * declared threshold rather than a tuned one, and it is stated here so
 * disagreeing with it is a code change someone signs.
 */
export const KEEP_ALIVE_REGULARITY = 0.35;

/** Fewer usable intervals than this and no shape can be claimed. */
export const MIN_INTERVALS = 4;

/**
 * Classify a hostname's traffic.
 *
 * ONE READING IS NEVER ENOUGH, and neither are two. Every app looks idle
 * immediately after a gateway restart, and a shape claim from a handful of
 * points is noise wearing a verdict's clothes. Under MIN_INTERVALS this
 * returns `undetermined`, which is a refusal rather than a finding.
 */
export function classifyTraffic(readings: TrafficReading[]): TrafficVerdict {
  const intervals = toIntervals(readings);
  const resets = intervals.filter((i) => i.reset).length;
  const usable = intervals.filter((i) => !i.reset);

  const requests = usable.reduce((n, i) => n + i.requests, 0);
  const observedSeconds = usable.reduce((n, i) => n + i.seconds, 0);
  const requestsPerHour = observedSeconds > 0 ? (requests / observedSeconds) * 3600 : 0;

  const base = { requests, observedSeconds, requestsPerHour, resets };

  if (usable.length < MIN_INTERVALS) {
    return {
      ...base,
      shape: "undetermined",
      regularity: null,
      reason:
        `${usable.length} usable interval(s), fewer than ${MIN_INTERVALS}` +
        (resets ? ` (${resets} discarded to counter resets)` : "") +
        `. Not enough to claim a shape — every app looks idle right after a gateway restart.`,
    };
  }

  if (requests === 0) {
    return {
      ...base,
      shape: "no-traffic",
      regularity: null,
      reason: `no requests across ${(observedSeconds / 60).toFixed(0)} minutes of observation.`,
    };
  }

  // Rate per interval, not raw count — intervals are not guaranteed equal, and
  // comparing counts across uneven windows manufactures variance that is not
  // in the traffic.
  const rates = usable.map((i) => i.requests / i.seconds);
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  const variance = rates.reduce((a, r) => a + (r - mean) ** 2, 0) / rates.length;
  const regularity = mean > 0 ? Math.sqrt(variance) / mean : null;

  const quiet = requestsPerHour <= QUIET_REQUESTS_PER_HOUR;
  const even = regularity !== null && regularity < KEEP_ALIVE_REGULARITY;

  if (quiet && even) {
    return {
      ...base,
      shape: "keep-alive-shaped",
      regularity,
      reason:
        `${requestsPerHour.toFixed(1)} requests/hour arriving at a near-constant rate ` +
        `(spread ${(regularity as number).toFixed(2)}). That is the shape of an automated ` +
        `keep-alive, not of people. It describes a pattern and not an intent.`,
    };
  }

  return {
    ...base,
    shape: "organic",
    regularity,
    reason: even
      ? `${requestsPerHour.toFixed(0)} requests/hour — even, but too much volume to be a keep-alive.`
      : `${requestsPerHour.toFixed(1)} requests/hour arriving unevenly (spread ${(regularity ?? 0).toFixed(2)}), ` +
        `which is what human traffic looks like.`,
  };
}

/**
 * What this means for the app's pod.
 *
 * The join that makes the measurement worth having: warmth costs money, and
 * only traffic says whether the money is buying anything.
 */
export function warmthJustified(shape: TrafficShape): {
  justified: boolean | null;
  note: string;
} {
  switch (shape) {
    case "organic":
      return {
        justified: true,
        note: "warm and serving people — a customer getting value from the pod they hold.",
      };
    case "keep-alive-shaped":
      return {
        justified: false,
        note:
          "warm because something is pinging it. This is the case the plan names as breaking " +
          "the cost model: the pod costs the always-on price and the requests keeping it up " +
          "are not usage. A pricing or policy answer, not a technical one.",
      };
    case "no-traffic":
      return {
        justified: false,
        note: "warm and serving nobody — the clearest scale-to-zero candidate there is.",
      };
    default:
      return { justified: null, note: "not enough observation to say." };
  }
}
