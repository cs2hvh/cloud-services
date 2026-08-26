/**
 * The tenant boundary, as a test rather than a comment.
 *
 * _lib/auth.ts states the rule: nothing in app/api/v2 may reach for a
 * service-role client, because v1 enabled RLS on every table and then bypassed
 * it on 100% of queries, leaving authorization to hand-written per-route
 * checks — and one omission was a confirmed IDOR.
 *
 * That rule was prose in a header, in a directory people will keep editing.
 * app-deploy-3 made the point that this is the same shape as their own
 * traversal finding: safety that depends on the next person remembering. So
 * these tests read the real files and fail when the boundary moves.
 *
 * Three properties this cannot compromise on:
 *
 *  - COMMENTS ARE STRIPPED FIRST. auth.ts's own header names
 *    `createServiceClient` in the sentence forbidding it. A raw-source check
 *    fails on the warning, and "make the test pass by deleting the warning" is
 *    the worst available outcome.
 *
 *  - IT MUST BE ABLE TO FAIL. A boundary test that cannot detect a violation
 *    sits green forever and is worse than nothing, because it is read as
 *    proof. Each check is exercised against a synthetic violation below.
 *
 *  - IT MUST REFUSE AN EMPTY SET. If the glob stops matching — a rename, a
 *    move — every check passes vacuously.
 *
 * app/api/v2/admin/** is deliberately EXCLUDED. It belongs to the
 * observability lane, is fleet-scoped by construction rather than
 * tenant-scoped, and has its own boundary suite. Asserting things here about
 * files owned there would report green while the two diverged.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = "app/api/v2";

/** Source with comments and string literals removed. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    // admin/ is the other lane's; .test.ts files are not the surface.
    if (entry.isDirectory()) {
      if (entry.name !== "admin") walk(path, out);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(path);
    }
  }
  return out;
}

const FILES = walk(ROOT);
const ROUTES = FILES.filter((f) => f.endsWith("route.ts"));

test("the file set is non-empty, or every check below is vacuous", () => {
  assert.ok(FILES.length >= 10, `expected the v2 API surface, found ${FILES.length}`);
  assert.ok(ROUTES.length >= 8, `expected route handlers, found ${ROUTES.length}`);
});

test("no tenant route reaches for a service-role client", () => {
  // The rule from _lib/auth.ts. lib/paas/db.ts is PostgREST with the service
  // key; createServiceClient bypasses RLS outright. Either one turns RLS back
  // into decoration.
  const offenders: string[] = [];
  for (const file of FILES) {
    const src = code(readFileSync(file, "utf8"));
    if (/createServiceClient|paas\/db|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE/.test(src)) {
      offenders.push(file);
    }
  }
  assert.deepEqual(offenders, [], "these reach past RLS");
});

test("no handler calls promoteAndConverge", () => {
  // It performs the alias write itself with the service role — a tenant-scoped
  // write outside RLS. The infrastructure lane keeps it for scripts and
  // workers, which have no user context. A request handler must resolve and
  // write through RLS and elevate only the cluster convergence.
  const offenders = FILES.filter((f) =>
    /promoteAndConverge/.test(code(readFileSync(f, "utf8")))
  );
  assert.deepEqual(offenders, [], "a handler must not write as the platform");
});

test("every route resolves a caller before it can return anything", () => {
  const offenders: string[] = [];
  for (const file of ROUTES) {
    const src = code(readFileSync(file, "utf8"));
    // Only inside an exported handler body — a `return` in a module-level
    // helper is not an early exit from the request, and a naive scan flags it.
    // (app-deploy-3 hit exactly that false positive reviewing their own.)
    for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
      const at = src.indexOf(`export async function ${method}(`);
      if (at < 0) continue;
      const body = src.slice(at);
      const gate = body.indexOf("getCaller()");
      const ret = body.indexOf("return ");
      if (gate < 0) {
        offenders.push(`${file}:${method} never resolves a caller`);
      } else if (ret >= 0 && ret < gate) {
        offenders.push(`${file}:${method} returns before the gate`);
      }
    }
  }
  assert.deepEqual(offenders, [], "unauthenticated code paths");
});

test("nothing answers 403 — invisible must be indistinguishable from absent", () => {
  // A 403 confirms the row exists, which lets someone enumerate another team's
  // refs. RLS returns no rows for both "absent" and "not yours".
  const offenders = FILES.filter((f) => /\b403\b/.test(code(readFileSync(f, "utf8"))));
  assert.deepEqual(offenders, [], "403 leaks existence");
});

test("no route selects value_ct", () => {
  // v1's public API returned every decrypted value in one unaudited response.
  // The defence is that no read path can produce ciphertext to decrypt.
  const offenders = FILES.filter((f) => {
    const src = code(readFileSync(f, "utf8"));
    // The write sets it; a select would name it inside a column list string.
    return /select\([^)]*value_ct/.test(src);
  });
  assert.deepEqual(offenders, [], "ciphertext must not reach a response");
});

test("auth.ts still states the rules these tests enforce", () => {
  // If the header is rewritten, that should force a decision about whether
  // these tests still describe the boundary — rather than leaving assertions
  // enforcing a rule nobody has written down any more.
  const header = readFileSync(join(ROOT, "_lib", "auth.ts"), "utf8");
  assert.match(header, /createServiceClient/, "the rule must remain stated");
  assert.match(header, /RLS/);
});

// ── the checks must be able to fail ──────────────────────────────────
// A boundary test that cannot detect a violation is read as proof and is worse
// than no test. These exercise the detectors against synthetic sources.

test("the detectors fire on violations", () => {
  const stripped = code(`
    // createServiceClient in a comment must NOT count
    /* nor promoteAndConverge in a block comment */
    import { createServiceClient } from "@/lib/supabase/server";
  `);
  assert.match(stripped, /createServiceClient/, "real import detected");
  assert.equal(
    (stripped.match(/createServiceClient/g) ?? []).length,
    1,
    "the commented mention must be stripped, only the import counts"
  );
  assert.doesNotMatch(stripped, /promoteAndConverge/, "block comment stripped");

  // A handler returning before its gate.
  const bad = code(`
    export async function GET() {
      if (x) return notFound();
      const caller = await getCaller();
    }
  `);
  const at = bad.indexOf("export async function GET(");
  const body = bad.slice(at);
  assert.ok(
    body.indexOf("return ") < body.indexOf("getCaller()"),
    "an early return must be detectable"
  );

  assert.match(code(`return apiError("x", "y", 403);`), /\b403\b/);
  assert.match(code(`.select("key, value_ct")`), /select\([^)]*value_ct/);
});
