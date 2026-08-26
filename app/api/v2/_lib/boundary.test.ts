/**
 * The tenant boundary, as a test rather than a comment.
 *
 * _lib/auth.ts states the rule: nothing in app/api/v2 may reach for a
 * service-role client, because v1 enabled RLS on every table and then bypassed
 * it on 100% of queries, leaving authorization to hand-written per-route
 * checks — and one omission was a confirmed IDOR. My aliases route states a
 * second rule: elevate the operation, never the authorization decision, never
 * a tenant-scoped write.
 *
 * Both were prose in headers, in files people will keep editing. That is the
 * same shape as the traversal bug app-deploy-3 found in their own lane —
 * safety that depends on the next person remembering.
 *
 * ── HOW THIS PROVES IT CAN FAIL ──────────────────────────────────────
 *
 * A boundary test that cannot detect a violation sits green forever and is
 * read as proof, which makes it worse than no test.
 *
 * I first proved this by injecting real violations into real route files,
 * confirming failure, and reverting. That verifies the whole machinery, but
 * only for whoever ran it that day — and app-deploy-3 reported the same
 * technique being refused by a safety classifier when they tried it, which is
 * reason enough not to build a practice on it. A verification step that
 * sometimes needs an exception quietly stops being performed.
 *
 * So the violations now live in a FIXTURE TREE written to a temp directory and
 * discovered by the same walk(), stripped by the same code(), and judged by
 * the same checker functions as the real run. One implementation of each
 * checker across both paths: two would let the fixture pass while the real
 * check rotted, the same failure as testing a copy of logic owned elsewhere.
 * This runs on every invocation, including for whoever changes the traversal
 * months from now. Adopted from app-deploy-3, whose version of this idea was
 * better than mine.
 *
 * app/api/v2/admin/** is deliberately EXCLUDED — it belongs to the
 * observability lane, is fleet-scoped by construction, and has its own
 * boundary suite. Asserting here about files owned there reports green while
 * the two diverge.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = "app/api/v2";

// ── the machinery, used by both the real run and the fixture ─────────

/** Source with comments removed. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "admin") walk(path, out);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(path);
    }
  }
  return out;
}

/** Reaches past RLS: the service-role client, the PostgREST module, or the key. */
const reachesPastRls = (src: string) =>
  /createServiceClient|paas\/db|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE/.test(src);

/** Writes the alias as the platform rather than as the caller. */
const callsPromoteAndConverge = (src: string) => /promoteAndConverge/.test(src);

/** 403 confirms a row exists and lets someone enumerate another team's refs. */
const answers403 = (src: string) => /\b403\b/.test(src);

/** Ciphertext must never reach a response. */
const selectsCiphertext = (src: string) => /select\([^)]*value_ct/.test(src);

/**
 * Handlers that can return before resolving a caller.
 *
 * Scans only inside an exported handler body. A `return` in a module-level
 * helper is not an early exit from the request — reviewing app-deploy-3's
 * guard.ts, my first version flagged exactly that and was wrong.
 */
function gateViolations(src: string): string[] {
  const bad: string[] = [];
  for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
    const at = src.indexOf(`export async function ${method}(`);
    if (at < 0) continue;
    const body = src.slice(at);
    const gate = body.indexOf("getCaller()");
    const ret = body.indexOf("return ");
    if (gate < 0) bad.push(`${method}: never resolves a caller`);
    else if (ret >= 0 && ret < gate) bad.push(`${method}: returns before the gate`);
  }
  return bad;
}

const REAL = walk(ROOT);
const REAL_ROUTES = REAL.filter((f) => f.endsWith("route.ts"));
const read = (f: string) => code(readFileSync(f, "utf8"));

// ── the real surface ─────────────────────────────────────────────────

test("the file set is non-empty, or every check below is vacuous", () => {
  assert.ok(REAL.length >= 10, `expected the v2 API surface, found ${REAL.length}`);
  assert.ok(REAL_ROUTES.length >= 8, `expected handlers, found ${REAL_ROUTES.length}`);
});

test("no tenant route reaches past RLS", () => {
  assert.deepEqual(REAL.filter((f) => reachesPastRls(read(f))), []);
});

test("no handler writes the alias as the platform", () => {
  // promoteAndConverge performs the alias write with the service role — a
  // tenant-scoped write outside RLS. Scripts and workers may call it; a
  // request handler resolves and writes through RLS and elevates only the
  // cluster convergence.
  assert.deepEqual(REAL.filter((f) => callsPromoteAndConverge(read(f))), []);
});

test("every handler resolves a caller before it can return", () => {
  const bad = REAL_ROUTES.flatMap((f) =>
    gateViolations(read(f)).map((v) => `${f} ${v}`)
  );
  assert.deepEqual(bad, []);
});

test("nothing answers 403 — invisible is indistinguishable from absent", () => {
  assert.deepEqual(REAL.filter((f) => answers403(read(f))), []);
});

test("no read path selects ciphertext", () => {
  assert.deepEqual(REAL.filter((f) => selectsCiphertext(read(f))), []);
});

test("auth.ts still states the rules these tests enforce", () => {
  // Rewriting the header should force a decision about whether these tests
  // still describe the boundary, rather than leaving assertions enforcing a
  // rule nobody has written down any more.
  const header = readFileSync(join(ROOT, "_lib", "auth.ts"), "utf8");
  assert.match(header, /createServiceClient/);
  assert.match(header, /RLS/);
});

// ── the same machinery against a fixture tree ────────────────────────
// Proves the checkers, the traversal, the comment stripping and the exclusion
// rules all still work — every run, not once.

function buildFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "v2-boundary-"));
  const nested = join(root, "projects", "[ref]");
  mkdirSync(nested, { recursive: true });

  // Violates all four properties at once, and is nested so the walk has to
  // find it rather than reading one flat directory.
  writeFileSync(
    join(nested, "route.ts"),
    [
      `import { createServiceClient } from "@/lib/supabase/server";`,
      `import { promoteAndConverge } from "@/lib/paas/reconciler.ts";`,
      `export async function GET() {`,
      `  if (x) return apiError("no", "no", 403);`,
      `  const caller = await getCaller();`,
      `  await db.from("env_vars").select("key, value_ct");`,
      `}`,
    ].join("\n"),
    "utf8"
  );

  // Clean, but NAMES the forbidden things in comments only. This is the case
  // that actually matters: auth.ts's header names createServiceClient in the
  // sentence forbidding it, and a raw-source check fails on its own warning.
  writeFileSync(
    join(root, "clean.ts"),
    [
      `// Nothing here may import createServiceClient or use promoteAndConverge.`,
      `/* Nor answer 403, nor select value_ct. */`,
      `export const fine = true;`,
    ].join("\n"),
    "utf8"
  );

  // A .test.ts inside the tree must be ignored, so nobody can silence the
  // suite by adding one.
  writeFileSync(join(root, "route.test.ts"), `createServiceClient(); // 403`, "utf8");

  // An admin/ directory must be skipped — it is the other lane's.
  mkdirSync(join(root, "admin"), { recursive: true });
  writeFileSync(join(root, "admin", "route.ts"), `createServiceClient();`, "utf8");

  return root;
}

test("the checkers detect a real violation in a discovered file", () => {
  const root = buildFixture();
  const found = walk(root);

  const bad = found.filter((f) => f.endsWith("route.ts") && !f.includes("admin"));
  assert.equal(bad.length, 1, "the walk must find the nested violating route");

  const src = read(bad[0]);
  assert.ok(reachesPastRls(src), "service-role import must be detected");
  assert.ok(callsPromoteAndConverge(src), "platform write must be detected");
  assert.ok(answers403(src), "403 must be detected");
  assert.ok(selectsCiphertext(src), "value_ct select must be detected");
  assert.deepEqual(gateViolations(src), ["GET: returns before the gate"]);
});

test("a file naming the forbidden things only in comments reads clean", () => {
  const src = read(join(buildFixture(), "clean.ts"));
  assert.ok(!reachesPastRls(src), "a warning must not count as a violation");
  assert.ok(!callsPromoteAndConverge(src));
  assert.ok(!answers403(src));
  assert.ok(!selectsCiphertext(src));
});

test("the suite cannot be silenced by adding a .test.ts or an admin dir", () => {
  const found = walk(buildFixture());
  assert.ok(!found.some((f) => f.endsWith(".test.ts")), "tests are not the surface");
  assert.ok(!found.some((f) => f.includes("admin")), "admin belongs to the other lane");
});
