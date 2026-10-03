/**
 * Two paths files must never register the same OpenAPI schema name.
 *
 * WHY THIS EXISTS. zod-to-openapi keys the component registry by the string in
 * `.openapi("Name")`. Registering that name twice does not error and does not
 * overwrite — it quietly emits `allOf: [ {$ref: the first one}, {the second
 * one inline} ]` at every call site of BOTH. The first App Platform draft
 * reused `App`, `Deployment`, `UpdateAppRequest` and `AddDomainRequest`, which
 * v1 already owned, and the visible damage was to v1: PATCH /api/v1/apps/{id}
 * and POST /api/v1/domains started documenting a request body that was two
 * unrelated shapes merged together. Nothing failed; the published reference
 * was simply wrong about endpoints nobody had touched.
 *
 * A name check rather than a spec diff, because the name is where the mistake
 * is made and it is what a reviewer can see in the file they are editing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIRS = ["lib/openapi/paths", "lib/openapi/schemas"];

/** Every `.openapi("Name")` in a file — the registered component names. */
function registeredNames(source: string): string[] {
  return [...source.matchAll(/\.openapi\(\s*["']([A-Za-z][A-Za-z0-9_]*)["']\s*\)/g)].map((m) => m[1]);
}

function sources(): Array<{ file: string; text: string }> {
  const out: Array<{ file: string; text: string }> = [];
  for (const dir of DIRS) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
      out.push({ file: join(dir, name), text: readFileSync(join(dir, name), "utf8") });
    }
  }
  return out;
}

test("the scan finds the OpenAPI sources, or the check below is vacuous", () => {
  const files = sources();
  assert.ok(files.length >= 8, `expected the OpenAPI path and schema modules, found ${files.length}`);
  const total = files.flatMap((f) => registeredNames(f.text));
  assert.ok(total.length >= 50, `expected many registered schemas, found ${total.length}`);
});

test("no schema name is registered by two different files", () => {
  const owners = new Map<string, Set<string>>();
  for (const { file, text } of sources()) {
    for (const name of registeredNames(text)) {
      if (!owners.has(name)) owners.set(name, new Set());
      owners.get(name)!.add(file);
    }
  }

  const shared = [...owners.entries()]
    .filter(([, files]) => files.size > 1)
    .map(([name, files]) => `${name} is registered by ${[...files].join(" and ")}`);

  assert.deepEqual(
    shared,
    [],
    "a name registered twice is silently merged with allOf, which corrupts BOTH endpoints that use it"
  );
});

test("the duplicate detector actually fires", () => {
  // The check above passing is only meaningful if it can fail. A regex that
  // matched nothing would pass just as happily.
  const a = `const X = z.object({}).openapi('Shared');`;
  const b = `const Y = z.object({}).openapi('Shared');`;
  const names = [...registeredNames(a), ...registeredNames(b)];
  assert.deepEqual(names, ["Shared", "Shared"], "the name extractor has stopped working");
});
