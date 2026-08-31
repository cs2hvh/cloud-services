import { test } from "node:test";
import assert from "node:assert/strict";
import { cpuMillis, memBytes, sameCpu, sameMem } from "./reconciler.ts";

/**
 * Kubernetes quantity comparison.
 *
 * WHY THIS IS ITS OWN FILE. The reconciler rolls pods when it sees drift, so a
 * comparison that reports drift between a spec and itself does not produce a
 * wrong log line — it produces a perpetual rollout. Every run restarts every
 * pod, forever, and the symptom is not an error but an unexplained churn that
 * looks like instability in the apps rather than a bug in the loop.
 *
 * It was found live: `sizing changed: 50m/512Mi -> 50m/512Mi`. The API server
 * canonicalises what it stores, so a spec written as `1000m` comes back as `1`,
 * and a string comparison sees two different values that are the same number.
 */

test("the API server's canonical forms compare equal", () => {
  // The exact pair that caused it: we write 1000m, Kubernetes returns 1.
  assert.ok(sameCpu("1000m", "1"), "1000m and 1 are the same CPU");
  assert.ok(sameCpu("1", "1000m"));
  assert.ok(sameCpu("2000m", "2"));
  assert.ok(sameCpu("50m", "50m"));
  assert.ok(sameMem("1024Mi", "1Gi"), "1024Mi and 1Gi are the same memory");
  assert.ok(sameMem("512Mi", "512Mi"));
});

test("genuinely different quantities still compare unequal", () => {
  // The paired proof. A sameCpu that returned true unconditionally would pass
  // every assertion above while disabling drift detection entirely — the tier
  // would never be corrected and nothing would say so.
  assert.ok(!sameCpu("50m", "100m"));
  assert.ok(!sameCpu("1", "2"));
  assert.ok(!sameMem("256Mi", "512Mi"));
  assert.ok(!sameMem("1Gi", "2Gi"));
  assert.ok(!sameMem("1Mi", "1Ki"));
});

test("decimal CPU is handled — 0.5 is 500m", () => {
  assert.equal(cpuMillis("0.5"), 500);
  assert.equal(cpuMillis("0.1"), 100);
  assert.ok(sameCpu("0.5", "500m"));
});

test("SI and binary memory units are distinct, because they are", () => {
  // 1M is 1,000,000 bytes; 1Mi is 1,048,576. Treating them as equal would
  // under-provision by 5% at every tier and be invisible.
  assert.equal(memBytes("1Mi"), 1048576);
  assert.equal(memBytes("1M"), 1000000);
  assert.ok(!sameMem("1Mi", "1M"));
});

test("unreadable input is never equality", () => {
  // The empty-vs-unknown rule, applied here. If a quantity cannot be parsed we
  // do NOT know it matches, and reporting a match would silently stop the loop
  // correcting that field forever.
  assert.equal(cpuMillis(null), null);
  assert.equal(cpuMillis("banana"), null);
  assert.equal(memBytes("512Xi"), null);
  assert.ok(!sameCpu(null, "50m"));
  assert.ok(!sameCpu(null, null), "two unreadable values are not equal, they are two unknowns");
  assert.ok(!sameMem("nonsense", "512Mi"));
});

test("bare byte counts parse", () => {
  assert.equal(memBytes("1024"), 1024);
  assert.ok(sameMem("1024", "1Ki"));
});
