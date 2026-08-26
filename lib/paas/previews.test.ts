import { test } from "node:test";
import assert from "node:assert/strict";
import { PREVIEW_TTL_HOURS, planReap, shouldReap, type PreviewAlias } from "./previews.ts";

const NOW = new Date("2026-08-26T18:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const alias = (lastPushAt: string | null): PreviewAlias => ({
  ref: "als_test",
  hostname: "my-app-feature-x-a1b2c3.ahurasense.com",
  projectRef: "prj_test",
  lastPushAt,
});

// ── the boundary ────────────────────────────────────────────────────────────

test("past the limit is reaped, inside it is kept", () => {
  assert.equal(shouldReap(alias(hoursAgo(49)), NOW).reap, true);
  assert.equal(shouldReap(alias(hoursAgo(47)), NOW).reap, false);
});

test("exactly at the limit is reaped, one minute under is not", () => {
  // Asserted on both sides so an off-by-one cannot pass. A `>` where `>=` was
  // meant leaves a preview alive forever at exactly the boundary — rare enough
  // to survive casual testing and permanent when it happens.
  assert.equal(shouldReap(alias(hoursAgo(PREVIEW_TTL_HOURS)), NOW).reap, true);
  assert.equal(shouldReap(alias(hoursAgo(PREVIEW_TTL_HOURS - 0.02)), NOW).reap, false);
});

test("the clock runs from LAST PUSH, not from creation", () => {
  // A branch someone is actively working on must not have its preview vanish
  // mid-review. Pushing resets the clock, which is the whole point of measuring
  // from the push rather than from when the alias appeared.
  const stale = shouldReap(alias(hoursAgo(72)), NOW);
  assert.equal(stale.reap, true);
  const justPushed = shouldReap(alias(hoursAgo(0.1)), NOW);
  assert.equal(justPushed.reap, false);
});

// ── refusals: the expensive direction ───────────────────────────────────────

test("an unknown age is NEVER reaped", () => {
  // The distinction that matters most here, because getting it wrong destroys a
  // running environment rather than producing a wrong report. "We cannot
  // establish the age" is not "this is old".
  for (const bad of [null, "", "not-a-date", "yesterday", "2026-13-45T99:99:99Z"]) {
    const v = shouldReap(alias(bad), NOW);
    assert.equal(v.reap, false, `${JSON.stringify(bad)} must not be reaped`);
    assert.equal(v.ageHours, null);
  }
});

test("a timestamp in the future is clock skew, not a preview from tomorrow", () => {
  const future = new Date(NOW.getTime() + 3_600_000).toISOString();
  const v = shouldReap(alias(future), NOW);
  assert.equal(v.reap, false);
  assert.match(v.reason, /skew/);
});

test("the reaper is not a pass-through in either direction", () => {
  // The paired proof. A shouldReap returning {reap:false} unconditionally would
  // satisfy every refusal test above while reaping nothing ever — previews
  // would accumulate silently, which is the failure the TTL exists to prevent.
  // The reverse would delete environments people are using.
  assert.equal(shouldReap(alias(hoursAgo(100)), NOW).reap, true, "must be capable of reaping");
  assert.equal(shouldReap(alias(hoursAgo(1)), NOW).reap, false, "must be capable of keeping");
});

// ── the plan ────────────────────────────────────────────────────────────────

test("a plan reports how many aliases it examined", () => {
  // An empty reap list means "nothing was old" and "nothing was looked at"
  // identically. `examined` is the only thing separating them, and a sweep that
  // silently examined nothing would report a clean platform forever.
  const empty = planReap([], NOW);
  assert.equal(empty.examined, 0);
  assert.equal(empty.reap.length, 0);

  const some = planReap([alias(hoursAgo(72)), alias(hoursAgo(1)), alias(null)], NOW);
  assert.equal(some.examined, 3);
  assert.equal(some.reap.length, 1);
  assert.equal(some.keep.length, 2);
});

test("every kept alias carries the reason it was kept", () => {
  // Without a reason, "kept" and "skipped because the checker broke" look the
  // same in a log.
  const plan = planReap([alias(hoursAgo(1)), alias(null)], NOW);
  assert.ok(plan.keep.every((k) => typeof k.reason === "string" && k.reason.length > 0));
  assert.ok(plan.keep.some((k) => /remaining/.test(k.reason)));
  assert.ok(plan.keep.some((k) => /cannot establish age/.test(k.reason)));
});
