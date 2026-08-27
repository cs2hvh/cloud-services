/**
 * What to do about an app whose owner cannot pay for it.
 *
 * The metering sweep already knows: `charge_project_hour` returns
 * `insufficient` when the balance will not cover the hour. Nothing acted on it,
 * so an app whose owner ran out of credit kept running indefinitely, free — the
 * mirror image of the v1 defect where apps that no longer existed kept being
 * charged.
 *
 * THE DECISION IS SEPARATED FROM THE ACT, deliberately. Stopping a customer's
 * app is destructive and easy to get wrong in a way that is expensive and
 * public. This module only decides; suspension lives behind an explicit
 * `--apply` in the sweep, the same as reaping and teardown.
 *
 * SUSPENSION MEANS SCALE TO ZERO, NEVER DELETE. A suspended app must come back
 * exactly as it was the moment the balance is topped up. Deleting anything —
 * the image, the alias, the DNS record — turns a billing problem into a
 * migration, and the customer did not stop being a customer.
 */

/**
 * How long an app keeps running after the first failed charge.
 *
 * Three days, not hours. A card expires on a weekend, an invoice sits unread, a
 * finance team takes a day to approve a top-up — none of those are reasons to
 * take a production site down, and all of them are more common than genuine
 * abandonment. The cost of being generous is bounded and small: three days of a
 * Starter app is about $0.69.
 *
 * The cost of being strict is a customer's live site going down over a payment
 * detail, which is the kind of thing people leave a platform over.
 */
export const GRACE_HOURS = 72;

export type ArrearsState =
  /** Paying normally, or never failed. */
  | "current"
  /** Failed a charge, still inside the grace window. */
  | "grace"
  /** Past the grace window. Eligible for suspension. */
  | "overdue"
  /** Cannot establish how long they have been failing. Never suspended. */
  | "unknown";

export interface ArrearsVerdict {
  state: ArrearsState;
  hoursInArrears: number | null;
  hoursRemaining: number | null;
  reason: string;
}

/**
 * How long has this project been failing to pay, and does that warrant stopping
 * it?
 *
 * `arrearsSince` is when the FIRST charge failed — not the most recent. Using
 * the most recent would reset the clock every hour the sweep ran, so an app
 * would never become overdue no matter how long it went unpaid: the grace
 * window would slide forward exactly as fast as time passed.
 *
 * An unparseable or future timestamp yields `unknown` and is NEVER suspended.
 * Same rule as the preview reaper, and for the same reason: could-not-establish
 * is not the same as established-and-bad, and here the mistake takes down a
 * paying customer's site on the strength of a corrupt field.
 */
export function assessArrears(
  arrearsSince: string | null,
  now: Date = new Date(),
  graceHours: number = GRACE_HOURS,
): ArrearsVerdict {
  // NULL means "never failed a charge". An empty or blank string does NOT.
  //
  // Lumping them together is tempting because `!arrearsSince` catches both, and
  // it is wrong in a direction that only shows up later: `current` is the state
  // that RESUMES an app, so a blank field would restart a suspended app on data
  // nobody could read. The safe reading of a blank is `unknown`, which neither
  // suspends nor resumes. A timestamptz column cannot hold `""` today; this is
  // here so that stops being load-bearing.
  if (arrearsSince === null || arrearsSince === undefined) {
    return { state: "current", hoursInArrears: null, hoursRemaining: null, reason: "No failed charge on record." };
  }
  if (typeof arrearsSince !== "string" || !arrearsSince.trim()) {
    return {
      state: "unknown",
      hoursInArrears: null,
      hoursRemaining: null,
      reason: "Blank arrears timestamp — cannot establish, so neither suspending nor resuming.",
    };
  }

  const since = Date.parse(arrearsSince);
  if (!Number.isFinite(since)) {
    return {
      state: "unknown",
      hoursInArrears: null,
      hoursRemaining: null,
      reason: `Unparseable arrears timestamp ${JSON.stringify(arrearsSince)} — not suspending.`,
    };
  }

  const hours = (now.getTime() - since) / 3_600_000;

  if (hours < 0) {
    // Clock skew, not an app that goes into arrears tomorrow.
    return {
      state: "unknown",
      hoursInArrears: hours,
      hoursRemaining: null,
      reason: `Arrears began ${Math.abs(hours).toFixed(1)}h in the future — clock skew, not suspending.`,
    };
  }

  if (hours >= graceHours) {
    return {
      state: "overdue",
      hoursInArrears: hours,
      hoursRemaining: 0,
      reason: `${hours.toFixed(1)}h unpaid, past the ${graceHours}h grace window.`,
    };
  }

  return {
    state: "grace",
    hoursInArrears: hours,
    hoursRemaining: graceHours - hours,
    reason: `${hours.toFixed(1)}h unpaid, ${(graceHours - hours).toFixed(1)}h of grace left.`,
  };
}

/** True only for a state that has been positively established as past grace. */
export function shouldSuspend(v: ArrearsVerdict): boolean {
  return v.state === "overdue";
}

/**
 * Should this project be woken back up?
 *
 * Separated from `shouldSuspend` rather than inferred as its negation, because
 * the two are not opposites. `unknown` must not suspend AND must not resume —
 * inferring resume from "not suspend" would restart an app on the strength of a
 * timestamp nobody could read, which is the same unreliable field either way.
 */
export function shouldResume(v: ArrearsVerdict): boolean {
  return v.state === "current";
}
