/**
 * The server/client boundary, checked mechanically.
 *
 * Three failures of the same family shipped in one afternoon, and the type
 * checker was happy for all three. Each one compiled, each one 500'd at request
 * time, and each was found only by a person loading the page:
 *
 *   1. A lucide icon (a function) passed from a server component to a client
 *      one — "Functions cannot be passed directly to Client Components".
 *   2. Moving that table into a `"use client"` module and importing its data
 *      back from a server component. Everything exported from a client module
 *      is a client REFERENCE on the server, so an array was not an array and
 *      `.includes` threw.
 *   3. An `onClick` on a `<span>` in a server component — "Event handlers
 *      cannot be passed to Client Component props".
 *
 * tsc cannot see any of these: they are all well-typed. So this checks the one
 * thing tsc will not, the same way boundary.test.ts checks that routes do not
 * reach past RLS.
 *
 * SCOPED TO v2 ON PURPOSE. The v1 surfaces predate this and are mostly client
 * components already; widening the scan would produce a wall of pre-existing
 * findings that nobody reads, which is how a check stops being run.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dirname, "..", "..");
const ROOTS = [join("app", "dashboard", "v2"), join("components", "v2")];

/** Handlers React only accepts on a client component. */
const HANDLER = /\son(Click|Change|Submit|Input|Focus|Blur|KeyDown|KeyUp|MouseEnter|MouseLeave)=\{/;

function walk(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(e.name)) out.push(full);
  }
  return out;
}

function files(): Array<{ rel: string; source: string; isClient: boolean }> {
  const found: Array<{ rel: string; source: string; isClient: boolean }> = [];
  for (const root of ROOTS) {
    for (const full of walk(join(REPO, root))) {
      const source = readFileSync(full, "utf8");
      found.push({
        rel: full.slice(REPO.length + 1).replace(/\\/g, "/"),
        source,
        // The directive must be the first statement to count, which is exactly
        // what React requires — a "use client" further down the file does
        // nothing, and a check that accepted one anywhere would pass a file
        // React still treats as a server component.
        isClient: /^\s*(\/\*[\s\S]*?\*\/\s*)?["']use client["']/.test(source),
      });
    }
  }
  return found;
}

test("the scan is looking at real files, not an empty tree", () => {
  // Without this, a wrong path makes every check below pass by finding nothing
  // to check — a guard that succeeds by not running.
  const all = files();
  assert.ok(all.length >= 8, `expected the v2 surfaces, found ${all.length}`);
  assert.ok(all.some((f) => f.isClient), "expected at least one client component");
  assert.ok(all.some((f) => !f.isClient), "expected at least one server component");
});

test("NO EVENT HANDLER IN A SERVER COMPONENT", () => {
  const offenders = files()
    .filter((f) => !f.isClient && HANDLER.test(f.source))
    .map((f) => f.rel);

  assert.deepEqual(
    offenders,
    [],
    `These render an event handler from a server component, which throws at request time:\n  ${offenders.join(
      "\n  ",
    )}\n\nMove the interactive part into a "use client" component, or express it in CSS — a whole-card link\nneeds a stretched pseudo element, not an onClick that stops propagation.`,
  );
});

test("A SERVER COMPONENT DOES NOT IMPORT DATA FROM A CLIENT MODULE", () => {
  // The quietest of the three. It type-checks, it compiles, and the value is a
  // client reference at runtime rather than the thing it claims to be.
  const all = files();
  const clientModules = new Set(all.filter((f) => f.isClient).map((f) => f.rel));

  const offenders: string[] = [];
  for (const f of all) {
    if (f.isClient) continue;
    for (const m of f.source.matchAll(/import\s+\{([^}]*)\}\s+from\s+["']([^"']+)["']/g)) {
      const names = m[1];
      const spec = m[2];
      // Types are erased before they reach the boundary, so a type-only import
      // is always safe and flagging it would train people to ignore this.
      if (/^\s*type\s/.test(names)) continue;

      const resolved = spec.startsWith("@/")
        ? spec.slice(2)
        : spec.startsWith(".")
          ? join(f.rel, "..", spec).replace(/\\/g, "/")
          : null;
      if (!resolved) continue;

      for (const candidate of [`${resolved}.tsx`, `${resolved}/index.tsx`]) {
        if (clientModules.has(candidate)) {
          // A component import is fine — that is the normal way to render a
          // client component. Only non-component VALUES break, and the
          // convention here is that components are PascalCase.
          const plainValues = names
            .split(",")
            .map((n) => n.trim().split(/\s+as\s+/)[0].trim())
            .filter((n) => n && !/^[A-Z]/.test(n));
          if (plainValues.length) {
            offenders.push(`${f.rel} imports {${plainValues.join(", ")}} from ${candidate}`);
          }
        }
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `A server component is importing plain values from a "use client" module. Those arrive as client\n` +
      `references, not values:\n  ${offenders.join("\n  ")}\n\nPut the shared data in a module with no "use client" and no functions, and import it from both sides.`,
  );
});
