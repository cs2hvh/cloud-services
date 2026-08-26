/**
 * Traffic shape tests.
 *
 *   node --test lib/paas/telemetry/traffic.test.ts
 *
 * Two things get tested hardest: that a counter reset is never read as
 * quiet — that one would sleep the whole fleet in a pass — and that a shape
 * is refused when there is not enough to see one.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KEEP_ALIVE_REGULARITY,
  MIN_INTERVALS,
  QUIET_REQUESTS_PER_HOUR,
  classifyTraffic,
  toIntervals,
  warmthJustified,
  type TrafficReading,
} from "./traffic.ts";

const T0 = Date.parse("2026-08-26T12:00:00Z");
const at = (minutes: number) => T0 + minutes * 60_000;

/** Cumulative readings from per-interval request counts, one per minute. */
function series(perInterval: number[], stepMinutes = 1): TrafficReading[] {
  const out: TrafficReading[] = [{ at: at(0), cumulative: 1000 }];
  let total = 1000;
  perInterval.forEach((n, i) => {
    total += n;
    out.push({ at: at((i + 1) * stepMinutes), cumulative: total });
  });
  return out;
}

// ── the reset, which is the dangerous one ───────────────────────────────────

test("a counter going BACKWARDS is a reset, never zero traffic", () => {
  // Traefik restarting zeroes every router counter at once. Reading "no
  // increase, therefore idle" would mark the entire fleet idle in one pass —
  // the infrastructure lane nearly shipped exactly this.
  const readings: TrafficReading[] = [
    { at: at(0), cumulative: 5000 },
    { at: at(1), cumulative: 5100 },
    { at: at(2), cumulative: 12 }, // Traefik restarted
    { at: at(3), cumulative: 130 },
  ];

  const intervals = toIntervals(readings);
  assert.equal(intervals[1].reset, true);
  assert.equal(intervals[1].requests, 0, "the volume is unknown, not zero");
  assert.equal(intervals[2].reset, false, "the counter resumes normally after");
});

test("a reset interval is excluded from the shape rather than counted as quiet", () => {
  const busy = [200, 200, 200, 200, 200, 200];
  const readings = series(busy);
  // Splice a restart into the middle.
  readings[3] = { at: readings[3].at, cumulative: 5 };

  const v = classifyTraffic(readings);
  assert.equal(v.resets, 1);
  assert.notEqual(v.shape, "no-traffic", "a restart must not make a busy app look idle");
});

test("an all-reset series claims nothing", () => {
  const v = classifyTraffic([
    { at: at(0), cumulative: 900 },
    { at: at(1), cumulative: 10 },
    { at: at(2), cumulative: 5 },
    { at: at(3), cumulative: 2 },
  ]);

  assert.equal(v.shape, "undetermined");
  assert.equal(v.resets, 3);
});

// ── refusing to claim a shape ───────────────────────────────────────────────

test("too few intervals is undetermined, not idle", () => {
  // Every app looks idle immediately after a gateway restart. A shape claimed
  // from a handful of points is noise wearing a verdict's clothes.
  const v = classifyTraffic(series([0, 0]));

  assert.equal(v.shape, "undetermined");
  assert.match(v.reason, /looks idle right after a gateway restart/);
  assert.equal(warmthJustified(v.shape).justified, null);
});

test("one reading alone yields no intervals at all", () => {
  assert.deepEqual(toIntervals([{ at: at(0), cumulative: 5 }]), []);
  assert.equal(classifyTraffic([{ at: at(0), cumulative: 5 }]).shape, "undetermined");
});

test("out-of-order or duplicate timestamps are skipped rather than producing negative windows", () => {
  const intervals = toIntervals([
    { at: at(5), cumulative: 100 },
    { at: at(5), cumulative: 110 },
    { at: at(1), cumulative: 120 },
    { at: at(6), cumulative: 130 },
  ]);

  assert.ok(intervals.every((i) => i.seconds > 0));
});

// ── the shapes ──────────────────────────────────────────────────────────────

test("a genuinely idle app is no-traffic and is the clearest scale-to-zero case", () => {
  const v = classifyTraffic(series([0, 0, 0, 0, 0, 0]));

  assert.equal(v.shape, "no-traffic");
  assert.equal(v.requests, 0);
  assert.equal(warmthJustified(v.shape).justified, false);
  assert.match(warmthJustified(v.shape).note, /serving nobody/);
});

test("a monitor pinging once a minute is keep-alive-shaped", () => {
  // The case the plan names as breaking the cost model. Perfectly even, low
  // volume: 60 requests/hour arriving one per minute.
  const v = classifyTraffic(series([1, 1, 1, 1, 1, 1, 1, 1]));

  assert.equal(v.shape, "keep-alive-shaped");
  assert.equal(v.regularity, 0, "a pinger has no spread at all");
  assert.match(v.reason, /shape of an automated keep-alive/);
  assert.match(v.reason, /pattern and not an intent/);
  assert.equal(warmthJustified(v.shape).justified, false);
});

test("a near-even pinger still counts — real monitors jitter slightly", () => {
  const v = classifyTraffic(series([1, 1, 2, 1, 1, 1, 2, 1]));
  assert.equal(v.shape, "keep-alive-shaped");
  assert.ok((v.regularity as number) < KEEP_ALIVE_REGULARITY);
});

test("bursty low-volume traffic is organic, not a pinger", () => {
  // A handful of real visits: quiet overall, but clustered. Volume alone
  // cannot tell this from a monitor; shape can.
  const v = classifyTraffic(series([0, 0, 7, 0, 0, 0, 4, 0]));

  assert.equal(v.shape, "organic");
  assert.ok((v.regularity as number) > KEEP_ALIVE_REGULARITY);
  assert.equal(warmthJustified(v.shape).justified, true);
  assert.match(warmthJustified(v.shape).note, /customer getting value/);
});

test("high even traffic is organic — evenness alone is not a keep-alive", () => {
  // A busy API can be very regular. Only LOW volume plus evenness is the
  // pinger signature; treating evenness alone as suspicious would flag the
  // platform's best customers.
  const v = classifyTraffic(series([500, 505, 495, 500, 502, 498]));

  assert.equal(v.shape, "organic");
  assert.ok(v.requestsPerHour > QUIET_REQUESTS_PER_HOUR);
  assert.match(v.reason, /too much volume to be a keep-alive/);
});

test("a 60-second pinger — exactly 60 req/hour — is inside the quiet bound", () => {
  // The bug this caught: QUIET was 60 and the check is `<`, so the single
  // most common keep-alive interval in the world landed exactly on the wrong
  // side of the line and read as organic. The canonical example is the one
  // worth testing with.
  const v = classifyTraffic(series(new Array(8).fill(1)));

  assert.equal(v.requestsPerHour, 60);
  assert.ok(60 < QUIET_REQUESTS_PER_HOUR, "the bound must admit a once-a-minute monitor");
  assert.equal(v.shape, "keep-alive-shaped");
});

test("a 30-second pinger lands exactly ON the bound, and the bound is inclusive", () => {
  // The first fix moved the bug up one step. Pingers run on round intervals
  // and produce round rates, so any EXCLUSIVE bound has a canonical case
  // sitting precisely on it. 2/min = 120/hour = the bound itself.
  const v = classifyTraffic(series(new Array(8).fill(2)));

  assert.equal(v.requestsPerHour, 120);
  assert.equal(v.shape, "keep-alive-shaped", "exactly at the bound must count as quiet");
});

test("every common keep-alive interval is covered", () => {
  // 5 minutes (12/hour), 60s (60/hour), 30s (120/hour). All three are the
  // defaults on widely used uptime services.
  const fiveMin = classifyTraffic(series([1, 1, 1, 1, 1, 1], 5));
  const oneMin = classifyTraffic(series(new Array(8).fill(1)));
  const thirtySec = classifyTraffic(series(new Array(8).fill(2)));

  for (const [name, v] of [["5min", fiveMin], ["60s", oneMin], ["30s", thirtySec]] as const) {
    assert.equal(v.shape, "keep-alive-shaped", `${name} pinger, ${v.requestsPerHour}/hour`);
  }
});

test("just above the bound is organic, so the bound still bounds something", () => {
  const v = classifyTraffic(series(new Array(8).fill(3)));
  assert.equal(v.requestsPerHour, 180);
  assert.equal(v.shape, "organic");
});

// ── rates, not counts ───────────────────────────────────────────────────────

test("uneven sampling intervals do not manufacture variance", () => {
  // Comparing raw counts across a 1-minute and a 5-minute window would look
  // wildly irregular for perfectly steady traffic, and would report a pinger
  // as organic every time the sampler hiccupped.
  const readings: TrafficReading[] = [
    { at: at(0), cumulative: 0 },
    { at: at(1), cumulative: 1 }, // 1/min
    { at: at(6), cumulative: 6 }, // 5 requests over 5 min = 1/min
    { at: at(7), cumulative: 7 },
    { at: at(12), cumulative: 12 },
    { at: at(13), cumulative: 13 },
  ];

  const v = classifyTraffic(readings);
  assert.ok((v.regularity as number) < 0.01, `steady traffic must read steady, got ${v.regularity}`);
  assert.equal(v.shape, "keep-alive-shaped");
});

test("observed seconds counts only usable intervals", () => {
  const readings = series([1, 1, 1, 1, 1]);
  readings[2] = { at: readings[2].at, cumulative: 3 }; // reset
  const v = classifyTraffic(readings);

  assert.ok(v.observedSeconds < 5 * 60, "the reset interval is not observation");
});

// ── the join that makes it worth measuring ──────────────────────────────────

test("warmth is justified only by organic traffic", () => {
  assert.equal(warmthJustified("organic").justified, true);
  assert.equal(warmthJustified("keep-alive-shaped").justified, false);
  assert.equal(warmthJustified("no-traffic").justified, false);
  assert.equal(warmthJustified("undetermined").justified, null);
});

test("the keep-alive note points at a policy answer, not a technical one", () => {
  // The plan lists warm-time pricing as an open BUSINESS decision. This
  // measurement exists to put a number under that conversation, not to
  // resolve it.
  assert.match(warmthJustified("keep-alive-shaped").note, /pricing or policy answer/);
});

test("MIN_INTERVALS is a real floor, not a formality", () => {
  assert.ok(MIN_INTERVALS >= 3, "two points cannot show a shape");
  const justUnder = classifyTraffic(series(new Array(MIN_INTERVALS - 1).fill(1)));
  const justOver = classifyTraffic(series(new Array(MIN_INTERVALS).fill(1)));

  assert.equal(justUnder.shape, "undetermined");
  assert.notEqual(justOver.shape, "undetermined");
});
