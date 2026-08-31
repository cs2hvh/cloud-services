import { test } from "node:test";
import assert from "node:assert/strict";
import { indexPreviews, ageHours, type IndexInput } from "./preview-index.ts";

const NOW = new Date("2026-08-26T18:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function input(over: Partial<IndexInput> = {}): IndexInput {
  return {
    environments: [
      { id: "e1", ref: "env-1", projectRef: "prj-1", kind: "preview", name: "feature-x", createdAt: hoursAgo(10) },
    ],
    deployments: [{ id: "d1", ref: "dpl-1", environmentId: "e1", queuedAt: hoursAgo(5) }],
    aliases: [{ ref: "als-1", hostname: "x.example.com", deploymentId: "d1" }],
    hasPod: () => false,
    now: NOW,
    ...over,
  };
}

test("a preview with an alias is visible to the reaper", () => {
  const r = indexPreviews(input());
  assert.equal(r.indexed.length, 1);
  assert.equal(r.invisible.length, 0);
  assert.equal(r.indexed[0].aliasRef, "als-1");
  assert.equal(r.indexed[0].lastPushAt, hoursAgo(5));
});

test("production environments are not previews", () => {
  const r = indexPreviews(
    input({
      environments: [
        { id: "e1", ref: "env-1", projectRef: "prj-1", kind: "production", name: "prod", createdAt: hoursAgo(99) },
      ],
    }),
  );
  assert.equal(r.environments, 0);
  assert.equal(r.indexed.length, 0);
  assert.equal(r.invisible.length, 0);
});

test("a preview with no alias is invisible, not merely un-reaped", () => {
  // THE FINDING. planReap walks aliases, so this environment is never examined
  // and no TTL reaches it.
  const r = indexPreviews(input({ aliases: [] }));
  assert.equal(r.indexed.length, 0);
  assert.equal(r.invisible.length, 1);
  assert.equal(r.invisible[0].environmentRef, "env-1");
});

test("the alias kind is never consulted, so a renamed kind cannot hide a preview", () => {
  // The first version of the sweep filtered on kind === "preview", which does
  // not exist — a preview alias is `branch`. Indexing by environment means
  // whatever alias points at the deployment counts, whatever it is called.
  const r = indexPreviews(input({ aliases: [{ ref: "als-b", hostname: "h", deploymentId: "d1" }] }));
  assert.equal(r.indexed.length, 1);
  assert.equal(r.indexed[0].aliasRef, "als-b");
});

test("an alias on a DIFFERENT deployment does not index this preview", () => {
  // Otherwise a project's production alias would make its previews look
  // covered, which is exactly backwards.
  const r = indexPreviews(input({ aliases: [{ ref: "als-prod", hostname: "h", deploymentId: "d-other" }] }));
  assert.equal(r.indexed.length, 0);
  assert.equal(r.invisible.length, 1);
});

test("an invisible preview with a running pod is urgent", () => {
  // Routing precedes converge, so a pod normally arrives after its alias. A pod
  // without one means something ran between those points and did not finish —
  // a container no sweep will ever reach.
  const r = indexPreviews(input({ aliases: [], hasPod: () => true }));
  assert.equal(r.invisible[0].running, true);
  assert.equal(r.invisible[0].disposition, "running");
  assert.equal(r.invisible[0].urgent, true);
  assert.equal(r.invisible[0].actionable, true);
});

test("a REAPED preview is not a finding, or every success becomes one", () => {
  // The reaper deletes the DNS record and the alias and deliberately leaves the
  // environment row — environments are reused per branch, so the row is the
  // branch's identity. That makes a reaped preview structurally identical to
  // one whose alias was never minted. Reporting "no alias" would have produced
  // one permanent entry per reaped preview, accumulating forever and drowning
  // the case that matters underneath its own successes.
  const r = indexPreviews(input({ aliases: [], hasPod: () => false }));
  assert.equal(r.invisible[0].running, false);
  assert.equal(r.invisible[0].disposition, "idle");
  assert.equal(r.invisible[0].urgent, false);
  assert.equal(r.invisible[0].actionable, false, "nothing is running, so nothing needs doing");
});

test("an unreadable cluster reports unknown, never 'no pod'", () => {
  // Collapsing null to false would downgrade the urgent case to a footnote on
  // the strength of a failed API call.
  const r = indexPreviews(input({ aliases: [], hasPod: () => null }));
  assert.equal(r.invisible[0].running, null);
  assert.equal(r.invisible[0].disposition, "unknown");
  assert.equal(r.invisible[0].urgent, false, "unknown is not urgent");
  assert.equal(r.invisible[0].actionable, true, "but it cannot be SHOWN safe, so it is still worth looking at");
});

test("unknown and idle are different answers, not two spellings of quiet", () => {
  // The whole distinction in one assertion: one of these can be dismissed and
  // the other cannot, and they arrive from the same empty pod list.
  const idle = indexPreviews(input({ aliases: [], hasPod: () => false })).invisible[0];
  const unknown = indexPreviews(input({ aliases: [], hasPod: () => null })).invisible[0];
  assert.notEqual(idle.disposition, unknown.disposition);
  assert.notEqual(idle.actionable, unknown.actionable);
});

test("one unreadable deployment makes the whole environment unknown", () => {
  // The readable ones must not vote it down to "nothing running".
  const r = indexPreviews(
    input({
      aliases: [],
      deployments: [
        { id: "d1", ref: "dpl-1", environmentId: "e1", queuedAt: hoursAgo(5) },
        { id: "d2", ref: "dpl-2", environmentId: "e1", queuedAt: hoursAgo(4) },
      ],
      hasPod: (ref) => (ref === "dpl-1" ? false : null),
    }),
  );
  assert.equal(r.invisible[0].running, null);
});

test("one running pod outranks an unreadable sibling", () => {
  const r = indexPreviews(
    input({
      aliases: [],
      deployments: [
        { id: "d1", ref: "dpl-1", environmentId: "e1", queuedAt: hoursAgo(5) },
        { id: "d2", ref: "dpl-2", environmentId: "e1", queuedAt: hoursAgo(4) },
      ],
      hasPod: (ref) => (ref === "dpl-1" ? true : null),
    }),
  );
  assert.equal(r.invisible[0].running, true);
  assert.equal(r.invisible[0].urgent, true);
});

test("age comes from the last push, and falls back to environment creation", () => {
  const pushed = indexPreviews(input({ aliases: [] }));
  assert.ok(Math.abs((pushed.invisible[0].ageHours ?? 0) - 5) < 0.01, "uses the push, not creation");

  const never = indexPreviews(
    input({ aliases: [], deployments: [{ id: "d1", ref: "dpl-1", environmentId: "e1", queuedAt: null }] }),
  );
  assert.ok(Math.abs((never.invisible[0].ageHours ?? 0) - 10) < 0.01, "falls back to createdAt");
});

test("the newest push wins when an environment has several", () => {
  const r = indexPreviews(
    input({
      deployments: [
        { id: "d1", ref: "dpl-1", environmentId: "e1", queuedAt: hoursAgo(50) },
        { id: "d2", ref: "dpl-2", environmentId: "e1", queuedAt: hoursAgo(2) },
      ],
      aliases: [{ ref: "als-1", hostname: "h", deploymentId: "d1" }],
    }),
  );
  // Otherwise an actively pushed branch would be reaped on the age of its
  // first build, which is the "vanish mid-review" case the TTL exists to avoid.
  assert.equal(r.indexed[0].lastPushAt, hoursAgo(2));
});

test("an unreadable timestamp is null, not zero and not infinity", () => {
  // Zero makes it look brand new and safe; Infinity makes it look ancient and
  // reapable. Both are answers, and there isn't one.
  assert.equal(ageHours("not a date", NOW), null);
  assert.equal(ageHours(null, NOW), null);
  assert.equal(ageHours("", NOW), null);
});

test("an environment with no deployments at all is still indexed as invisible", () => {
  // The webhook writes the environment before any build runs, so this is the
  // normal in-flight window rather than an anomaly — but it still has no TTL.
  const r = indexPreviews(input({ deployments: [], aliases: [] }));
  assert.equal(r.invisible.length, 1);
  assert.equal(r.invisible[0].deployments, 0);
  assert.ok(Math.abs((r.invisible[0].ageHours ?? 0) - 10) < 0.01);
});

