/**
 * A write must not be allowed to swallow its own failure.
 *
 *   node --test lib/paas/telemetry/write-safety.test.ts
 *
 * THIS EXISTS BECAUSE OF A BUG I SHIPPED TODAY, in a script whose entire
 * purpose is refusing to claim more than it can observe.
 *
 * `scripts/v3/quota-apply.ts` applied resource bounds to three namespaces,
 * printed "enforced: ResourceQuota and LimitRange applied" for each, and
 * created ZERO ResourceQuotas. Both writes passed `allowMissing: true`. That
 * flag means "this may not exist, return null" — correct on a read, and on a
 * write it converts every failure into a silent success. The PUTs 404'd, were
 * swallowed, and three namespaces were reported bounded while none were.
 *
 * The lesson is not "remember not to do that". Every lesson that stuck in this
 * lane became a check: the build script's stage markers, the admin subtree's
 * boundary, the binary-before-decimal suffix order. A rule that lives in
 * someone's memory is a rule that lasts until the next person.
 *
 * So: no write in this lane may pass allowMissing. Reads may, and should —
 * that is what it is for.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = [
  new URL("./", import.meta.url).pathname,
  new URL("../../../scripts/v3/", import.meta.url).pathname,
].map((p) => p.replace(/^\/([A-Za-z]:)/, "$1"));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/** Comments stripped first — the trap this project hit three separate times. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const WRITE_METHODS = /"(POST|PUT|PATCH|DELETE)"/;

/**
 * Object literals passed to a `.raw(` call, extracted by brace matching.
 *
 * A window around each `allowMissing` would be simpler and wrong: these calls
 * sit next to each other, so a window bleeds one call's method into the next
 * one's flag and reports a violation that is not there — or misses one that
 * is.
 */
export function rawCallObjects(src: string): string[] {
  const out: string[] = [];
  const code = stripComments(src);
  const re = /\.raw\s*(?:<[^>]*>)?\s*\(\s*\{/g;

  for (let m = re.exec(code); m !== null; m = re.exec(code)) {
    let depth = 1;
    const start = m.index + m[0].length - 1;
    let i = start + 1;
    for (; i < code.length && depth > 0; i += 1) {
      if (code[i] === "{") depth += 1;
      else if (code[i] === "}") depth -= 1;
    }
    if (depth === 0) out.push(code.slice(start, i));
  }

  return out;
}

/** Calls that both write and swallow. */
export function unsafeWrites(src: string): string[] {
  return rawCallObjects(src).filter((o) => WRITE_METHODS.test(o) && /allowMissing/.test(o));
}

const FILES = ROOTS.flatMap(walk);

test("the audit has files to audit", () => {
  // Without this, a moved directory would make the check below pass silently.
  assert.ok(FILES.length >= 10, `expected lane files, found ${FILES.length}`);
});

test("the detector catches a write that swallows its failure", () => {
  // Proves this can fail. The exact shape of the bug that shipped.
  const bad = `await k.raw({ method: "PUT", path: "/x", body: {}, allowMissing: true });`;
  assert.deepEqual(unsafeWrites(bad).length, 1);

  for (const method of ["POST", "PATCH", "DELETE"]) {
    assert.equal(
      unsafeWrites(`k.raw({ method: "${method}", path: "/x", allowMissing: true })`).length,
      1,
      method,
    );
  }
});

test("a READ with allowMissing is fine — that is what the flag is for", () => {
  assert.deepEqual(unsafeWrites(`k.raw({ method: "GET", path: "/x", allowMissing: true })`), []);
  assert.deepEqual(unsafeWrites(`k.raw({ method: "PUT", path: "/x", body: {} })`), []);
});

test("adjacent calls are not conflated — a read's flag is not read as the write's", () => {
  // A window around `allowMissing` would bleed one call into the next. These
  // two sit next to each other in real code and must be judged separately.
  const src = `
    await k.raw({ method: "PUT", path: "/a", body: {} });
    await k.raw({ method: "GET", path: "/b", allowMissing: true });
  `;
  assert.deepEqual(unsafeWrites(src), []);
});

test("a nested object inside the call does not break the brace matching", () => {
  const src = `k.raw({ method: "PUT", path: "/x", body: { spec: { hard: { pods: "8" } } } })`;
  assert.deepEqual(unsafeWrites(src), []);

  const bad = `k.raw({ method: "PUT", path: "/x", body: { spec: { a: 1 } }, allowMissing: true })`;
  assert.equal(unsafeWrites(bad).length, 1);
});

test("a comment mentioning allowMissing on a write is not a violation", () => {
  // The rule's own documentation names the forbidden thing. Flagging it would
  // make deleting the explanation the cheapest way to pass — the trap this
  // project hit three times in one day.
  const src = `
    // NEVER allowMissing on a write: method: "PUT" with allowMissing swallows failure
    await k.raw({ method: "PUT", path: "/x", body: {} });
  `;
  assert.deepEqual(unsafeWrites(src), []);
});

test("no write in lib/paas/telemetry or scripts/v3 swallows its failure", () => {
  for (const file of FILES) {
    const found = unsafeWrites(readFileSync(file, "utf8"));
    assert.deepEqual(
      found,
      [],
      `${file.split(/[\\/]/).slice(-2).join("/")} passes allowMissing on a write. ` +
        `That converts every failure into a silent success — it is how quota-apply.ts ` +
        `reported three namespaces bounded while creating none. Use POST to create and ` +
        `PUT to update, and read back to confirm.`,
    );
  }
});
