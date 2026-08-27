/**
 * Node version selection.
 *
 *   node --experimental-strip-types --test lib/paas/build/node-version.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveNodeVersion,
  majorFromNvmrc,
  enginesNodeFrom,
  DEFAULT_NODE_MAJOR,
} from "./node-version.ts";

/* ── nothing declared ─────────────────────────────────────────────────────── */

test("a repository that says nothing gets the default", () => {
  const c = resolveNodeVersion({});
  assert.equal(c.major, DEFAULT_NODE_MAJOR);
  assert.match(c.reason, /no Node version declared/);
});

test("an empty engines string is not a constraint", () => {
  assert.equal(resolveNodeVersion({ enginesNode: "   " }).major, DEFAULT_NODE_MAJOR);
});

/* ── .nvmrc wins, because a developer wrote it to say what they run ───────── */

test(".nvmrc pins the major", () => {
  const c = resolveNodeVersion({ nvmrc: "20.11.0\n" });
  assert.equal(c.major, 20);
});

test(".nvmrc accepts a leading v", () => {
  assert.equal(resolveNodeVersion({ nvmrc: "v18\n" }).major, 18);
});

test(".nvmrc OUTRANKS engines, and they are allowed to disagree", () => {
  const c = resolveNodeVersion({ nvmrc: "18", enginesNode: ">=20" });
  assert.equal(c.major, 18);
});

test("an alias in .nvmrc falls through instead of guessing", () => {
  // lts/hydrogen is 18, but resolving that needs a table that goes stale.
  assert.equal(majorFromNvmrc("lts/hydrogen"), null);
  const c = resolveNodeVersion({ nvmrc: "lts/hydrogen", enginesNode: "^20" });
  assert.equal(c.major, 20);
});

test("A PIN WE CANNOT HONOUR SAYS SO", () => {
  // Silently building 16 on 22 is how somebody ends up debugging a runtime
  // they never chose.
  const c = resolveNodeVersion({ nvmrc: "16" });
  assert.equal(c.major, DEFAULT_NODE_MAJOR);
  assert.match(c.reason, /does not offer/);
});

/* ── engines ranges ───────────────────────────────────────────────────────── */

test("an exact major is honoured", () => {
  assert.equal(resolveNodeVersion({ enginesNode: "18" }).major, 18);
  assert.equal(resolveNodeVersion({ enginesNode: "18.x" }).major, 18);
  assert.equal(resolveNodeVersion({ enginesNode: "^18.17.0" }).major, 18);
  assert.equal(resolveNodeVersion({ enginesNode: "~18.20.1" }).major, 18);
});

test("A FLOOR IS NOT A TARGET", () => {
  // ">=18" says 18 is the oldest acceptable, not the one they want.
  const c = resolveNodeVersion({ enginesNode: ">=18" });
  assert.equal(c.major, DEFAULT_NODE_MAJOR);
});

test("a floor above the default moves us up, not down", () => {
  assert.equal(resolveNodeVersion({ enginesNode: ">=24" }).major, 24);
});

test("an upper bound is respected", () => {
  assert.equal(resolveNodeVersion({ enginesNode: ">=18 <19" }).major, 18);
  assert.equal(resolveNodeVersion({ enginesNode: ">=18 <=20" }).major, 20);
});

test("alternatives take the newest branch we support", () => {
  assert.equal(resolveNodeVersion({ enginesNode: "18 || 20" }).major, 20);
  assert.equal(resolveNodeVersion({ enginesNode: "18 || 22" }).major, 22);
});

test("a range matching nothing we offer falls back and explains", () => {
  const c = resolveNodeVersion({ enginesNode: "^16.0.0" });
  assert.equal(c.major, DEFAULT_NODE_MAJOR);
  assert.match(c.reason, /matches no Node/);
});

test("a patch-level floor does not disqualify its own major", () => {
  // node:18-alpine is far past 18.17, so 18 satisfies this.
  assert.equal(resolveNodeVersion({ enginesNode: ">=18.17.0 <19" }).major, 18);
});

/* ── reading it out of a manifest ─────────────────────────────────────────── */

test("engines.node is read from package.json", () => {
  assert.equal(enginesNodeFrom(JSON.stringify({ engines: { node: ">=20" } })), ">=20");
});

test("a manifest with no engines is not an error", () => {
  assert.equal(enginesNodeFrom(JSON.stringify({ name: "x" })), null);
});

test("AN UNPARSEABLE MANIFEST IS NOT A VERSION PIN", () => {
  assert.equal(enginesNodeFrom("{ this is not json"), null);
  assert.equal(enginesNodeFrom(undefined), null);
});

test("a non-string engines.node is ignored rather than coerced", () => {
  assert.equal(enginesNodeFrom(JSON.stringify({ engines: { node: 20 } })), null);
});

/* ── the predicates can actually fail ─────────────────────────────────────── */

test("EVERY BRANCH ABOVE CAN ACTUALLY FAIL", () => {
  // If resolve always returned the default, most tests here would still pass.
  assert.notEqual(resolveNodeVersion({ enginesNode: "18" }).major, DEFAULT_NODE_MAJOR);
  assert.notEqual(resolveNodeVersion({ nvmrc: "20" }).major, DEFAULT_NODE_MAJOR);
  // And if it never returned the default, these would fail instead.
  assert.equal(resolveNodeVersion({}).major, DEFAULT_NODE_MAJOR);
});
