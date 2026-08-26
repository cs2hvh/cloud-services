/**
 * What a sweep's exit code means, so a scheduler can act on it.
 *
 * WRITTEN BECAUSE 1 MEANT TWO OPPOSITE THINGS.
 *
 * Every drift script exited `clean ? 0 : 1`, and also exited 1 when it could
 * not reach its dependency. So a sweep that ran perfectly and found drift was
 * indistinguishable from one that never got started. The deploy lane hit this
 * the moment CronJobs began reading these codes: there is no alerting rule you
 * can write on that, because "the platform has drift" and "the observer is
 * broken" need opposite responses and arrived as the same number.
 *
 * It is this lane's recurring defect wearing its smallest costume — could-not-
 * observe and observed-something collapsed into one value.
 *
 * THE CONTRACT:
 *
 *   0   Ran, and there is nothing to report.
 *   1   COULD NOT RUN. A dependency was unreachable or a precondition failed.
 *       Nothing was measured. Alert on this — it means the observer is down,
 *       and silence from it afterwards proves nothing.
 *   2   The tool itself is not trustworthy: a self-check failed, or input was
 *       refused. Also alert, and separately — 1 says the world was unreachable,
 *       2 says the instrument is wrong.
 *  10   Ran successfully and FOUND something. This is the tool working. A
 *       scheduler should surface it, not treat it as a failure.
 *  11   Ran successfully and found something URGENT — currently only a
 *       claimable hostname, which any tenant can capture by naming it.
 *
 * The gap between 2 and 10 is deliberate: codes under 10 are about the RUN,
 * codes from 10 up are about the WORLD. A new "could not" reason gets 3, a new
 * finding severity gets 12, and neither collides.
 */

/** Ran, nothing to report. */
export const EXIT_CLEAN = 0;

/**
 * Could not run — dependency unreachable, precondition failed, nothing
 * measured. Distinct from "ran and found nothing", which is 0.
 */
export const EXIT_CANNOT_RUN = 1;

/** The instrument is wrong: self-check failed, or input refused. */
export const EXIT_UNTRUSTWORTHY = 2;

/** Ran and found something. The tool working, not failing. */
export const EXIT_FINDINGS = 10;

/** Ran and found something that can be exploited before anyone reads a report. */
export const EXIT_URGENT = 11;

/** Human-readable, for a script to print beside its own exit. */
export function describeExit(code: number): string {
  switch (code) {
    case EXIT_CLEAN:
      return "clean";
    case EXIT_CANNOT_RUN:
      return "could not run — nothing was measured";
    case EXIT_UNTRUSTWORTHY:
      return "the tool is not trustworthy — self-check failed or input refused";
    case EXIT_FINDINGS:
      return "findings — the tool ran and found something";
    case EXIT_URGENT:
      return "URGENT findings";
    default:
      return `unrecognised exit code ${code}`;
  }
}

/** True when the code means the observer failed rather than the world. */
export function isObserverFailure(code: number): boolean {
  return code === EXIT_CANNOT_RUN || code === EXIT_UNTRUSTWORTHY;
}
