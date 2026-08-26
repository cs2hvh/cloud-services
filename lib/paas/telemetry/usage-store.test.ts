/**
 * Usage persistence tests.
 *
 *   node --test lib/paas/telemetry/usage-store.test.ts
 *
 * The test that matters is the round trip: sampling every interval, storing
 * deltas, and summing them must give the same answer as accumulating in
 * memory. If it does not, the stored number and the live number disagree, and
 * one of them ends up on an invoice.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { accumulate, type AppObservation, type UsageBucket } from "./usage.ts";
import {
  aggregatePeriod,
  fleetWarmSummary,
  periodWarmFraction,
  sampleDelta,
  toSampleRows,
  type StoredSample,
} from "./usage-store.ts";

const T0 = new Date("2026-08-26T12:00:00Z");
const at = (s: number) => new Date(T0.getTime() + s * 1000);

function app(key = "dpl_1", pods = 1, startedAt: string | null = T0.toISOString()): AppObservation {
  return {
    appKey: key,
    projectRef: "prj_1",
    deploymentRef: key,
    namespace: "app-prj_1",
    pods: Array.from({ length: pods }, (_, i) => ({
      podName: `${key}-pod-${i}`,
      startedAt,
      restarts: 0,
    })),
  };
}

function stored(over: Partial<StoredSample> = {}): StoredSample {
  return {
    sampled_at: T0.toISOString(),
    deployment_ref: "dpl_1",
    project_id: "p1",
    pod_seconds: 60,
    warm_seconds: 60,
    peak_pods: 1,
    restarts: 0,
    unobserved_seconds: 0,
    ...over,
  };
}

// ── the property the whole design rests on ──────────────────────────────────

test("stored deltas sum to exactly what in-memory accumulation reports", () => {
  const observations = [app()];
  const INTERVALS = 10;
  const STEP = 60;

  // In memory: one Map carried forward, the way a single process reports.
  let live = new Map<string, UsageBucket>();
  // Persisted: a fresh Map each interval, one row written per interval.
  const rows: StoredSample[] = [];

  let previousAt: Date | null = null;
  for (let i = 0; i <= INTERVALS; i += 1) {
    const now = at(i * STEP);
    live = accumulate(live, observations, { now, previousAt });

    const delta = sampleDelta(observations, { now, previousAt });
    for (const r of toSampleRows(delta, now, { projectIdOf: () => "p1", periodSeconds: STEP })) rows.push(r as StoredSample);

    previousAt = now;
  }

  const [aggregated] = aggregatePeriod(rows, T0, at(INTERVALS * STEP));
  const [liveBucket] = [...live.values()];

  assert.equal(
    aggregated.podSeconds,
    liveBucket.podSeconds,
    "summed deltas must equal the running total, or stored and live billing disagree",
  );
  assert.equal(aggregated.warmSeconds, liveBucket.warmSeconds);
  assert.equal(aggregated.podSeconds, INTERVALS * STEP);
});

test("sampleDelta never carries the previous interval forward", () => {
  const observations = [app()];

  const first = sampleDelta(observations, { now: at(60), previousAt: T0 });
  const second = sampleDelta(observations, { now: at(120), previousAt: at(60) });

  assert.equal([...first.values()][0].podSeconds, 60);
  assert.equal(
    [...second.values()][0].podSeconds,
    60,
    "the second interval must be 60, not 120 — persisting a running total double-counts",
  );
});

test("summing running totals instead of deltas would over-bill, which is why this exists", () => {
  // Demonstrates the bug the design prevents, so the reason survives.
  let carried = new Map<string, UsageBucket>();
  const wrong: number[] = [];
  let previousAt: Date | null = null;

  for (let i = 0; i <= 3; i += 1) {
    const now = at(i * 60);
    carried = accumulate(carried, [app()], { now, previousAt });
    wrong.push([...carried.values()][0].podSeconds);
    previousAt = now;
  }

  const summedTotals = wrong.reduce((a, b) => a + b, 0);
  assert.equal(summedTotals, 0 + 60 + 120 + 180);
  assert.ok(summedTotals > 180, "six minutes billed for three minutes of running");
});

// ── what gets written ───────────────────────────────────────────────────────

test("a bucket with no measurable usage is not written", () => {
  // The first sample of any period attributes zero by design. Writing those
  // makes a sampling gap indistinguishable from an idle app.
  const first = sampleDelta([app()], { now: T0, previousAt: null });
  assert.deepEqual(toSampleRows(first, T0, { periodSeconds: 0 }), []);
});

test("a bucket with only unobserved time IS written, because a gap is information", () => {
  const gapped = sampleDelta([app()], { now: at(3600), previousAt: T0 });
  const rows = toSampleRows(gapped, at(3600), { periodSeconds: 3600 });

  assert.equal(rows.length, 1);
  assert.ok(rows[0].unobserved_seconds > 0);
});

test("project_id is nullable so unattributed usage is recorded rather than dropped", () => {
  const delta = sampleDelta([app()], { now: at(60), previousAt: T0 });

  assert.equal(toSampleRows(delta, at(60), { periodSeconds: 60 })[0].project_id, null);
  assert.equal(toSampleRows(delta, at(60), { projectIdOf: () => "p9", periodSeconds: 60 })[0].project_id, "p9");
});

test("period_seconds records the window, because pod-seconds alone is ambiguous", () => {
  // 300 pod-seconds is one pod for five minutes or five pods for one, and
  // those are indistinguishable the moment the interval changes or a restart
  // produces a short period. Raised by the infrastructure lane when they
  // applied the table.
  const delta = sampleDelta([app("dpl_1", 1)], { now: at(300), previousAt: T0 });
  const [row] = toSampleRows(delta, at(300), { periodSeconds: 300 });

  assert.equal(row.pod_seconds, 300);
  assert.equal(row.period_seconds, 300, "one pod for five minutes");

  const five = sampleDelta([app("dpl_1", 5)], { now: at(60), previousAt: T0 });
  const [busy] = toSampleRows(five, at(60), { periodSeconds: 60 });

  assert.equal(busy.pod_seconds, 300, "same pod-seconds…");
  assert.equal(busy.period_seconds, 60, "…different window, and now distinguishable");
});

test("a nonsensical window is stored as zero rather than propagated", () => {
  const delta = sampleDelta([app()], { now: at(60), previousAt: T0 });
  for (const bad of [0, -30, NaN, Infinity]) {
    assert.equal(toSampleRows(delta, at(60), { periodSeconds: bad })[0].period_seconds, 0, `${bad}`);
  }
});

test("project_ref is carried so attribution survives the project row being deleted", () => {
  // project_id is `on delete set null` because these are financial records —
  // the final invoice and any chargeback both arrive after deletion.
  const delta = sampleDelta([app()], { now: at(60), previousAt: T0 });
  const [row] = toSampleRows(delta, at(60), { periodSeconds: 60 });

  assert.equal(row.project_ref, "prj_1");
  assert.equal(row.project_id, null, "no uuid resolved, but the ref still bills to something");
});

test("rows carry the deployment ref and a rounded, storable number", () => {
  const delta = sampleDelta([app("dpl_x", 3)], { now: at(45), previousAt: T0 });
  const [row] = toSampleRows(delta, at(45), { periodSeconds: 45 });

  assert.equal(row.deployment_ref, "dpl_x");
  assert.equal(row.pod_seconds, 135, "three pods for 45s");
  assert.equal(row.warm_seconds, 45, "warm once, not three times");
  assert.equal(row.peak_pods, 3);
});

// ── reading a period back ───────────────────────────────────────────────────

test("PostgREST numeric strings are parsed, not concatenated", () => {
  const [u] = aggregatePeriod(
    [stored({ pod_seconds: "60.5" }), stored({ sampled_at: at(60).toISOString(), pod_seconds: "30.25" })],
    T0,
    at(600),
  );
  assert.equal(u.podSeconds, 90.75);
});

test("peak pods is a maximum, restarts are a sum", () => {
  const [u] = aggregatePeriod(
    [
      stored({ peak_pods: 1, restarts: 2 }),
      stored({ sampled_at: at(60).toISOString(), peak_pods: 5, restarts: 3 }),
      stored({ sampled_at: at(120).toISOString(), peak_pods: 2, restarts: 0 }),
    ],
    T0,
    at(600),
  );

  assert.equal(u.peakPods, 5, "three replicas for an hour is a peak of three, not three hundred");
  assert.equal(u.restarts, 5);
  assert.equal(u.samples, 3);
});

test("rows outside the period are excluded", () => {
  const rows = [
    stored({ sampled_at: "2026-08-25T12:00:00Z" }),
    stored({ sampled_at: at(60).toISOString() }),
    stored({ sampled_at: "2026-08-27T12:00:00Z" }),
  ];
  const [u] = aggregatePeriod(rows, T0, at(600));
  assert.equal(u.samples, 1);
});

test("a later row supplies attribution an earlier one lacked", () => {
  const [u] = aggregatePeriod(
    [stored({ project_id: null }), stored({ sampled_at: at(60).toISOString(), project_id: "p7" })],
    T0,
    at(600),
  );
  assert.equal(u.projectId, "p7");
});

test("deployments are separated and sorted by pod-seconds", () => {
  const usage = aggregatePeriod(
    [
      stored({ deployment_ref: "small", pod_seconds: 10 }),
      stored({ deployment_ref: "big", pod_seconds: 900 }),
    ],
    T0,
    at(600),
  );

  assert.deepEqual(usage.map((u) => u.deploymentRef), ["big", "small"]);
});

test("an unparseable timestamp is skipped rather than poisoning the period", () => {
  const usage = aggregatePeriod([stored({ sampled_at: "not-a-date" }), stored()], T0, at(600));
  assert.equal(usage.length, 1);
  assert.equal(usage[0].samples, 1);
});

test("an empty period aggregates to nothing", () => {
  assert.deepEqual(aggregatePeriod([], T0, at(600)), []);
});

// ── the number the economics turn on ────────────────────────────────────────

const DAY = 86_400;

test("warm fraction over a stored period uses the same arithmetic as the live one", () => {
  const [u] = aggregatePeriod([stored({ pod_seconds: 1728, warm_seconds: 1728 })], T0, at(DAY));
  const w = periodWarmFraction(u, DAY);

  assert.ok(Math.abs(w.fraction - 0.02) < 1e-9, "2% — the model the plan is priced on");
  assert.equal(w.alwaysWarm, false);
});

test("a stored period with observation gaps is degraded and says so", () => {
  const [u] = aggregatePeriod(
    [stored({ pod_seconds: 43_200, warm_seconds: 43_200, unobserved_seconds: 43_200 })],
    T0,
    at(DAY),
  );
  const w = periodWarmFraction(u, DAY);

  assert.equal(w.fraction, 1, "warm for all of the half we observed");
  assert.equal(w.degraded, true, "and not safe to bill from");
});

test("the fleet summary weights per app, not per pod-second", () => {
  // One always-warm app with 100 replicas must not drown out 99 idle ones.
  // The plan's model is a distribution over APPS — 5% busy, 15% warm ~30% of
  // the day, 80% warm ~2% — so the question is what share of apps are warm.
  const rows: StoredSample[] = [
    stored({ deployment_ref: "busy", pod_seconds: 8_640_000, warm_seconds: DAY, peak_pods: 100 }),
    ...Array.from({ length: 9 }, (_, i) =>
      stored({ deployment_ref: `idle_${i}`, pod_seconds: 1728, warm_seconds: 1728 }),
    ),
  ];

  const summary = fleetWarmSummary(aggregatePeriod(rows, T0, at(DAY)), DAY);

  assert.equal(summary.apps, 10);
  assert.equal(summary.alwaysWarm, 1);
  assert.ok(
    summary.meanFraction < 0.15,
    `one busy app must not make the fleet look always-warm — got ${summary.meanFraction}`,
  );
});

test("a fleet that is entirely always-warm reports as such — today's real state", () => {
  const rows = Array.from({ length: 5 }, (_, i) =>
    stored({ deployment_ref: `dpl_${i}`, pod_seconds: DAY, warm_seconds: DAY }),
  );
  const summary = fleetWarmSummary(aggregatePeriod(rows, T0, at(DAY)), DAY);

  assert.equal(summary.alwaysWarm, 5);
  assert.equal(summary.meanFraction, 1);
});

test("an empty fleet does not divide by zero", () => {
  assert.deepEqual(fleetWarmSummary([], DAY), {
    apps: 0,
    meanFraction: 0,
    alwaysWarm: 0,
    degraded: 0,
    podSeconds: 0,
  });
});
