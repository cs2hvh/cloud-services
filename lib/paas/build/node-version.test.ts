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

/* ── .nvmrc raises the floor and never lowers the ceiling ─────────────────── */

test("A STALE .nvmrc DOES NOT DRAG THE BUILD BACKWARDS", () => {
  // sveltejs/realworld ships `.nvmrc` containing 20 while a package in its tree
  // declares engines.node >=22.12.0. Honouring the file as a hard pin made pnpm
  // refuse the install outright on a build that had previously served.
  const c = resolveNodeVersion({ nvmrc: "20\n" });
  assert.equal(c.major, DEFAULT_NODE_MAJOR);
  assert.match(c.reason, /pin engines\.node to insist/);
});

test(".nvmrc can move us to a NEWER major", () => {
  assert.equal(resolveNodeVersion({ nvmrc: "24\n" }).major, 24);
});

test(".nvmrc accepts a leading v", () => {
  assert.equal(resolveNodeVersion({ nvmrc: "v24\n" }).major, 24);
});

test("ENGINES OUTRANKS .nvmrc, and they are allowed to disagree", () => {
  // engines is published, and npm and pnpm enforce it. .nvmrc is a local note.
  const c = resolveNodeVersion({ nvmrc: "24", enginesNode: "^18.17.0" });
  assert.equal(c.major, 18);
});

test("an alias in .nvmrc is not guessed at", () => {
  // lts/hydrogen is 18, but resolving that needs a table that goes stale.
  assert.equal(majorFromNvmrc("lts/hydrogen"), null);
  assert.equal(resolveNodeVersion({ nvmrc: "lts/hydrogen" }).major, DEFAULT_NODE_MAJOR);
});

test("an .nvmrc naming a major we do not offer says so", () => {
  const c = resolveNodeVersion({ nvmrc: "23" });
  assert.equal(c.major, DEFAULT_NODE_MAJOR);
  assert.match(c.reason, /does not offer/);
});

/* ── engines ranges ───────────────────────────────────────────────────────── */

test("an exact major is honoured, including downward", () => {
  assert.equal(resolveNodeVersion({ enginesNode: "18" }).major, 18);
  assert.equal(resolveNodeVersion({ enginesNode: "18.x" }).major, 18);
  assert.equal(resolveNodeVersion({ enginesNode: "^18.17.0" }).major, 18);
  assert.equal(resolveNodeVersion({ enginesNode: "~18.20.1" }).major, 18);
});

test("A FLOOR IS NOT A TARGET", () => {
  // ">=18" says 18 is the oldest acceptable, not the one they want.
  assert.equal(resolveNodeVersion({ enginesNode: ">=18" }).major, DEFAULT_NODE_MAJOR);
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
  // If resolve always returned the default, half these tests would still pass.
  assert.notEqual(resolveNodeVersion({ enginesNode: "18" }).major, DEFAULT_NODE_MAJOR);
  assert.notEqual(resolveNodeVersion({ nvmrc: "24" }).major, DEFAULT_NODE_MAJOR);
  // And if it never returned the default, these would fail instead.
  assert.equal(resolveNodeVersion({}).major, DEFAULT_NODE_MAJOR);
  assert.equal(resolveNodeVersion({ nvmrc: "20" }).major, DEFAULT_NODE_MAJOR);
});
