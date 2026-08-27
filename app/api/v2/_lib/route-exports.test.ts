/**
 * A route module exports only handlers and config.
 *
 * WHY THIS IS A TEST. `next build` failed on:
 *
 *   app/api/v2/git/connect/route.ts
 *   Property 'STATE_COOKIE' is incompatible with index signature.
 *     Type '"v2_gh_install_state"' is not assignable to type 'never'.
 *
 * App Router route modules may export the HTTP method handlers and a fixed
 * set of config values, and nothing else. Next enforces it with a validator
 * it GENERATES into .next/types during a build, mapping every other export to
 * `never`. So the rule does not exist until a build runs, and `tsc --noEmit`
 * over the repo's own tsconfig reports the file clean.
 *
 * That is the second tool on this project to report success on code that
 * could not ship, after `node --experimental-strip-types --check` exited 0 on
 * a file with nine syntax errors. The lesson both times: a green checker is
 * evidence about what that checker examines, never about what it does not.
 * This test closes the gap in seconds rather than in a 90-second build.
 *
 * IT ALSO CATCHES A DESIGN SMELL. The offending constant was imported by
 * git/callback/route.ts FROM git/connect/route.ts. Routes are endpoints, not
 * modules; importing one drags its handlers into another's graph to reach a
 * string. Shared values belong in _lib, which is where that one now lives.
 *
 * REPORTS WHAT IT EXAMINED. routesExamined and exportsExamined are asserted
 * non-trivial, because a scan that matched nothing would otherwise be
 * indistinguishable from a clean lane.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** app/api/v2/_lib -> app/api/v2 */
const API_ROOT = join(HERE, "..");

/** Everything App Router permits a route module to export. */
const ALLOWED = new Set([
  // handlers
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  // route segment config
  "dynamic",
  "dynamicParams",
  "revalidate",
  "fetchCache",
  "runtime",
  "preferredRegion",
  "maxDuration",
  "generateStaticParams",
  "config",
]);

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) routeFiles(full, out);
    else if (entry === "route.ts" || entry === "route.tsx") out.push(full);
  }
  return out;
}

export interface ExportScan {
  routesExamined: number;
  exportsExamined: number;
  /** Exports App Router will reject at build time. */
  illegal: string[];
  /** Routes importing from another route rather than from _lib. */
  routeToRouteImports: string[];
}

/**
 * Named exports of a module, by source text.
 *
 * Deliberately covers the three forms that actually appear — `export const X`,
 * `export function X`, `export async function X` — plus `export { ... }`.
 * Type-only exports are excluded: they are erased before Next sees the module
 * and do not reach the generated validator.
 */
export function scanRouteExports(
  files: Array<{ path: string; text: string }>
): ExportScan {
  let exportsExamined = 0;
  const illegal: string[] = [];
  const routeToRouteImports: string[] = [];

  for (const file of files) {
    const lines = file.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trimStart();

      // A route importing from another route.
      if (line.startsWith("import") && line.includes("/route")) {
        routeToRouteImports.push(`${file.path}:${i + 1}  ${line.trim()}`);
      }

      if (!line.startsWith("export ")) continue;
      // `export type` / `export interface` are erased; they cannot offend.
      if (line.startsWith("export type") || line.startsWith("export interface")) continue;

      const m =
        /^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/.exec(
          line
        );
      if (!m) continue;
      exportsExamined++;
      if (!ALLOWED.has(m[1])) {
        illegal.push(`${file.path}:${i + 1}  export ${m[1]}`);
      }
    }
  }

  return {
    routesExamined: files.length,
    exportsExamined,
    illegal,
    routeToRouteImports,
  };
}

function loadRoutes(): Array<{ path: string; text: string }> {
  return routeFiles(API_ROOT).map((p) => ({
    path: p.slice(API_ROOT.length + 1).replace(/\\/g, "/"),
    text: readFileSync(p, "utf8"),
  }));
}

test("the scan reaches the lane's route modules", () => {
  const scan = scanRouteExports(loadRoutes());
  assert.ok(scan.routesExamined >= 15, `found only ${scan.routesExamined} route files`);
  assert.ok(
    scan.exportsExamined >= 15,
    `matched only ${scan.exportsExamined} exports — the pattern has stopped working`
  );
});

test("no route exports anything App Router will reject", () => {
  const scan = scanRouteExports(loadRoutes());
  assert.deepEqual(
    scan.illegal,
    [],
    `these fail \`next build\` and pass \`tsc --noEmit\`:\n${scan.illegal.join("\n")}`
  );
});

test("no route imports from another route", () => {
  const scan = scanRouteExports(loadRoutes());
  assert.deepEqual(
    scan.routeToRouteImports,
    [],
    `routes are endpoints, not modules — put shared values in _lib:\n${scan.routeToRouteImports.join("\n")}`
  );
});

// ── the scan must be able to fail ────────────────────────────────────

test("it catches the export that actually broke the build", () => {
  const scan = scanRouteExports([
    {
      path: "git/connect/route.ts",
      text: [
        'export const dynamic = "force-dynamic";',
        'export const STATE_COOKIE = "v2_gh_install_state";',
        "export async function GET() {}",
      ].join("\n"),
    },
  ]);
  assert.equal(scan.exportsExamined, 3, "all three exports must be examined");
  assert.equal(scan.illegal.length, 1, "exactly the one illegal export");
  assert.ok(scan.illegal[0].includes("STATE_COOKIE"));
});

test("it permits every handler and config export", () => {
  const scan = scanRouteExports([
    {
      path: "fixture/route.ts",
      text: [
        'export const dynamic = "force-dynamic";',
        "export const revalidate = 0;",
        "export const runtime = 'nodejs';",
        "export async function GET() {}",
        "export async function POST() {}",
        "export async function DELETE() {}",
        "export type Params = { a: string };",
      ].join("\n"),
    },
  ]);
  assert.deepEqual(scan.illegal, [], "legal exports must not be flagged");
  assert.equal(scan.exportsExamined, 6, "the type export is erased, the other six count");
});

test("it catches a route importing from another route", () => {
  const scan = scanRouteExports([
    {
      path: "git/callback/route.ts",
      text: 'import { STATE_COOKIE } from "../connect/route";',
    },
  ]);
  assert.equal(scan.routeToRouteImports.length, 1);
});
