/**
 * Whether a reap plan is fit for a human to act on.
 *
 * THIS NEVER AUTHORISES A DELETION. It can only refuse one. The licence to
 * delete comes from a person who read a report; this exists so that the report
 * is worth reading, and so that a plan produced by a broken classifier is
 * stopped before it reaches them rather than after.
 *
 * WHY IT IS IN THIS LANE AND NOT BESIDE THE CLASSIFIER. `previews.ts` decides
 * what is reapable and the deploy lane owns it. This checks that decision from
 * outside, and the value is entirely in it being outside: a classifier cannot
 * catch the bug that makes it classify everything the same way, because the bug
 * is in the thing doing the catching. Two lanes enforcing one invariant
 * independently is the only version of this that survives a mistake in either.
 *
 * A preview reaper deletes RUNNING ENVIRONMENTS. R2 reaping destroys the only
 * account of how an app was built, which was bad enough; this destroys the app.
 * So the checks below are deliberately paranoid, and every one of them refuses
 * rather than warns.
 *
 * THE SIGNATURE OF A BROKEN CLASSIFIER IS NOT A STRANGE ANSWER, IT IS A
 * UNIFORM ONE. Date parsing that returns NaN makes everything look ancient;
 * a field rename makes everything look ageless. Neither produces an obviously
 * wrong entry — both produce a confident, complete, entirely uniform plan. That
 * is what `reapsEverything` is for, and it is why "the plan looks reasonable"
 * is not a check.
 *
 * Pure. Takes a plan someone else produced.
 */

/** One thing a classifier proposes to destroy. */
export interface ReapCandidateLike {
  /** What it is, in whatever identifier the caller reports findings under. */
  ref: string;
  /**
   * How old, in hours. NULL MEANS UNKNOWN and unknown is never reapable —
   * this is the one place in the codebase where could-not-observe collapsing
   * into observed-nothing destroys a running environment rather than producing
   * a wrong report.
   */
  ageHours: number | null;
  reason?: string;
}

/** One thing the classifier decided to leave alone, and why. */
export interface ReapKeepLike {
  ref: string;
  reason?: string;
}

export interface ReapPlanLike {
  reap: ReapCandidateLike[];
  keep: ReapKeepLike[];
  /** How many candidates the classifier actually looked at. */
  examined: number;
}

export type RefusalKind =
  /** The classifier looked at nothing. An empty reap list means nothing was read. */
  | "examined-nothing"
  /** reap + keep does not account for examined. Something fell out of the plan. */
  | "plan-does-not-close"
  /** Everything examined is proposed for deletion — the shape of a broken rule. */
  | "reaps-everything"
  /** A candidate with unknown age. Unknown is never old enough. */
  | "unknown-age"
  /** A candidate younger than the TTL. The classifier contradicted its own rule. */
  | "under-ttl"
  /** A candidate dated in the future. Clock skew, not a preview from tomorrow. */
  | "future-dated"
  /** A keep with no reason. The classifier did not decide, it defaulted. */
  | "unexplained-keep";

export interface Refusal {
  kind: RefusalKind;
  detail: string;
  /** Which entries triggered it, for a human to look at directly. */
  refs: string[];
}

export interface ReapSafety {
  /**
   * True only when nothing below objected. Still not permission — it means the
   * plan is coherent enough that a person can judge it.
   */
  safeToReview: boolean;
  refusals: Refusal[];
  examined: number;
  proposed: number;
  kept: number;
}

/**
 * Above this fraction of everything examined, a reap plan is treated as a
 * classifier failure rather than a fleet of dead previews.
 *
 * Not 1.0. A rule that reaps 95% of what it sees is already far likelier to be
 * broken than right, and the cost of being wrong here is asymmetric: refusing a
 * genuine mass-cleanup costs a second look, while accepting a broken one
 * deletes running environments.
 */
export const REAP_FRACTION_CEILING = 0.9;

export function checkReapPlan(plan: ReapPlanLike, ttlHours: number): ReapSafety {
  const refusals: Refusal[] = [];
  const proposed = plan.reap.length;
  const kept = plan.keep.length;

  // Nothing examined. An empty reap list then means "could not look", not
  // "nothing to reap", and the two must not produce the same report.
  if (plan.examined <= 0) {
    refusals.push({
      kind: "examined-nothing",
      detail: "the classifier examined nothing — an empty plan here means it could not look, not that nothing is reapable",
      refs: [],
    });
  }

  // Entries must be accounted for. A plan that loses items has a bug whose
  // other effects are unknown, so its remaining conclusions are not usable.
  if (plan.examined > 0 && proposed + kept !== plan.examined) {
    refusals.push({
      kind: "plan-does-not-close",
      detail: `${proposed} reap + ${kept} keep does not account for ${plan.examined} examined`,
      refs: [],
    });
  }

  if (plan.examined > 0 && proposed / plan.examined >= REAP_FRACTION_CEILING && proposed > 1) {
    refusals.push({
      kind: "reaps-everything",
      detail:
        `${proposed} of ${plan.examined} examined are proposed for deletion — a rule that reaps ` +
        `almost everything it sees is likelier broken than right`,
      refs: plan.reap.slice(0, 5).map((c) => c.ref),
    });
  }

  // Per-candidate checks. These duplicate what previews.ts promises, on
  // purpose: the promise is the thing being verified, and a module cannot
  // verify its own invariant.
  const unknown = plan.reap.filter((c) => c.ageHours === null || !Number.isFinite(c.ageHours));
  if (unknown.length > 0) {
    refusals.push({
      kind: "unknown-age",
      detail: `${unknown.length} candidate(s) have no readable age — unknown is never old enough to delete`,
      refs: unknown.map((c) => c.ref),
    });
  }

  const future = plan.reap.filter((c) => c.ageHours !== null && Number.isFinite(c.ageHours) && c.ageHours < 0);
  if (future.length > 0) {
    refusals.push({
      kind: "future-dated",
      detail: `${future.length} candidate(s) are dated in the future — that is clock skew, not an old preview`,
      refs: future.map((c) => c.ref),
    });
  }

  const young = plan.reap.filter(
    (c) => c.ageHours !== null && Number.isFinite(c.ageHours) && c.ageHours >= 0 && c.ageHours < ttlHours,
  );
  if (young.length > 0) {
    refusals.push({
      kind: "under-ttl",
      detail: `${young.length} candidate(s) are younger than the ${ttlHours}h TTL — the classifier contradicted its own rule`,
      refs: young.map((c) => c.ref),
    });
  }

  // A keep without a reason is a default, not a decision, and the difference
  // matters: an item kept because a rule said so is safe, an item kept because
  // nothing classified it is unexamined and may be reapable next run for
  // reasons nobody chose.
  const unexplained = plan.keep.filter((k) => !k.reason || k.reason.trim() === "");
  if (unexplained.length > 0) {
    refusals.push({
      kind: "unexplained-keep",
      detail: `${unexplained.length} kept item(s) carry no reason — kept by default is not kept by decision`,
      refs: unexplained.map((k) => k.ref),
    });
  }

  return { safeToReview: refusals.length === 0, refusals, examined: plan.examined, proposed, kept };
}

/**
 * A reap candidate as a FINDING, kept separate from its disposition.
 *
 * The distinction r2-drift had to learn: "this looks reapable" and "this should
 * be deleted" are different claims, and collapsing them is what turns a report
 * into a licence. An orphaned build log was a finding and never garbage; a
 * preview past its TTL is a finding and never automatically doomed — the
 * customer may be mid-review of it.
 */
export interface ReapFinding {
  ref: string;
  ageHours: number | null;
  /** Why the classifier put it on the list. */
  reason: string;
  /**
   * Whether anything may act on it. Always false here: this lane observes, and
   * the deletion lives in the deploy lane behind a human.
   */
  actionable: false;
}

export function findingsFrom(plan: ReapPlanLike): ReapFinding[] {
  return plan.reap
    .map((c) => ({
      ref: c.ref,
      ageHours: c.ageHours,
      reason: c.reason ?? "no reason recorded",
      actionable: false as const,
    }))
    // Oldest first, unknown age last — an unreadable age is not an extreme
    // value at either end, and sorting it as one would put the entries that
    // must never be reaped at the top of the list a human reads.
    .sort((a, b) => (b.ageHours ?? -Infinity) - (a.ageHours ?? -Infinity));
}
