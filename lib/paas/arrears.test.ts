import { test } from "node:test";
import assert from "node:assert/strict";
import { assessArrears, shouldSuspend, shouldResume, GRACE_HOURS } from "./arrears.ts";

const NOW = new Date("2026-08-27T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

test("never having failed a charge is 'current'", () => {
  const v = assessArrears(null, NOW);
  assert.equal(v.state, "current");
  assert.equal(shouldSuspend(v), false);
  assert.equal(shouldResume(v), true);
});

test("inside the grace window the app keeps running", () => {
  const v = assessArrears(hoursAgo(1), NOW);
  assert.equal(v.state, "grace");
  assert.equal(shouldSuspend(v), false);
  assert.ok(v.hoursRemaining! > 70);
});

test("past the grace window it becomes eligible for suspension", () => {
  const v = assessArrears(hoursAgo(GRACE_HOURS + 1), NOW);
  assert.equal(v.state, "overdue");
  assert.equal(shouldSuspend(v), true);
});

test("the boundary is inclusive, asserted on both sides", () => {
  // An off-by-one here either takes a site down an hour early or leaves one
  // running forever at exactly the boundary. Both sides asserted so neither
  // can pass unnoticed.
  assert.equal(assessArrears(hoursAgo(GRACE_HOURS), NOW).state, "overdue");
  assert.equal(assessArrears(hoursAgo(GRACE_HOURS - 0.02), NOW).state, "grace");
});

test("AN UNREADABLE TIMESTAMP NEVER SUSPENDS", () => {
  // Same rule as the preview reaper and for a worse reason: here the mistake
  // takes down a paying customer's production site on the strength of a corrupt
  // field. Could-not-establish is not established-and-bad.
  for (const bad of ["", "not-a-date", "yesterday", "2026-13-45T99:99:99Z"]) {
    const v = assessArrears(bad, NOW);
    assert.equal(v.state, "unknown", `${JSON.stringify(bad)} must be unknown`);
    assert.equal(shouldSuspend(v), false);
  }
});

test("a future arrears date is clock skew, not a debt from tomorrow", () => {
  const v = assessArrears(new Date(NOW.getTime() + 3_600_000).toISOString(), NOW);
  assert.equal(v.state, "unknown");
  assert.equal(shouldSuspend(v), false);
  assert.match(v.reason, /skew/);
});

test("UNKNOWN NEITHER SUSPENDS NOR RESUMES", () => {
  // The reason shouldResume is its own function rather than !shouldSuspend.
  // Inferring resume from "not suspend" would restart an app on the strength of
  // a timestamp nobody could read — the same unreliable field, trusted in the
  // other direction.
  const v = assessArrears("garbage", NOW);
  assert.equal(shouldSuspend(v), false);
  assert.equal(shouldResume(v), false, "unknown must not resume either");
});

test("the clock runs from the FIRST failure, not the most recent", () => {
  // If the sweep wrote the latest failure each hour, the grace window would
  // slide forward exactly as fast as time passed and nothing would ever become
  // overdue. This is asserted as a property of the input: a 100h-old first
  // failure is overdue regardless of how recently it last failed.
  assert.equal(assessArrears(hoursAgo(100), NOW).state, "overdue");
  assert.equal(assessArrears(hoursAgo(0.5), NOW).state, "grace");
});

test("the assessment is not a pass-through in either direction", () => {
  // The paired proof. Never suspending makes every out-of-credit app free
  // forever; always suspending takes down every customer who is paying fine.
  assert.equal(shouldSuspend(assessArrears(hoursAgo(200), NOW)), true, "must be capable of suspending");
  assert.equal(shouldSuspend(assessArrears(null, NOW)), false, "must be capable of not suspending");
});

test("grace is configurable, and a zero window still refuses unknown", () => {
  // A future operator may want a shorter window. It must not become a way to
  // suspend on unreadable data.
  assert.equal(assessArrears(hoursAgo(1), NOW, 0).state, "overdue");
  assert.equal(assessArrears("garbage", NOW, 0).state, "unknown");
});
