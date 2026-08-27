/**
 * Test-only: no test may IMPORT a script.
 *
 * A SCRIPT IS NOT A MODULE. Everything under `scripts/` runs its work at the
 * top level — that is what makes it a script. Importing one executes it, so a
 * test that imports a script runs that script every time the suite runs.
 *
 * The deploy lane hit this and reported it: a test importing `mayReap` from
 * `preview-reap-apply.ts` made the whole suite perform live database reads and
 * a reap dry-run on every invocation, while reporting 688 passing. One `argv`
 * away from a test suite that deletes.
 *
 * WHY A TEST AND NOT A NOTE. The tell is output appearing above your
 * assertions, and it is INVISIBLE whenever the script happens to succeed —
 * which is exactly when a destructive script is most dangerous. They found it
 * by running the file without credentials and seeing "control plane
 * unreachable" printed above the passing assertions. With credentials it was
 * completely silent. A failure mode that hides when things go well is not one
 * anybody will notice by reading.
 *
 * READING a script's source is fine and several suites here do it —
 * `exit-contract`, `write-safety` and `admin-boundary` all walk real files with
 * `readFileSync`. Text cannot execute. The prohibition is on `import`, which
 * can.
 *
 * The fix is always the same: move the pure function into a module both can
 * import, which is what makes it testable in the first place.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Every `*.test.ts` under lib/, both lanes. The rule is repo-wide. */
function testFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) testFiles(abs, out);
    else if (entry.endsWith(".test.ts")) out.push(abs);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Static `from "…"` and dynamic `import("…")`. Both execute the target. */
function importedSpecifiers(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/\bfrom\s+["']([^"']+)["']/g)) out.push(m[1]);
  for (const m of src.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]);
  return out;
}

test("the suite is looking at real test files, not an empty tree", () => {
  // Every check below is a search, and a search over nothing passes. A wrong
  // root would make this decorative while reporting green.
  const found = testFiles(join(ROOT, "lib"));
  assert.ok(found.length >= 20, `expected the lib test files, found ${found.length}`);
  assert.ok(found.some((f) => f.endsWith("preview-index.test.ts")));
});

test("no test imports anything under scripts/", () => {
  const offenders: string[] = [];

  for (const abs of testFiles(join(ROOT, "lib"))) {
    const src = stripComments(readFileSync(abs, "utf8"));
    for (const spec of importedSpecifiers(src)) {
      // Matches "../../scripts/v2/x.ts" and "@/scripts/..." alike. A specifier
      // that merely mentions the word in a path segment like "descripts" would
      // not, because the boundary is required.
      if (/(^|\/)scripts\//.test(spec)) {
        offenders.push(`${relative(ROOT, abs).replace(/\\/g, "/")} imports ${spec}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `a script runs its work at the top level, so importing one RUNS it — every time the suite runs, ` +
      `silently whenever the script succeeds. Move the pure function into a module instead:\n  ` +
      offenders.join("\n  "),
  );
});

test("reading a script's source is still allowed", () => {
  // The distinction this rule turns on. Three suites here walk real script
  // files with readFileSync; text cannot execute. If this ever fails, the rule
  // above has been written too broadly and will push authors to delete
  // enforcement rather than fix imports.
  const src = readFileSync(join(ROOT, "lib", "paas", "telemetry", "exit-contract.test.ts"), "utf8");
  assert.ok(src.includes("readFileSync"), "exit-contract reads scripts as text");
  assert.deepEqual(
    importedSpecifiers(stripComments(src)).filter((s) => /(^|\/)scripts\//.test(s)),
    [],
    "and imports none of them",
  );
});

test("the checker detects both spellings it has to walk source to find", () => {
  // Proves the matcher works rather than trusting that a clean run means clean.
  // Dynamic import is the one that slips through a static-only check, and it
  // executes just as thoroughly.
  //
  // The forbidden path is ASSEMBLED rather than written out, because the scan
  // above reads this file too and a literal example here is indistinguishable
  // from a real violation — it flagged exactly that on the first run. Excluding
  // this file from the scan would have been the other fix and a worse one: the
  // checker would stop checking the one file guaranteed to contain the pattern.
  const dir = "scr" + "ipts";
  const planted = stripComments(
    [
      `/** Historically this did: from "../../${dir}/v2/x.ts" */`,
      `import { a } from "../paas/thing.ts";`,
      `import { b } from "../../${dir}/v2/preview-reap-apply.ts";`,
      `const c = await import("../../${dir}/v3/drift-sweep.ts");`,
    ].join("\n"),
  );

  const hits = importedSpecifiers(planted).filter((s) => /(^|\/)scripts\//.test(s));
  assert.equal(hits.length, 2, "static and dynamic, and not the one inside the comment");
  assert.ok(hits.some((h) => h.includes("preview-reap-apply")));
  assert.ok(hits.some((h) => h.includes("drift-sweep")));
});

test("this file is scanned like any other, with no self-exemption", () => {
  // Excluding this file was the other way to fix the first failure, and the
  // worse one: a checker that skips itself has a blind spot exactly where the
  // pattern it looks for is most likely to appear.
  //
  // Asserted by looking for this file in the scan's own output rather than by
  // grepping the source for an exemption — the first attempt did the latter,
  // searched for a marker string, and found the marker it had just written into
  // its own assertion. Checking the behaviour has no such problem.
  const scanned = testFiles(join(ROOT, "lib")).map((f) => f.replace(/\\/g, "/"));
  const self = fileURLToPath(import.meta.url).replace(/\\/g, "/");
  assert.ok(scanned.includes(self), "the checker must scan itself");
});
