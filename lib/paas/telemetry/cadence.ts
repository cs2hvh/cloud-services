/**
 * Can this sampling cadence actually produce the measurement it is collecting
 * for?
 *
 * WRITTEN BECAUSE A SCHEDULE OF MINE COULD NOT, AND SAID NOTHING.
 *
 * The 15-minute sweep ran `usage-sample --samples 2`. Two samples is ONE
 * interval, and traffic shape needs four before it will claim anything. So the
 * scheduled job wrote usage rows every fifteen minutes, forever, while the
 * traffic half silently never appeared — and the only symptom would have been
 * a column that was always blank, which reads exactly like an app with no
 * traffic.
 *
 * The classifier was right to refuse. The collector was wrong to keep
 * collecting without mentioning that half its output was structurally
 * impossible.
 *
 * That is the same defect as everything else in this lane, one level up: not a
 * wrong measurement, but a measurement that cannot happen presenting as one
 * that happened and found nothing. A tool should know what its own settings
 * can produce.
 *
 * Pure. No network, no clock.
 */

import { MIN_INTERVALS } from "./traffic.ts";

export interface SamplingPlan {
  /** Observations taken, not intervals. N samples yield N-1 intervals. */
  samples: number;
  intervalSeconds: number;
}

export interface CadenceVerdict {
  /** N-1. The first sample establishes a baseline and measures nothing. */
  intervals: number;
  /** Wall-clock seconds the run covers. */
  windowSeconds: number;
  /** What this cadence is capable of yielding, before any data arrives. */
  yields: {
    usageRows: boolean;
    warmFraction: boolean;
    trafficShape: boolean;
  };
  /** Stated in the tool's own output, not left to be discovered. */
  warnings: string[];
  /** True when at least one measurement is structurally impossible. */
  degraded: boolean;
}

/**
 * A warm fraction over this little time describes a moment, not a habit.
 *
 * Not a hard floor — the number is real, and proving the meter works on a
 * two-minute run is a legitimate thing to do. But the plan's economics turn on
 * the shape of a DAY, and a figure from ninety seconds being read as that is a
 * mistake the tool can pre-empt by saying so.
 */
export const SHORT_WINDOW_SECONDS = 300;

export function checkCadence(plan: SamplingPlan): CadenceVerdict {
  const samples = Math.trunc(plan.samples);
  const intervals = Math.max(0, samples - 1);
  const windowSeconds = intervals * Math.max(0, plan.intervalSeconds);

  const warnings: string[] = [];

  // One sample is a baseline and nothing else. The first sample of any period
  // attributes zero by design, so a single-sample run writes no rows at all —
  // and would look like a fleet using no resources.
  const usageRows = intervals >= 1;
  if (!usageRows) {
    warnings.push(
      `--samples ${samples} yields no intervals. The first sample establishes a baseline ` +
        `and attributes zero, so this run cannot write a single usage row. It will ` +
        `complete successfully and record nothing.`,
    );
  }

  const trafficShape = intervals >= MIN_INTERVALS;
  if (!trafficShape) {
    warnings.push(
      `--samples ${samples} yields ${intervals} interval(s); traffic shape needs ` +
        `${MIN_INTERVALS}. Every hostname will report "undetermined", which is the ` +
        `classifier refusing correctly — but this cadence can never produce a verdict, ` +
        `so collecting for one is wasted. Use --samples ${MIN_INTERVALS + 1} or more.`,
    );
  }

  if (usageRows && windowSeconds > 0 && windowSeconds < SHORT_WINDOW_SECONDS) {
    warnings.push(
      `the window is ${windowSeconds}s. The warm fraction it produces is real but ` +
        `describes a moment rather than a habit, and the plan's economics turn on the ` +
        `shape of a day. Proof the meter works, not the number the decision needs.`,
    );
  }

  return {
    intervals,
    windowSeconds,
    yields: { usageRows, warmFraction: usageRows, trafficShape },
    warnings,
    degraded: !usageRows || !trafficShape,
  };
}

/**
 * The smallest sample count that can produce every measurement.
 *
 * Exposed so a scheduler can be configured from the requirement rather than
 * from a number someone picked, which is how the mis-tuned job happened.
 */
export function minimumSamples(): number {
  return MIN_INTERVALS + 1;
}
