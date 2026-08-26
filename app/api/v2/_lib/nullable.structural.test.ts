/**
 * No nullable column is dereferenced without a guard, anywhere in the lane.
 *
 * WHY THIS EXISTS, and it is a correction to nullable.test.ts rather than an
 * addition to it.
 *
 * That file sweeps every nullable column through toDeploymentDto and
 * toProjectDto, one field at a time, and it works. It found nothing because
 * those two functions are null-safe. What it could not find is a THIRD
 * serializer, because its inventory is two names written by hand.
 *
 * There were two more:
 *
 *   projects/[ref]/aliases/route.ts   row.deployments.git_sha.slice(0, 7)
 *   dashboard/v2/[ref]/page.tsx       alias.deployments.git_sha.slice(0, 7)
 *
 * Both typed git_sha as `string` beside the deref, so both compiled. The page
 * one is a server component, so the throw escapes the row and takes the whole
 * project view down — a blank page, not a blank cell. Both are reached by any
 * redeploy, because the trigger route inserts git_sha: null on purpose and
 * the build fills it in later.
 *
 * A per-function sweep can only ever cover the functions someone remembered.
 * This scans the source instead, so a serializer written tomorrow is covered
 * the day it is written and nobody has to remember to add it.
 *
 * THE GUARD REPORTS WHAT IT EXAMINED. cloud-app-v2-d8's rule: a check that
 * can only pass or fail has one silent failure mode — matching nothing. This
 * returns the file count and the deref count, and the test asserts both are
 * non-trivial. A regex that mangles itself into matching nothing fails here
 * rather than reporting clean, which is the failure this project found eight
 * variations of in one day.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** app/api/v2/_lib -> app */
const APP_ROOT = join(HERE, "..", "..", "..");

/**
 * Columns that are nullable in paas AND read by this lane. Deliberately the
 * same list nullable.test.ts uses; if they drift apart the shared assertion
 * at the bottom of that file is what notices.
 */
const NULLABLE = [
  "git_sha",
  "git_message",
  "git_author",
  "image_repo",
  "image_digest",
  "error_code",
  "error_message",
  "root_directory",
  "framework",
  "scaled_to_zero_at",
  "started_at",
  "ready_at",
];

/**
 * Anything that makes a dereference safe. Checked over a small window rather
 * than one line, because JSX puts the guard on a different line from the use:
 *
 *   {isPlaceholderSha(alias.deployments.git_sha)
 *     ? alias.deployments.ref
 *     : alias.deployments.git_sha!.slice(0, 7)}
 */
const GUARDS = [
  "?.",
  "=== null",
  "!== null",
  "== null",
  "!= null",
  "isPlaceholderSha",
  "??",
  "Boolean(",
];

const WINDOW = 4;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out);
    } else if (
      (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx")
    ) {
      out.push(full);
    }
  }
  return out;
}

export interface Scan {
  /** Files opened. Zero means the walk is broken, not that the lane is clean. */
  filesExamined: number;
  /** Dereference sites seen at all. Zero means the pattern matches nothing. */
  derefsExamined: number;
  offenders: string[];
}

/**
 * A dereference is `something.<column>.<method>(`. The method call is what
 * makes it a dereference rather than a read — `row.git_sha` alone is fine and
 * is how every safe caller starts.
 */
export function scanForUnguardedDerefs(files: Array<{ path: string; text: string }>): Scan {
  let derefsExamined = 0;
  const offenders: string[] = [];

  for (const file of files) {
    const lines = file.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const column of NULLABLE) {
        const needle = "." + column + ".";
        let at = line.indexOf(needle);
        while (at !== -1) {
          // What follows the column must be an identifier then "(" for this
          // to be a call. `.git_sha.length` is a read of a property that does
          // not exist on null either, so treat any following identifier the
          // same way.
          const after = line.slice(at + needle.length);
          if (/^[A-Za-z_]/.test(after)) {
            derefsExamined++;
            const from = Math.max(0, i - WINDOW);
            const context = lines.slice(from, i + 1).join("\n");
            const guarded = GUARDS.some((g) => context.includes(g));
            if (!guarded) {
              offenders.push(`${file.path}:${i + 1}  ${line.trim()}`);
            }
          }
          at = line.indexOf(needle, at + 1);
        }
      }
    }
  }

  return { filesExamined: files.length, derefsExamined, offenders };
}

function loadLane(): Array<{ path: string; text: string }> {
  const roots = [join(APP_ROOT, "api", "v2"), join(APP_ROOT, "dashboard", "v2")];
  const files: Array<{ path: string; text: string }> = [];
  for (const root of roots) {
    for (const path of sourceFiles(root)) {
      files.push({ path: path.slice(APP_ROOT.length + 1), text: readFileSync(path, "utf8") });
    }
  }
  return files;
}

test("the scan actually reaches the lane's source", () => {
  // The input-side counter. Everything below is vacuous if this is wrong,
  // and a broken path walk would otherwise read as a clean lane.
  const scan = scanForUnguardedDerefs(loadLane());
  assert.ok(scan.filesExamined >= 20, `only opened ${scan.filesExamined} files`);
  assert.ok(
    scan.derefsExamined >= 1,
    "found no nullable dereference anywhere — the pattern has stopped matching"
  );
});

test("no nullable column is dereferenced without a guard", () => {
  const scan = scanForUnguardedDerefs(loadLane());
  assert.deepEqual(
    scan.offenders,
    [],
    `unguarded dereference of a nullable column — this is the null git_sha crash:\n${scan.offenders.join("\n")}`
  );
});

// ── the scan must be able to fail ────────────────────────────────────
// Their eighth instance: watching a check fail is only evidence if the
// failing input actually arrived. These feed it the real shipped lines.

test("it catches the exact line that shipped", () => {
  const scan = scanForUnguardedDerefs([
    {
      path: "fixture.ts",
      text: "const shortSha = row.deployments.git_sha.slice(0, 7);",
    },
  ]);
  assert.equal(scan.derefsExamined, 1, "the fixture must reach the deref counter");
  assert.equal(scan.offenders.length, 1, "the shipped line must be flagged");
});

test("it accepts a guard on an earlier line, as JSX writes it", () => {
  const scan = scanForUnguardedDerefs([
    {
      path: "fixture.tsx",
      text: [
        "{isPlaceholderSha(alias.deployments.git_sha)",
        "  ? alias.deployments.ref",
        "  : alias.deployments.git_sha!.slice(0, 7)}",
      ].join("\n"),
    },
  ]);
  assert.equal(scan.offenders.length, 0, "a guarded multi-line deref is not an offender");
});

test("it does not flag a plain read", () => {
  const scan = scanForUnguardedDerefs([
    { path: "fixture.ts", text: "const sha = row.git_sha;" },
  ]);
  assert.equal(scan.derefsExamined, 0, "a read is not a dereference");
  assert.equal(scan.offenders.length, 0);
});

test("a column not on the list is not checked, and the list is not empty", () => {
  // Guards the mangled-list case: an empty NULLABLE would make every scan
  // return zero offenders while examining nothing.
  assert.ok(NULLABLE.length >= 10, "the nullable column list has been truncated");
  const scan = scanForUnguardedDerefs([
    { path: "fixture.ts", text: "const x = row.queued_at.slice(0, 4);" },
  ]);
  assert.equal(scan.offenders.length, 0, "queued_at is NOT NULL and must not be flagged");
});
