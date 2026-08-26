/**
 * The admin subtree's security boundary, enforced rather than asserted.
 *
 *   node --test lib/paas/telemetry/admin-boundary.test.ts
 *
 * app/api/v2/admin/_lib/guard.ts makes four factual claims about the files
 * around it. Master verified all four by hand and they held — and then made
 * the point that mattered more: nothing *enforces* them. They are comments, in
 * a file a future author may never open, guarding a directory they will be
 * editing.
 *
 * That is the same shape as the traversal check I fixed earlier today, which
 * ran after the call it protected and was saved only by every call site
 * remembering to encode. Safety that depends on the next person remembering is
 * not safety.
 *
 * So each claim is a test. This reads the real files, the way the build-log
 * suite reads the real vm.ts — that one caught a genuine gap, and this one
 * catches the specific regression guard.ts predicts.
 *
 * WHY THIS LIVES IN lib/paas/telemetry: it is my subtree and my suite, and
 * nothing under app/ can execute in this repo. Reading source is the only
 * check available there, which makes it the only place the boundary can be
 * defended at all.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ADMIN_DIR = new URL("../../../app/api/v2/admin", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/**
 * Comments are stripped before every check.
 *
 * guard.ts's own header names `projectRef` and `teamRef` in the text warning
 * against them. Checking raw source would fail on the warning itself, and
 * "make the test pass by deleting the warning" is the worst possible outcome.
 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const FILES = walk(ADMIN_DIR);
const ROUTES = FILES.filter((f) => f.endsWith("route.ts"));

// ── not vacuous ─────────────────────────────────────────────────────────────

test("the admin subtree exists and has routes to check", () => {
  // Without this, deleting the directory would make every test below pass.
  // Same lesson as fleet-drift's --prove: a green check over an empty set is
  // not a result.
  assert.ok(FILES.length >= 3, `expected admin files, found ${FILES.length}`);
  assert.ok(ROUTES.length >= 5, `expected admin routes, found ${ROUTES.length}`);
});

// ── claim 1: nothing here is tenant-scoped ──────────────────────────────────

/** Tenant scope, in the shapes it would actually appear in. */
const TENANT_IDENTIFIERS = ["projectRef", "teamRef", "team_id", "project_id", "teamSlug"];
const TENANT_TABLES = [
  "teams",
  "team_members",
  "projects",
  "environments",
  "deployments",
  "aliases",
  "domains",
  "env_vars",
];

/** Returns the tenant scope a source file references, or an empty list. */
export function tenantScopeIn(src: string): string[] {
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  return [
    ...TENANT_IDENTIFIERS.filter((t) => stripped.includes(t)),
    ...TENANT_TABLES.filter((t) => stripped.includes(`"${t}"`)),
  ];
}

test("the checker detects tenant scope when it is there", () => {
  // Proves this suite fails for the right reason. A boundary test that cannot
  // detect a violation is the same as no boundary test, and it would sit green
  // forever — the exact failure fleet-drift's --prove exists to rule out.
  assert.deepEqual(tenantScopeIn(`const p = url.searchParams.get("projectRef");`), ["projectRef"]);
  assert.deepEqual(tenantScopeIn(`db.select("projects", "select=ref")`), ["projects"]);
  assert.deepEqual(tenantScopeIn(`// mentions projectRef in a comment only`), []);
  assert.deepEqual(tenantScopeIn(`/* projectRef, team_id */ const x = 1;`), []);
  assert.deepEqual(tenantScopeIn(`const clusters = 1;`), []);
});

test("no admin file is tenant-scoped", () => {
  // The property that makes service-role reads safe here is that there is no
  // tenant scope to bypass. A route growing a projectRef filter destroys it:
  // elevated credentials would answer a per-tenant question, correctness would
  // depend on a hand-written filter, and that is v1's confirmed IDOR rebuilt
  // with better input validation.
  for (const file of FILES) {
    const found = tenantScopeIn(readFileSync(file, "utf8"));
    assert.deepEqual(
      found,
      [],
      `${file.split("admin")[1]} references tenant scope (${found.join(", ")}) — see the ` +
        `boundary note in _lib/guard.ts. Fleet reads belong in ` +
        `lib/paas/telemetry/operator.ts; anything per-tenant belongs on the ` +
        `RLS-scoped client like every other route in app/api/v2.`,
    );
  }
});

// ── claim 2: the service role never enters app/ ─────────────────────────────

test("no admin file imports a service-role client", () => {
  // app/api/v2/_lib/auth.ts forbids this, because v1 used a service-role
  // client for 100% of tenant queries and reduced its own RLS to decoration.
  // The reads live in lib/paas/telemetry/operator.ts instead.
  for (const file of FILES) {
    const src = code(file);
    assert.equal(src.includes("createServiceClient"), false, `${file} imports createServiceClient`);
    assert.equal(
      src.includes("SUPABASE_SERVICE_ROLE_KEY"),
      false,
      `${file} reaches for the service role key directly`,
    );
  }
});

// ── claim 3: the gate is first in every route ───────────────────────────────

/** The body of an exported HTTP handler, or null if the file has none. */
function handlerBody(src: string): string | null {
  const m = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\([\s\S]*?\)\s*\{/.exec(src);
  if (!m) return null;
  return src.slice(m.index + m[0].length);
}

test("every route calls getOperator() before it can return anything", () => {
  // Master's first pass flagged the pod-logs route for a `return` above the
  // gate. That return is inside a `num()` helper, not the handler — the naive
  // check was wrong, and this one looks only inside the handler body so it
  // does not repeat the false positive.
  for (const route of ROUTES) {
    const body = handlerBody(code(route));
    assert.ok(body, `${route} exports no HTTP handler`);

    const gate = body.indexOf("getOperator(");
    const firstReturn = body.indexOf("return");

    assert.notEqual(gate, -1, `${route} never calls getOperator()`);
    assert.ok(
      firstReturn === -1 || gate < firstReturn,
      `${route} can return before authorising. The gate must be the handler's first statement — ` +
        `returning data on a null operator is the only way this subtree leaks.`,
    );
  }
});

test("every route treats a null operator as 404, never 403", () => {
  // 403 confirms the endpoint exists and that admin is a thing worth attacking.
  // Matches the rule in _lib/http.ts for tenant resources, for the same reason.
  for (const route of ROUTES) {
    const src = code(route);
    assert.ok(
      src.includes("adminNotFound()"),
      `${route} does not use adminNotFound() — an operator endpoint answering 403 announces itself`,
    );
    assert.equal(
      /\b403\b/.test(src),
      false,
      `${route} mentions 403; the subtree answers 404 for both "does not exist" and "not yours"`,
    );
  }
});

// ── claim 4: the guard itself ───────────────────────────────────────────────

test("the guard's own claims are still the ones being tested", () => {
  // If someone rewrites guard.ts's header, this fails and whoever changed it
  // has to decide whether the tests above still describe the boundary. A
  // stale comment above enforced behaviour is worse than no comment.
  const guard = readFileSync(join(ADMIN_DIR, "_lib", "guard.ts"), "utf8");

  for (const phrase of [
    "fails closed",
    "404, never 403",
    "operator route grows a `projectRef`",
    "elevate the operation",
  ]) {
    assert.ok(guard.includes(phrase), `guard.ts no longer states: "${phrase}"`);
  }
});
