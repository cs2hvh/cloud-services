/**
 * Sampling cadence tests.
 *
 *   node --test lib/paas/telemetry/cadence.test.ts
 *
 * The case that matters is the one that shipped: a cadence that CANNOT produce
 * a measurement, running on a schedule, collecting for it anyway, and saying
 * nothing. A blank column reads exactly like an app with no traffic.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { SHORT_WINDOW_SECONDS, checkCadence, minimumSamples } from "./cadence.ts";
import { MIN_INTERVALS } from "./traffic.ts";

// ── the schedule that was actually wrong ────────────────────────────────────

test("--samples 2 can never produce a traffic verdict, and says so", () => {
  // The 15-minute sweep ran exactly this. It wrote usage rows forever while
  // the traffic half was structurally impossible, and the only symptom would
  // have been a permanently blank column.
  const v = checkCadence({ samples: 2, intervalSeconds: 30 });

  assert.equal(v.intervals, 1);
  assert.equal(v.yields.usageRows, true, "it did collect usage — that half worked");
  assert.equal(v.yields.trafficShape, false);
  assert.equal(v.degraded, true);
  assert.match(v.warnings.join(" "), /can never produce a verdict/);
  assert.match(v.warnings.join(" "), /--samples 5 or more/);
});

test("the corrected cadence produces everything", () => {
  const v = checkCadence({ samples: 5, intervalSeconds: 20 });

  assert.equal(v.intervals, MIN_INTERVALS);
  assert.deepEqual(v.yields, { usageRows: true, warmFraction: true, trafficShape: true });
  assert.equal(v.degraded, false);
});

test("minimumSamples is derived from the requirement, not a copied number", () => {
  // The mis-tuned job happened because a number was picked rather than
  // computed. A scheduler configured from this cannot drift from the
  // classifier's own floor.
  assert.equal(minimumSamples(), MIN_INTERVALS + 1);
  assert.equal(checkCadence({ samples: minimumSamples(), intervalSeconds: 60 }).degraded, false);
  assert.equal(checkCadence({ samples: minimumSamples() - 1, intervalSeconds: 60 }).degraded, true);
});

// ── one sample records nothing at all ───────────────────────────────────────

test("a single sample writes no rows, and that is called out rather than discovered", () => {
  // The first sample of any period attributes zero by design. A one-sample run
  // completes successfully and records nothing — which would look like a fleet
  // using no resources.
  const v = checkCadence({ samples: 1, intervalSeconds: 30 });

  assert.equal(v.intervals, 0);
  assert.equal(v.yields.usageRows, false);
  assert.equal(v.yields.warmFraction, false);
  assert.match(v.warnings[0], /cannot write a single usage row/);
  assert.match(v.warnings[0], /complete successfully and record nothing/);
});

test("zero or negative samples do not produce negative intervals", () => {
  for (const samples of [0, -3]) {
    const v = checkCadence({ samples, intervalSeconds: 30 });
    assert.equal(v.intervals, 0, String(samples));
    assert.equal(v.windowSeconds, 0);
  }
});

// ── a real window, versus a real number ─────────────────────────────────────

test("a short window is flagged as proof-the-meter-works, not as the number", () => {
  const v = checkCadence({ samples: 5, intervalSeconds: 20 });

  assert.ok(v.windowSeconds < SHORT_WINDOW_SECONDS);
  assert.match(v.warnings.join(" "), /describes a moment rather than a habit/);
  assert.equal(v.degraded, false, "a short window is honest, not broken");
});

test("a window past the short bound raises nothing", () => {
  const v = checkCadence({ samples: 12, intervalSeconds: 60 });

  assert.equal(v.windowSeconds, 11 * 60);
  assert.deepEqual(v.warnings, []);
  assert.equal(v.degraded, false);
});

test("degraded means impossible, not merely brief", () => {
  // A short window still yields every measurement — it just yields a small
  // one. Conflating "brief" with "cannot" would make the flag useless.
  const brief = checkCadence({ samples: 5, intervalSeconds: 5 });
  const impossible = checkCadence({ samples: 3, intervalSeconds: 600 });

  assert.equal(brief.degraded, false);
  assert.equal(impossible.degraded, true);
  assert.ok(impossible.windowSeconds > brief.windowSeconds, "the long one is the broken one");
});

// ── the window arithmetic ───────────────────────────────────────────────────

test("the window is intervals × interval, not samples × interval", () => {
  // Five samples 20s apart span 80 seconds, not 100. Getting this wrong
  // overstates every window by one interval and would make a too-short run
  // look adequate.
  const v = checkCadence({ samples: 5, intervalSeconds: 20 });
  assert.equal(v.windowSeconds, 80);
});
