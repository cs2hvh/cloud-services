/**
 * Preview lifetime.
 *
 * THE POLICY (docs/v2/05-pricing.md §7): free, 48 hours from last push,
 * Starter-sized regardless of the app's tier, always one instance.
 *
 * The three levers were chosen together because free-and-unbounded is the abuse
 * vector and no single one closes it. Free is what makes the feature worth
 * having. The expiry bounds accumulation. Starter-sizing bounds what each one
 * costs — which is what stops "free preview" meaning "free 4 GB container".
 *
 * WHY TIME AND NOT THE DELETE EVENT. The obvious trigger is the branch-deleted
 * webhook, and it is the wrong one. A webhook is a message that can be missed —
 * GitHub retries a few times and stops — and a preview whose only cleanup path
 * is an event nobody received runs free forever. Worse, it fails silently: the
 * container keeps serving, nothing errors, and the only symptom is a bill.
 *
 * Time needs no event to have arrived. A sweep that has never seen a single
 * webhook still reaps correctly, and a delete event that DOES arrive is an
 * optimisation rather than the mechanism.
 *
 * The clock runs from the LAST PUSH, not from creation. A branch someone is
 * actively working on should not have its preview vanish mid-review.
 */

export const PREVIEW_TTL_HOURS = 48;

/** Every preview runs Starter resources and one instance, whatever the project holds. */
export const PREVIEW_TIER = "starter";
export const PREVIEW_INSTANCES = 1;

export interface PreviewAlias {
  ref: string;
  hostname: string;
  projectRef: string;
  /** When the branch was last pushed — the deployment this alias points at. */
  lastPushAt: string | null;
}

export type ReapVerdict =
  | { reap: true; ageHours: number; reason: string }
  | { reap: false; ageHours: number | null; reason: string };

/**
 * Should this preview be reaped?
 *
 * A null or unparseable timestamp is NEVER reaped. That direction is deliberate
 * and it is the expensive one: keeping a preview nobody needed costs cents,
 * while deleting one whose age we could not establish destroys a running
 * environment someone may be reviewing. "We do not know how old this is" is not
 * "this is old" — the same distinction this codebase keeps everywhere, in the
 * one place where getting it wrong is destructive rather than merely misleading.
 */
export function shouldReap(alias: PreviewAlias, now: Date = new Date()): ReapVerdict {
  if (!alias.lastPushAt) {
    return { reap: false, ageHours: null, reason: "no last-push timestamp — cannot establish age, so not reaping" };
  }
  const then = Date.parse(alias.lastPushAt);
  if (!Number.isFinite(then)) {
    return { reap: false, ageHours: null, reason: `unparseable timestamp ${JSON.stringify(alias.lastPushAt)} — not reaping` };
  }

  const ageHours = (now.getTime() - then) / 3_600_000;

  // A timestamp in the future means a clock disagreement somewhere, not a
  // preview from tomorrow. Refusing is safe; the next sweep will get it once
  // the clocks agree.
  if (ageHours < 0) {
    return { reap: false, ageHours, reason: `last push is ${Math.abs(ageHours).toFixed(1)}h in the future — clock skew, not reaping` };
  }

  return ageHours >= PREVIEW_TTL_HOURS
    ? { reap: true, ageHours, reason: `${ageHours.toFixed(1)}h since last push, past the ${PREVIEW_TTL_HOURS}h limit` }
    : { reap: false, ageHours, reason: `${ageHours.toFixed(1)}h old, ${(PREVIEW_TTL_HOURS - ageHours).toFixed(1)}h remaining` };
}

export interface ReapPlan {
  reap: PreviewAlias[];
  keep: Array<{ alias: PreviewAlias; reason: string }>;
  /**
   * How many aliases were considered. A plan that examined nothing and a
   * platform with no previews produce the same empty `reap` list, and only this
   * tells them apart.
   */
  examined: number;
}

export function planReap(aliases: PreviewAlias[], now: Date = new Date()): ReapPlan {
  const plan: ReapPlan = { reap: [], keep: [], examined: aliases.length };
  for (const a of aliases) {
    const v = shouldReap(a, now);
    if (v.reap) plan.reap.push(a);
    else plan.keep.push({ alias: a, reason: v.reason });
  }
  return plan;
}

/**
 * May this alias be deleted by the reaper?
 *
 * The last gate before a DELETE, and deliberately the dumbest one: it asks only
 * what the row says it is, not what the plan believed. The plan is built from
 * preview environments, so a production alias reaching here should be
 * impossible — which is exactly why it is checked. The cost of "impossible"
 * happening once is a customer's production hostname, and an assertion costs
 * nothing.
 *
 * Missing is refused, not skipped: a row that vanished between plan and apply is
 * a race, and racing a delete is how the wrong thing gets deleted.
 */
export function mayReap(row: { kind: string } | null | undefined): { ok: boolean; reason: string } {
  if (!row) return { ok: false, reason: "alias row vanished between plan and apply" };
  if (row.kind !== "branch") return { ok: false, reason: `kind is ${row.kind}, NOT branch` };
  return { ok: true, reason: "branch alias" };
}
