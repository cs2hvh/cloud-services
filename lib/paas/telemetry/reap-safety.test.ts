import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkReapPlan,
  findingsFrom,
  REAP_FRACTION_CEILING,
  type ReapPlanLike,
} from "./reap-safety.ts";

const TTL = 48;

function plan(over: Partial<ReapPlanLike> = {}): ReapPlanLike {
  return {
    reap: [{ ref: "als-old", ageHours: 72, reason: "past TTL" }],
    keep: [{ ref: "als-fresh", reason: "12h old, within TTL" }],
    examined: 2,
    ...over,
  };
}

const kinds = (p: ReapPlanLike) => checkReapPlan(p, TTL).refusals.map((r) => r.kind);

test("a coherent plan is fit to review", () => {
  const s = checkReapPlan(plan(), TTL);
  assert.equal(s.safeToReview, true);
  assert.deepEqual(s.refusals, []);
  assert.equal(s.proposed, 1);
  assert.equal(s.kept, 1);
});

test("safeToReview is not permission to delete", () => {
  // Every candidate stays non-actionable regardless of how clean the plan is.
  // The licence comes from a human, and nothing here can grant it.
  const s = checkReapPlan(plan(), TTL);
  assert.equal(s.safeToReview, true);
  for (const f of findingsFrom(plan())) assert.equal(f.actionable, false);
});

test("examining nothing is refused, because an empty plan then means unread", () => {
  assert.ok(kinds(plan({ reap: [], keep: [], examined: 0 })).includes("examined-nothing"));
});

test("a plan that does not account for what it examined is refused", () => {
  // Items falling out of the plan is a bug whose other effects are unknown,
  // so the entries that DID survive are not trustworthy either.
  assert.ok(kinds(plan({ examined: 9 })).includes("plan-does-not-close"));
});

test("a candidate with unknown age is refused, never reaped", () => {
  // THE ONE THAT DESTROYS A RUNNING ENVIRONMENT. Unknown is not old.
  const k = kinds(plan({ reap: [{ ref: "als-x", ageHours: null }], keep: [], examined: 1 }));
  assert.ok(k.includes("unknown-age"));
});

test("NaN age is treated as unknown, not as a number", () => {
  // NaN passes a naive `age > ttl` check as false and a `!age` check as true,
  // so it must be tested for explicitly rather than falling into either branch.
  const k = kinds(plan({ reap: [{ ref: "als-nan", ageHours: NaN }], keep: [], examined: 1 }));
  assert.ok(k.includes("unknown-age"));
});

test("a future-dated candidate is clock skew, not an ancient preview", () => {
  const k = kinds(plan({ reap: [{ ref: "als-future", ageHours: -5 }], keep: [], examined: 1 }));
  assert.ok(k.includes("future-dated"));
  assert.ok(!k.includes("under-ttl"), "a negative age is its own failure, not merely a young one");
});

test("a candidate younger than the TTL means the classifier broke its own rule", () => {
  const k = kinds(plan({ reap: [{ ref: "als-young", ageHours: 12 }], keep: [], examined: 1 }));
  assert.ok(k.includes("under-ttl"));
});

test("the TTL boundary is inclusive of the candidate at exactly the TTL", () => {
  // 48h is reapable; 47.9h is not. An exclusive bound here would leave every
  // preview that ages exactly onto the boundary permanently un-reapable.
  assert.ok(!kinds(plan({ reap: [{ ref: "a", ageHours: TTL }], keep: [], examined: 1 })).includes("under-ttl"));
  assert.ok(kinds(plan({ reap: [{ ref: "a", ageHours: TTL - 0.1 }], keep: [], examined: 1 })).includes("under-ttl"));
});

test("a plan that reaps nearly everything is refused as a broken rule", () => {
  // The signature of broken date parsing is not a strange entry, it is a
  // uniform one — everything looks ancient and the plan looks decisive.
  const reap = Array.from({ length: 10 }, (_, i) => ({ ref: `als-${i}`, ageHours: 999 }));
  const k = kinds(plan({ reap, keep: [], examined: 10 }));
  assert.ok(k.includes("reaps-everything"));
});

test("a single reapable item is not a mass deletion", () => {
  // One-of-one is 100% and must not trip the ceiling, or the first genuine
  // reap on a small fleet is refused forever.
  const k = kinds(plan({ reap: [{ ref: "als-old", ageHours: 72 }], keep: [], examined: 1 }));
  assert.ok(!k.includes("reaps-everything"));
});

test("the ceiling is below 1.0, so a nearly-total plan still refuses", () => {
  assert.ok(REAP_FRACTION_CEILING < 1);
  const reap = Array.from({ length: 19 }, (_, i) => ({ ref: `als-${i}`, ageHours: 99 }));
  const k = kinds(plan({ reap, keep: [{ ref: "kept", reason: "fresh" }], examined: 20 }));
  assert.ok(k.includes("reaps-everything"), "19 of 20 is 95%, above the ceiling");
});

test("a keep with no reason is a default, not a decision", () => {
  assert.ok(kinds(plan({ keep: [{ ref: "als-?" }] })).includes("unexplained-keep"));
  assert.ok(kinds(plan({ keep: [{ ref: "als-?", reason: "   " }] })).includes("unexplained-keep"));
});

test("every failing candidate is named, so a human can look at it directly", () => {
  const s = checkReapPlan(
    plan({ reap: [{ ref: "als-a", ageHours: null }, { ref: "als-b", ageHours: null }], keep: [], examined: 2 }),
    TTL,
  );
  const r = s.refusals.find((x) => x.kind === "unknown-age");
  assert.deepEqual(r?.refs, ["als-a", "als-b"]);
});

test("independent failures are reported together, not one at a time", () => {
  // A plan with three different defects should surface all three; fixing them
  // one run at a time is how a bad classifier survives three reviews.
  const k = kinds({
    reap: [{ ref: "a", ageHours: null }, { ref: "b", ageHours: 2 }],
    keep: [{ ref: "c" }],
    examined: 99,
  });
  assert.ok(k.includes("unknown-age"));
  assert.ok(k.includes("under-ttl"));
  assert.ok(k.includes("unexplained-keep"));
  assert.ok(k.includes("plan-does-not-close"));
});

test("findings sort oldest first, with unknown age last", () => {
  // An unreadable age is not an extreme value. Sorting it as one would put the
  // entries that must NEVER be reaped at the top of the list a human reads.
  const f = findingsFrom({
    reap: [
      { ref: "unknown", ageHours: null },
      { ref: "oldest", ageHours: 500 },
      { ref: "old", ageHours: 60 },
    ],
    keep: [],
    examined: 3,
  });
  assert.deepEqual(f.map((x) => x.ref), ["oldest", "old", "unknown"]);
});

test("a candidate with no recorded reason still says so rather than reading blank", () => {
  const [f] = findingsFrom({ reap: [{ ref: "als-x", ageHours: 99 }], keep: [], examined: 1 });
  assert.equal(f.reason, "no reason recorded");
});
