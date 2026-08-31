/**
 * Whether the sweeps are actually running — the observers watching themselves.
 *
 * WHY THIS EXISTS: everything else in this lane reports on the platform, and
 * nothing reported on the reporters. A sweep that never runs produces silence,
 * and silence is indistinguishable from a clean result. The operator surface
 * has six sections and not one of them could tell you that a sweep had been
 * failing every hour since it was installed.
 *
 * That is this lane's recurring defect turned on the lane itself: "could not
 * observe" collapsing into "observed nothing". Applied here it is worse than
 * usual, because the missing observation is the one that would have revealed
 * all the others were missing.
 *
 * THE NON-OBVIOUS FAILURE, and the reason this checks the container command as
 * well as the timestamps:
 *
 * A green tick means the sweep RAN. It does not mean a finding would be
 * reported correctly. Under the old convention a drift script exited 1 for
 * "found drift", which Kubernetes marks as a failed Job — identical to a crash.
 * A fleet of green sweeps can therefore be green only because nothing has been
 * found yet, and go red the moment anything is. So the exit-code translation is
 * checked directly in the deployed spec: a sweep without it is not healthy, it
 * is untested.
 *
 * Pure. Takes objects someone else fetched.
 */

export type SweepStatus =
  /** Ran and succeeded on its most recent schedule. */
  | "healthy"
  /** Deliberately switched off. Not a fault, but its domain is unobserved. */
  | "suspended"
  /** Exists and has never fired. The schedule may never have come round. */
  | "never-scheduled"
  /**
   * Has fired and has NEVER succeeded. Its entire domain is unobserved, and no
   * finding it would have produced has ever been seen.
   */
  | "never-succeeded"
  /** Succeeded before, but not on the most recent run. */
  | "failing"
  /** Last success is older than its own schedule allows. */
  | "overdue";

export interface CronJobLike {
  name: string;
  schedule: string;
  suspended: boolean;
  lastScheduleTime: string | null;
  lastSuccessfulTime: string | null;
  /** The deployed container command, for the exit-code translation check. */
  command: string[];
}

/**
 * How often a schedule fires, in minutes, from its minute field.
 *
 * Handles the forms these sweeps actually use — a step, a comma list, a single
 * minute — and returns null for anything else. Null means "cannot tell what
 * overdue would mean", which is reported as such; guessing an interval would
 * invent an overdue verdict or, worse, suppress a real one.
 */
export function scheduleIntervalMinutes(schedule: string): number | null {
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minute, hour] = fields;
  // Only schedules that fire every hour are handled; an hour restriction
  // changes the answer and is not parsed here.
  if (hour !== "*") return null;

  const step = /^\*\/(\d+)$/.exec(minute);
  if (step) {
    const n = Number(step[1]);
    return n > 0 && n <= 60 ? n : null;
  }
  if (/^\d+(,\d+)*$/.test(minute)) {
    const count = minute.split(",").length;
    return count > 0 ? 60 / count : null;
  }
  return null;
}

/**
 * Does the deployed command translate findings-exit-codes to success?
 *
 * Read from the deployed spec rather than from the source that built it. The
 * cluster may be running an older manifest, and the question is what the
 * cluster does — the same reason the sandbox charge is read from the live
 * RuntimeClass rather than from gvisor.ts.
 */
export function translatesFindings(command: string[]): boolean {
  const joined = command.join(" ");
  return /case\s+\$c\s+in[^)]*\b10\b/.test(joined);
}

export interface SweepHealth {
  name: string;
  status: SweepStatus;
  schedule: string;
  intervalMinutes: number | null;
  lastSuccessfulTime: string | null;
  minutesSinceSuccess: number | null;
  /**
   * True when a finding from this sweep would be reported to the scheduler as
   * a failure. Independent of status: a sweep can be green and still untested.
   */
  findingsLookLikeFailures: boolean;
  /**
   * True when nothing this sweep covers has been observed. The point of the
   * flag is that its silence must NOT be read as a clean result.
   */
  domainUnobserved: boolean;
  detail: string;
}

export function sweepHealth(job: CronJobLike, now: number): SweepHealth {
  const intervalMinutes = scheduleIntervalMinutes(job.schedule);
  const lastSuccess = job.lastSuccessfulTime ? Date.parse(job.lastSuccessfulTime) : null;
  const lastSchedule = job.lastScheduleTime ? Date.parse(job.lastScheduleTime) : null;
  const minutesSinceSuccess =
    lastSuccess !== null && Number.isFinite(lastSuccess) ? (now - lastSuccess) / 60000 : null;

  const findingsLookLikeFailures = !translatesFindings(job.command);

  const base = {
    name: job.name,
    schedule: job.schedule,
    intervalMinutes,
    lastSuccessfulTime: job.lastSuccessfulTime,
    minutesSinceSuccess,
    findingsLookLikeFailures,
  };

  if (job.suspended) {
    return {
      ...base,
      status: "suspended",
      domainUnobserved: true,
      detail: "suspended — nothing it covers is being observed, so its silence means nothing",
    };
  }

  if (lastSchedule === null) {
    return {
      ...base,
      status: "never-scheduled",
      domainUnobserved: true,
      detail: "has never fired — its schedule may not have come round yet",
    };
  }

  if (lastSuccess === null) {
    return {
      ...base,
      status: "never-succeeded",
      domainUnobserved: true,
      detail:
        "has fired and NEVER succeeded — no finding it would have produced has ever been seen, " +
        "so the absence of findings from it is not evidence of anything",
    };
  }

  if (lastSchedule > lastSuccess) {
    return {
      ...base,
      status: "failing",
      // It has succeeded before, so its domain HAS been observed — just not
      // recently. Distinct from never-succeeded, which has no history at all.
      domainUnobserved: false,
      detail: "its most recent run did not succeed; the last good result is older than the last attempt",
    };
  }

  // Overdue needs both a known cadence and a real lapse. Two intervals of grace
  // absorbs a single missed tick, which is noise rather than a fault.
  if (intervalMinutes !== null && minutesSinceSuccess !== null && minutesSinceSuccess > intervalMinutes * 2 + 5) {
    return {
      ...base,
      status: "overdue",
      domainUnobserved: false,
      detail: `last success ${minutesSinceSuccess.toFixed(0)} min ago on a ${intervalMinutes} min schedule`,
    };
  }

  return {
    ...base,
    status: "healthy",
    domainUnobserved: false,
    detail: findingsLookLikeFailures
      ? "succeeding — but it has found nothing yet, and a finding would be reported as a failure"
      : "succeeding on schedule",
  };
}

export interface SweepHealthReport {
  sweeps: SweepHealth[];
  /** Sweeps whose domain has never been observed at all. */
  unobserved: number;
  /** Sweeps where a finding would reach the scheduler as a crash. */
  untranslated: number;
  clean: boolean;
}

export function sweepHealthReport(jobs: CronJobLike[], now: number): SweepHealthReport {
  // Worst first: an operator reading three lines should see the broken one.
  const order: Record<SweepStatus, number> = {
    "never-succeeded": 0,
    failing: 1,
    overdue: 2,
    "never-scheduled": 3,
    suspended: 4,
    healthy: 5,
  };
  const sweeps = jobs.map((j) => sweepHealth(j, now)).sort((a, b) => order[a.status] - order[b.status]);

  return {
    sweeps,
    unobserved: sweeps.filter((s) => s.domainUnobserved).length,
    untranslated: sweeps.filter((s) => s.findingsLookLikeFailures).length,
    // A fleet where every finding would surface as a crash is not clean, even
    // with every sweep green. That state is exactly how this was found.
    clean: sweeps.every((s) => s.status === "healthy" && !s.findingsLookLikeFailures),
  };
}
