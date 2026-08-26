/**
 * Test-only: no script in this lane may exit on a bare number.
 *
 * WHY THIS IS A TEST AND NOT A CONVENTION. `process.exit(1)` used to mean
 * "found drift" in every script here. It now means "could not run" — the exact
 * opposite kind of event, needing the opposite response. Both spellings are the
 * same three characters, so a reviewer cannot tell a correct `exit(1)` from a
 * relapse by looking at it, and a relapse is invisible until a scheduler acts
 * on it.
 *
 * A named constant carries its meaning to the reader. That is the whole
 * argument, and it is enforceable, so it is enforced rather than asserted.
 *
 * This lane already lost a day's worth of sweep results to the ambiguity:
 * sweep-r2-drift ran correctly every hour and reported its findings to
 * Kubernetes as a crash, because the deployed copy predated the contract.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCRIPT_DIR = join(ROOT, "scripts", "v3");

/**
 * Comments are stripped before matching. A docblock explaining the old
 * `process.exit(clean ? 0 : 1)` convention is describing the problem, not
 * committing it, and flagging it would push authors to delete the explanation.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function scripts(): Array<{ name: string; source: string }> {
  return readdirSync(SCRIPT_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((name) => ({ name, source: stripComments(readFileSync(join(SCRIPT_DIR, name), "utf8")) }));
}

test("the suite is looking at real scripts, not an empty directory", () => {
  // Without this, a wrong path makes every check below pass by finding nothing
  // to check — which is the failure mode this whole lane exists to catch.
  const found = scripts();
  assert.ok(found.length >= 10, `expected the v3 scripts, found ${found.length}`);
  assert.ok(found.some((s) => s.name === "drift-sweep.ts"));
});

test("no script exits on a bare non-zero number", () => {
  const offenders: string[] = [];
  for (const { name, source } of scripts()) {
    // exit(0) is unambiguous and allowed; every other literal must be named.
    for (const m of source.matchAll(/process\.exit\(\s*([0-9]+)\s*\)/g)) {
      if (m[1] !== "0") offenders.push(`${name}: process.exit(${m[1]})`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `use the named constants from exit-codes.ts — a bare 1 cannot be told from the old ` +
      `"found drift" convention by reading it:\n  ${offenders.join("\n  ")}`,
  );
});

test("a script that exits non-zero imports the contract that names its codes", () => {
  const offenders: string[] = [];
  for (const { name, source } of scripts()) {
    const usesNamed = /process\.exit\(\s*EXIT_/.test(source) || /\bEXIT_[A-Z_]+\b/.test(source);
    if (usesNamed && !source.includes("telemetry/exit-codes.ts")) {
      offenders.push(`${name}: uses EXIT_* without importing exit-codes.ts`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join("\n  "));
});

test("the checker detects a violation it has to walk a real file to find", () => {
  // Proves the matcher works rather than trusting that a clean run means clean.
  // Every check above is a search, and a search that silently matches nothing
  // passes — which would make this whole suite decorative.
  const planted = stripComments(`
    /** Historically this was process.exit(1) for findings. */
    import { EXIT_CLEAN } from "../../lib/paas/telemetry/exit-codes.ts";
    if (bad) process.exit(3);
    process.exit(EXIT_CLEAN);
  `);
  const hits = [...planted.matchAll(/process\.exit\(\s*([0-9]+)\s*\)/g)].filter((m) => m[1] !== "0");
  assert.equal(hits.length, 1, "should find the planted bare exit");
  assert.equal(hits[0][1], "3");
  // And the mention inside the docblock must NOT count.
  assert.ok(!planted.includes("Historically"), "comments should have been stripped");
});
