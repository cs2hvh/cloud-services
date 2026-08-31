import { test } from "node:test";
import assert from "node:assert/strict";
import { assessRollback, needsWake } from "./rollback.ts";
import type { DeploymentRow, ProjectRow } from "./db.ts";

const PROJECT = { id: "prj-1" } as Pick<ProjectRow, "id">;

const dep = (over: Partial<DeploymentRow> = {}): DeploymentRow =>
  ({
    id: "dpl-old",
    ref: "dpl-old",
    project_id: "prj-1",
    environment_id: "env-prod",
    state: "ready",
    image_digest: "sha256:abc",
    image_repo: "registry/app",
    scaled_to_zero_at: null,
    ...over,
  }) as DeploymentRow;

test("a ready production deployment with an image may take over", () => {
  const d = assessRollback(dep(), PROJECT, "dpl-current", true);
  assert.equal(d.action, "rollback");
  assert.equal(d.code, "ok");
});

test("ANOTHER PROJECT'S DEPLOYMENT IS REFUSED, AND INDISTINGUISHABLY", () => {
  // The refusal must read the same as "no such deployment". If "not ready" and
  // "no such deployment" differ, a caller enumerating refs learns which ones
  // are real — and they are another tenant's.
  const foreign = assessRollback(dep({ project_id: "prj-2", state: "error" }), PROJECT, null, true);
  const missing = assessRollback(null, PROJECT, null, true);
  assert.equal(foreign.action, "refuse");
  assert.equal(foreign.code, "wrong-project");
  assert.equal(foreign.reason, missing.reason, "a foreign deployment must not be distinguishable from a missing one");
});

test("a deployment that never became ready has nothing to serve", () => {
  for (const state of ["queued", "building", "publishing", "error", "canceled"] as const) {
    const d = assessRollback(dep({ state }), PROJECT, null, true);
    assert.equal(d.action, "refuse", `${state} must refuse`);
    assert.equal(d.code, "not-ready");
  }
});

test("READY WITH NO IMAGE IS THE OUTAGE CASE", () => {
  // The whole premise of rollback is that the image already exists. A row that
  // says ready and carries no digest passes every other check and serves
  // nothing — the rollback reports success and the site goes down.
  for (const digest of [null, "", "   ", "null", "undefined"] as Array<string | null>) {
    const d = assessRollback(dep({ image_digest: digest }), PROJECT, null, true);
    assert.equal(d.action, "refuse", `${JSON.stringify(digest)} must refuse`);
    assert.equal(d.code, "no-image");
  }
});

test("promoting a preview to production is not a rollback", () => {
  const d = assessRollback(dep(), PROJECT, "dpl-current", false);
  assert.equal(d.action, "refuse");
  assert.equal(d.code, "not-production");
});

test("rolling back to what is already live is a no-op, not a failure", () => {
  // A double click, or a retry whose first response was lost, should end in the
  // state the caller asked for rather than an error inviting them to try
  // something else.
  const d = assessRollback(dep({ id: "dpl-live" }), PROJECT, "dpl-live", true);
  assert.equal(d.action, "noop");
  assert.equal(d.code, "already-live");
});

test("a project with nothing live can still roll forward onto a target", () => {
  // currentDeploymentId null means no alias points anywhere yet. That is a
  // reason to proceed, not a reason to refuse.
  const d = assessRollback(dep(), PROJECT, null, true);
  assert.equal(d.action, "rollback");
});

test("the order of checks does not leak existence", () => {
  // A foreign deployment that is ALSO not ready, and one that is ready, must
  // both refuse identically — otherwise the response distinguishes them.
  const a = assessRollback(dep({ project_id: "prj-2", state: "ready" }), PROJECT, null, true);
  const b = assessRollback(dep({ project_id: "prj-2", state: "building" }), PROJECT, null, true);
  assert.deepEqual(a, b);
});

test("A SLEEPING TARGET MUST BE WOKEN OR THE ROLLBACK SERVES 502", () => {
  // scaled_to_zero_at means asleep on purpose and the reconciler will not scale
  // it up. Repointing without clearing it sends every production alias to zero
  // replicas, and the rollback reports success.
  assert.equal(needsWake(dep({ scaled_to_zero_at: "2026-08-01T00:00:00Z" })), true);
  assert.equal(needsWake(dep({ scaled_to_zero_at: null })), false);
});

test("the decision is not a pass-through in either direction", () => {
  // Always refusing makes rollback useless; always allowing is the outage.
  assert.equal(assessRollback(dep(), PROJECT, "other", true).action, "rollback");
  assert.equal(assessRollback(dep({ state: "error" }), PROJECT, "other", true).action, "refuse");
});
