import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scheduleIntervalMinutes,
  translatesFindings,
  sweepHealth,
  sweepHealthReport,
  type CronJobLike,
} from "./sweep-health.ts";

const NOW = Date.parse("2026-08-26T17:00:00Z");
const TRANSLATING = [
  "sh",
  "-c",
  'node --experimental-strip-types /src/scripts/v3/r2-drift.ts; c=$?; case $c in 10|11) echo "[sweep] found"; exit 0;; *) exit $c;; esac',
];
const BARE = ["sh", "-c", "node --experimental-strip-types /src/scripts/v3/r2-drift.ts"];

function job(over: Partial<CronJobLike> = {}): CronJobLike {
  return {
    name: "r2-drift",
    schedule: "12 * * * *",
    suspended: false,
    lastScheduleTime: "2026-08-26T16:12:00Z",
    lastSuccessfulTime: "2026-08-26T16:12:05Z",
    command: TRANSLATING,
    ...over,
  };
}

test("schedule intervals are read for the forms these sweeps use", () => {
  assert.equal(scheduleIntervalMinutes("*/15 * * * *"), 15);
  assert.equal(scheduleIntervalMinutes("8,23,38,53 * * * *"), 15);
  assert.equal(scheduleIntervalMinutes("12 * * * *"), 60);
});

test("an unparsed schedule is null, not a guessed interval", () => {
  // A guessed interval either invents an overdue verdict or, worse, suppresses
  // a real one by assuming a longer cadence than the sweep actually has.
  assert.equal(scheduleIntervalMinutes("0 */6 * * *"), null);
  assert.equal(scheduleIntervalMinutes("bananas"), null);
  assert.equal(scheduleIntervalMinutes("* * *"), null);
});

test("the exit-code translation is detected in the deployed command", () => {
  assert.equal(translatesFindings(TRANSLATING), true);
  assert.equal(translatesFindings(BARE), false);
});

test("a sweep succeeding on schedule is healthy", () => {
  const h = sweepHealth(job(), NOW);
  assert.equal(h.status, "healthy");
  assert.equal(h.domainUnobserved, false);
});

test("never having succeeded means its domain is unobserved, not clean", () => {
  // The live case: r2-drift fired twice and failed twice. Its findings have
  // never been seen, so its silence is not evidence of no drift.
  const h = sweepHealth(job({ lastSuccessfulTime: null }), NOW);
  assert.equal(h.status, "never-succeeded");
  assert.equal(h.domainUnobserved, true);
  assert.match(h.detail, /not evidence of anything/);
});

test("failing after a past success is distinct from never having succeeded", () => {
  // It HAS observed its domain, just not lately. Collapsing the two would
  // either overstate this case or understate the other.
  const h = sweepHealth(
    job({ lastScheduleTime: "2026-08-26T16:12:00Z", lastSuccessfulTime: "2026-08-26T15:12:05Z" }),
    NOW,
  );
  assert.equal(h.status, "failing");
  assert.equal(h.domainUnobserved, false);
});

test("a suspended sweep is not a fault but its domain is still unobserved", () => {
  const h = sweepHealth(job({ suspended: true }), NOW);
  assert.equal(h.status, "suspended");
  assert.equal(h.domainUnobserved, true);
});

test("a sweep that has never fired is not reported as failing", () => {
  const h = sweepHealth(job({ lastScheduleTime: null, lastSuccessfulTime: null }), NOW);
  assert.equal(h.status, "never-scheduled");
  assert.equal(h.domainUnobserved, true);
});

test("one missed tick is tolerated; a real lapse is not", () => {
  const oneMissed = sweepHealth(
    job({ schedule: "*/15 * * * *", lastScheduleTime: "2026-08-26T16:40:00Z", lastSuccessfulTime: "2026-08-26T16:40:00Z" }),
    NOW,
  );
  assert.equal(oneMissed.status, "healthy");

  const lapsed = sweepHealth(
    job({ schedule: "*/15 * * * *", lastScheduleTime: "2026-08-26T14:00:00Z", lastSuccessfulTime: "2026-08-26T14:00:00Z" }),
    NOW,
  );
  assert.equal(lapsed.status, "overdue");
});

test("overdue is never claimed when the cadence cannot be read", () => {
  const h = sweepHealth(
    job({ schedule: "0 */6 * * *", lastScheduleTime: "2026-08-20T00:00:00Z", lastSuccessfulTime: "2026-08-20T00:00:00Z" }),
    NOW,
  );
  assert.equal(h.intervalMinutes, null);
  assert.equal(h.status, "healthy", "an unknown cadence cannot support an overdue claim");
});

test("a green sweep whose findings would read as failures is not clean", () => {
  // THE STATE THIS MODULE WAS WRITTEN FOR. Every sweep succeeding, because not
  // one of them has found anything yet.
  const r = sweepHealthReport([job({ command: BARE })], NOW);
  assert.equal(r.sweeps[0].status, "healthy");
  assert.equal(r.untranslated, 1);
  assert.equal(r.clean, false, "green ticks alone must not report clean");
  assert.match(r.sweeps[0].detail, /would be reported as a failure/);
});

test("a fully working fleet reports clean", () => {
  const r = sweepHealthReport([job(), job({ name: "dns-drift", schedule: "26 * * * *" })], NOW);
  assert.equal(r.clean, true);
  assert.equal(r.unobserved, 0);
  assert.equal(r.untranslated, 0);
});

test("the worst sweep is reported first", () => {
  const r = sweepHealthReport(
    [job({ name: "ok" }), job({ name: "dead", lastSuccessfulTime: null }), job({ name: "also-ok" })],
    NOW,
  );
  assert.equal(r.sweeps[0].name, "dead");
  assert.equal(r.unobserved, 1);
});
