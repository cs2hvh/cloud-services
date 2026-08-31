import { test } from "node:test";
import assert from "node:assert/strict";
import { mayReap } from "./previews.ts";

test("A PRODUCTION ALIAS IS NEVER REAPED", () => {
  // The last gate before a DELETE. The plan is built from preview environments,
  // so a production alias reaching here should be impossible — which is why it
  // is checked. "Impossible" costing a customer their production hostname once
  // is worse than an assertion that costs nothing forever.
  assert.equal(mayReap({ kind: "production" }).ok, false);
  assert.match(mayReap({ kind: "production" }).reason, /NOT branch/);
});

test("a custom domain is never reaped either", () => {
  // A customer's own hostname. Deleting its DNS would take their site down at
  // their own domain — the loudest possible version of this failure.
  assert.equal(mayReap({ kind: "custom" }).ok, false);
});

test("a deployment alias is not reaped, because the TTL does not describe it", () => {
  // `deployment` aliases are permanent per-build URLs, not previews. They share
  // a project with previews and would be swept up by a kind-blind gate.
  assert.equal(mayReap({ kind: "deployment" }).ok, false);
});

test("a missing row is REFUSED, not skipped silently", () => {
  // A row that vanished between plan and apply is a race, and racing a delete is
  // how the wrong thing gets deleted. It must surface as a failure rather than
  // as a quiet no-op that leaves the run looking complete.
  assert.equal(mayReap(null).ok, false);
  assert.match(mayReap(null).reason, /vanished/);
  assert.equal(mayReap(undefined).ok, false);
});

test("a branch alias IS reapable — the gate is not a blanket refusal", () => {
  // The paired proof. A gate that refuses everything passes every test above
  // while making the reaper incapable of reaping, so previews would accumulate
  // forever — the exact failure the TTL exists to prevent, arriving through the
  // safety check instead of past it.
  assert.equal(mayReap({ kind: "branch" }).ok, true);
});
