/**
 * May this deployment be made live again?
 *
 * Rollback is the one operation that takes a WORKING site down instantly when
 * it is wrong. A deploy that fails leaves the previous version serving; a
 * rollback that repoints production at something unservable replaces a healthy
 * app with a 502, in one write, on purpose.
 *
 * So this decides and does not act. The route repoints only on `rollback`, the
 * same separation arrears.ts draws for suspension and for the same reason: the
 * expensive half is trivial to call by accident.
 *
 * ROLLING BACK DOES NOT REBUILD. The point is that the image already exists —
 * it is the version that was working twenty minutes ago. That is also the
 * hazard: a deployment row can say `ready` and carry no image, because `ready`
 * is set on a row whose build published nothing in more than one historical
 * path. Repointing at it would look like a successful rollback and serve
 * nothing.
 */

import type { DeploymentRow, ProjectRow } from "./db.ts";

export interface RollbackDecision {
  /** `rollback` repoints. `noop` is already correct. `refuse` must not act. */
  action: "rollback" | "noop" | "refuse";
  code:
    | "ok"
    | "already-live"
    | "wrong-project"
    | "not-ready"
    | "no-image"
    | "not-production";
  reason: string;
}

/** A digest that is present, non-blank, and not the string "null". */
function hasImage(d: DeploymentRow): boolean {
  const digest = d.image_digest;
  if (typeof digest !== "string") return false;
  const trimmed = digest.trim();
  // "" and "null" both arrive from real systems — an empty column and a
  // stringified null respectively — and both mean there is no image. Treating
  // either as an image is the difference between a rollback and an outage.
  return trimmed !== "" && trimmed !== "null" && trimmed !== "undefined";
}

/**
 * Decide whether `target` may take over the project's production aliases.
 *
 * `currentDeploymentId` is what production points at NOW — null when nothing
 * does. Null is a legitimate reason to roll forward onto a target (a project
 * whose alias was never pointed), not a reason to refuse, so it is not treated
 * as an error.
 */
export function assessRollback(
  target: DeploymentRow | null,
  project: Pick<ProjectRow, "id">,
  currentDeploymentId: string | null,
  targetIsProductionEnvironment: boolean,
): RollbackDecision {
  if (!target) {
    return { action: "refuse", code: "wrong-project", reason: "No such deployment for this project." };
  }

  // FIRST, because every other message would confirm the deployment exists.
  // A caller probing refs must not learn which ones are real from the
  // difference between "not ready" and "no such deployment".
  if (target.project_id !== project.id) {
    return { action: "refuse", code: "wrong-project", reason: "No such deployment for this project." };
  }

  if (!targetIsProductionEnvironment) {
    // A preview build serving production is not a rollback, it is a mistake
    // with a URL. The branch was never reviewed as production and its env vars
    // are the preview set.
    return {
      action: "refuse",
      code: "not-production",
      reason: "That deployment belongs to a preview environment. Promoting a preview is not a rollback.",
    };
  }

  if (target.state !== "ready") {
    return {
      action: "refuse",
      code: "not-ready",
      reason: `That deployment is ${target.state}, so it has nothing serving to roll back to.`,
    };
  }

  if (!hasImage(target)) {
    return {
      action: "refuse",
      code: "no-image",
      reason: "That deployment is marked ready but has no published image, so pointing at it would serve nothing.",
    };
  }

  if (currentDeploymentId !== null && target.id === currentDeploymentId) {
    // Not an error. Someone clicking twice, or retrying a request whose
    // response was lost, should get the state they asked for rather than a
    // failure that invites them to try something else.
    return { action: "noop", code: "already-live", reason: "That deployment is already serving production." };
  }

  return { action: "rollback", code: "ok", reason: `Rolling production back to ${target.ref}.` };
}

/**
 * Must the target be woken before it can serve?
 *
 * `scaled_to_zero_at` means asleep ON PURPOSE and the reconciler will not scale
 * it up. Rolling back to a sleeping deployment without clearing it repoints
 * every production alias at zero replicas — the rollback reports success and
 * the site returns 502 until someone notices the flag.
 */
export function needsWake(target: DeploymentRow): boolean {
  return target.scaled_to_zero_at !== null && target.scaled_to_zero_at !== undefined;
}
