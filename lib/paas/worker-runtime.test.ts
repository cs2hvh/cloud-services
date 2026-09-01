/**
 * The build worker's import graph must stay loadable by plain Node.
 *
 * The worker runs as `node --experimental-strip-types scripts/v2/build-worker.ts`.
 * That runtime resolves NO path aliases and performs NO JSX transform, so a
 * single `@/lib/...` import or one `.tsx` file anywhere in its transitive graph
 * takes it down at startup — before it reads the queue, with the only evidence
 * in a journal nobody is watching.
 *
 * This is not hypothetical. Wiring lifecycle emails into the deploy path meant
 * reaching the email service, which is built entirely from `@/` imports and
 * React templates. Importing it directly would have killed every build on the
 * platform, and the symptom would have been deployments sitting in `queued`
 * forever — exactly what a broken worker looked like the last time, when it
 * took a customer's failed build to notice.
 *
 * So the worker posts to an internal route instead, and this test is what keeps
 * that decision from being quietly undone by someone adding a convenient import.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";

const ENTRY = resolve(process.cwd(), "scripts/v2/build-worker.ts");

/** Every `from "..."` specifier in a source file. */
function importsOf(source: string): string[] {
  const out: string[] = [];
  const re = /\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1] ?? m[2]);
  return out;
}

/**
 * Walk the graph, following relative specifiers only.
 *
 * A bare specifier is a node_modules package, which plain Node resolves fine;
 * an aliased one is the failure this test exists to catch and is recorded
 * rather than followed.
 */
function walk(entry: string): { files: string[]; aliased: Array<{ file: string; spec: string }> } {
  const seen = new Set<string>();
  const aliased: Array<{ file: string; spec: string }> = [];
  const queue = [entry];

  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);

    for (const spec of importsOf(readFileSync(file, "utf8"))) {
      if (spec.startsWith("@/") || spec.startsWith("~/")) {
        aliased.push({ file, spec });
        continue;
      }
      if (!spec.startsWith(".")) continue; // node_modules — fine

      const base = resolve(dirname(file), spec);
      const candidate = existsSync(base)
        ? base
        : [".ts", ".tsx", ".js", "/index.ts"].map((e) => base + e).find((p) => existsSync(p));
      if (candidate) queue.push(candidate);
    }
  }
  return { files: [...seen], aliased };
}

test("the build worker's import graph uses no path aliases", () => {
  const { aliased } = walk(ENTRY);
  assert.deepEqual(
    aliased,
    [],
    "plain Node cannot resolve `@/…`; these imports would kill the worker at startup:\n" +
      aliased.map((a) => `  ${a.file} -> ${a.spec}`).join("\n"),
  );
});

test("the build worker's import graph contains no JSX", () => {
  const { files } = walk(ENTRY);
  const tsx = files.filter((f) => f.endsWith(".tsx"));
  assert.deepEqual(tsx, [], `--experimental-strip-types does not transform JSX:\n${tsx.join("\n")}`);
});

test("the graph was actually walked, so a passing result means something", () => {
  // Anti-vacuity. A resolver that silently found nothing would pass both tests
  // above while checking no files at all.
  const { files } = walk(ENTRY);
  assert.ok(files.length > 15, `expected a real graph, walked only ${files.length} files`);
  assert.ok(
    files.some((f) => f.endsWith(`${join("lib", "paas")}${join("", "deploy.ts")}`) || f.includes("deploy.ts")),
    "deploy.ts should be in the worker's graph",
  );
  assert.ok(
    files.some((f) => f.includes("notify-hook.ts")),
    "notify-hook.ts should be in the worker's graph — it is the thing most at risk",
  );
});
