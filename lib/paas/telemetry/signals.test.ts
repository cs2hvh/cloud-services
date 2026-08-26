/**
 * Abuse and quota signal tests.
 *
 *   node --test lib/paas/telemetry/signals.test.ts
 *
 * These fire at customers, so the tests lean on the cases where firing would
 * be WRONG — degraded data, a single deployment, a build in flight. A false
 * positive here is someone's app throttled over our own missing samples.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_THRESHOLDS,
  detectSignals,
  summarise,
  type AppUsageLike,
} from "./signals.ts";

const DAY = 86_400;

function app(over: Partial<AppUsageLike> = {}): AppUsageLike {
  return {
    appKey: "dpl9f6d095cc9",
    projectRef: "prj-node-js-getting-started",
    warmFraction: 0.02,
    degraded: false,
    restarts: 0,
    peakPods: 1,
    podSeconds: 1_728,
    ...over,
  };
}

const kinds = (s: ReturnType<typeof detectSignals>) => s.map((x) => x.kind);

// ── the economics signal ────────────────────────────────────────────────────

test("warm AND idle is its own signal — the clearest scale-to-zero case", () => {
  // Measured live once metrics-server landed: three apps holding a full pod
  // slot each at 2-3 millicores. Warm fraction 1.0 says they cost the
  // always-on model; CPU says they are doing essentially nothing while
  // costing it. Those are different arguments and the second is stronger.
  const s = detectSignals({
    apps: [app({ warmFraction: 1, cpuCores: 0.003 })],
    windowSeconds: DAY,
  });

  assert.deepEqual(kinds(s), ["warm-and-idle"]);
  assert.match(s[0].detail, /3m CPU/);
  assert.match(s[0].action, /clearest scale-to-zero case/);
});

test("warm and BUSY is not the same finding and does not raise the idle one", () => {
  // A busy always-warm app is a customer getting value from the pod they hold.
  // Scaling it to zero would be wrong; pricing for it is the answer.
  const s = detectSignals({
    apps: [app({ warmFraction: 1, cpuCores: 0.4 })],
    windowSeconds: DAY,
  });

  assert.deepEqual(kinds(s), ["always-warm"]);
  assert.match(s[0].action, /customer getting value/);
});

test("without metrics the two are not distinguished, and the action says so", () => {
  const s = detectSignals({ apps: [app({ warmFraction: 1 })], windowSeconds: DAY });

  assert.deepEqual(kinds(s), ["always-warm"]);
  assert.match(s[0].action, /cannot be told apart/);
});

test("an idle app that is NOT warm raises nothing — idle is the expected state", () => {
  // 80% of apps should be near-idle under the plan's model. Idle alone
  // describes a healthy fleet; it is only a finding alongside warmth.
  const s = detectSignals({
    apps: [app({ warmFraction: 0.02, cpuCores: 0.001 })],
    windowSeconds: DAY,
  });
  assert.equal(summarise(s).quiet, true);
});

test("an app warm all day raises always-warm", () => {
  const s = detectSignals({ apps: [app({ warmFraction: 1 })], windowSeconds: DAY });

  assert.deepEqual(kinds(s), ["always-warm"]);
  assert.equal(s[0].severity, "warn");
  assert.match(s[0].detail, /Costs what an always-on app costs/);
});

test("an app warm 2% of the day — the model the plan is priced on — is quiet", () => {
  const s = detectSignals({ apps: [app({ warmFraction: 0.02 })], windowSeconds: DAY });
  assert.equal(summarise(s).quiet, true);
});

test("a DEGRADED warm figure never raises the alarm, because the gap is our fault", () => {
  const s = detectSignals({
    apps: [app({ warmFraction: 1, degraded: true })],
    windowSeconds: DAY,
  });

  assert.equal(kinds(s).includes("always-warm"), false);
  assert.equal(
    summarise(s).quiet,
    true,
    "acting on a customer over our own missing samples is very hard to undo",
  );
});

test("the always-warm threshold is a boundary", () => {
  const at = detectSignals({
    apps: [app({ warmFraction: DEFAULT_THRESHOLDS.alwaysWarm })],
    windowSeconds: DAY,
  });
  const below = detectSignals({
    apps: [app({ warmFraction: DEFAULT_THRESHOLDS.alwaysWarm - 0.01 })],
    windowSeconds: DAY,
  });

  assert.equal(kinds(at).includes("always-warm"), true);
  assert.equal(kinds(below).includes("always-warm"), false);
});

test("thresholds are overridable, so the number can be argued with", () => {
  const s = detectSignals({
    apps: [app({ warmFraction: 0.5 })],
    windowSeconds: DAY,
    thresholds: { alwaysWarm: 0.4 },
  });
  assert.equal(kinds(s).includes("always-warm"), true);
});

// ── crash loops ─────────────────────────────────────────────────────────────

test("restarts past the threshold raise restart-storm, and a big number is critical", () => {
  const warn = detectSignals({ apps: [app({ restarts: 5 })], windowSeconds: DAY });
  const crit = detectSignals({ apps: [app({ restarts: 40 })], windowSeconds: DAY });

  assert.equal(warn[0].kind, "restart-storm");
  assert.equal(warn[0].severity, "warn");
  assert.equal(crit[0].severity, "critical");
});

test("a couple of restarts is not a storm", () => {
  assert.equal(summarise(detectSignals({ apps: [app({ restarts: 2 })], windowSeconds: DAY })).quiet, true);
});

// ── sprawl and lingering deployments ────────────────────────────────────────

test("more pods than the replica threshold raises sprawl", () => {
  const s = detectSignals({ apps: [app({ peakPods: 9 })], windowSeconds: DAY });
  assert.equal(kinds(s).includes("replica-sprawl"), true);
});

test("two deployments running for one project is flagged — the live cluster has this", () => {
  const s = detectSignals({
    apps: [
      app({ appKey: "dpl9f6d095cc9" }),
      app({ appKey: "dplc3fd691f26" }),
    ],
    windowSeconds: DAY,
  });

  const orphan = s.find((x) => x.kind === "orphan-deployment");
  assert.ok(orphan);
  assert.equal(orphan.subject, "prj-node-js-getting-started");
  assert.match(orphan.detail, /dpl9f6d095cc9, dplc3fd691f26/);
  assert.match(orphan.action, /held warm for rollback/, "states the innocent explanation first");
});

test("one deployment per project is normal and silent", () => {
  const s = detectSignals({
    apps: [app({ appKey: "a", projectRef: "p1" }), app({ appKey: "b", projectRef: "p2" })],
    windowSeconds: DAY,
  });
  assert.equal(kinds(s).includes("orphan-deployment"), false);
});

test("a deployment with no pod-seconds does not count towards sprawl", () => {
  const s = detectSignals({
    apps: [app({ appKey: "live" }), app({ appKey: "stopped", podSeconds: 0 })],
    windowSeconds: DAY,
  });
  assert.equal(kinds(s).includes("orphan-deployment"), false);
});

// ── build tier ──────────────────────────────────────────────────────────────

test("an unterminated build VM is critical, because the meter bills it as zero", () => {
  const s = detectSignals({
    apps: [],
    builds: { builds: 3, overdue: 1, buildSeconds: 300 },
    windowSeconds: DAY,
  });

  assert.equal(s[0].kind, "unterminated-build");
  assert.equal(s[0].severity, "critical");
  assert.match(s[0].action, /invisible in revenue/);
});

test("ordinary build volume is quiet", () => {
  const s = detectSignals({
    apps: [],
    builds: { builds: 4, overdue: 0, buildSeconds: 714 },
    windowSeconds: DAY,
  });
  assert.equal(summarise(s).quiet, true);
});

test("a build RUNNING right now raises nothing at all", () => {
  // Caught on the live cluster: a build in flight has no destroyed_at, and the
  // first version called that a critical leak — so the operator view fired a
  // critical every time anyone deployed. An alert that fires on normal
  // operation is one people learn to ignore.
  const s = detectSignals({
    apps: [],
    builds: { builds: 5, overdue: 0, inFlight: 1, buildSeconds: 900 },
    windowSeconds: DAY,
  });

  assert.equal(summarise(s).quiet, true);
  assert.equal(s.some((x) => x.kind === "unterminated-build"), false);
});

test("a build storm is flagged, since each build leases a real Linode", () => {
  const s = detectSignals({
    apps: [],
    builds: { builds: 200, overdue: 0, buildSeconds: 60_000 },
    windowSeconds: DAY,
  });
  assert.equal(kinds(s).includes("build-storm"), true);
  assert.match(s[0].action ?? "", /spend the platform's money|leases a real Linode/);
});

// ── ordering and shape ──────────────────────────────────────────────────────

test("critical signals sort above warnings", () => {
  const s = detectSignals({
    apps: [app({ warmFraction: 1 })],
    builds: { builds: 1, overdue: 2, buildSeconds: 60 },
    windowSeconds: DAY,
  });

  assert.equal(s[0].severity, "critical");
  assert.deepEqual(summarise(s), { critical: 1, warn: 1, info: 0, quiet: false });
});

test("no apps and no builds is quiet", () => {
  const s = detectSignals({ apps: [], windowSeconds: DAY });
  assert.deepEqual(summarise(s), { critical: 0, warn: 0, info: 0, quiet: true });
});

test("every signal carries an action a person can act on", () => {
  const s = detectSignals({
    apps: [app({ warmFraction: 1, restarts: 20, peakPods: 9 })],
    builds: { builds: 500, overdue: 3, buildSeconds: 99_999 },
    windowSeconds: DAY,
  });

  assert.ok(s.length >= 5);
  for (const sig of s) {
    assert.ok(sig.action.length > 30, `${sig.kind} needs a real action`);
    assert.ok(sig.detail.length > 5, `${sig.kind} needs a detail`);
    assert.ok(Number.isFinite(sig.value) && Number.isFinite(sig.threshold));
  }
});
