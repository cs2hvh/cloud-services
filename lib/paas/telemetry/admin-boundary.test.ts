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
 * So each claim is a test that reads the real files, the way the build-log
 * suite reads the real vm.ts.
 *
 * AND IT PROVES IT CAN FAIL, WHICH IS THE OTHER HALF. A green boundary test
 * gets read as proof, so one that cannot detect a violation is worse than
 * none. The checkers below run against a FIXTURE DIRECTORY written to disk
 * containing deliberate violations, using the same walk, the same exclusions
 * and the same functions as the real run. That exercises the traversal and the
 * comment-stripping, not just the regexes — and unlike injecting violations
 * into the real routes and reverting, it stays true every time this runs
 * rather than being a proof someone did once.
 *
 * WHY THIS LIVES IN lib/paas/telemetry: it is my subtree and my suite, and
 * nothing under app/ can execute in this repo. Reading source is the only
 * check available there, which makes it the only place the boundary can be
 * defended at all.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
 * guard.ts's own header names `projectRef` and `createServiceClient` in the
 * text warning against them. Checking raw source would fail on the warning
 * itself, and "make the test pass by deleting the warning" is the worst
 * outcome available. Master hit the same thing in auth.ts.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// ── the checkers ────────────────────────────────────────────────────────────
//
// One implementation, used against the real directory and against fixtures.
// Two implementations would let the fixture pass while the real check rots.

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

/** Tenant scope a file references. Empty means fleet-scoped, which is the rule. */
export function tenantScopeIn(src: string): string[] {
  const s = stripComments(src);
  return [
    ...TENANT_IDENTIFIERS.filter((t) => s.includes(t)),
    ...TENANT_TABLES.filter((t) => s.includes(`"${t}"`)),
  ];
}

/** Ways a file could reach elevated credentials directly. */
export function serviceRoleIn(src: string): string[] {
  const s = stripComments(src);
  return ["createServiceClient", "SUPABASE_SERVICE_ROLE_KEY"].filter((t) => s.includes(t));
}

/** The body of an exported HTTP handler, or null when the file has none. */
function handlerBody(src: string): string | null {
  const m = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\([\s\S]*?\)\s*\{/.exec(src);
  return m ? src.slice(m.index + m[0].length) : null;
}

/**
 * Why a route could answer before authorising, or null when it cannot.
 *
 * Scans only inside the handler body. Master's first pass flagged the pod-logs
 * route for a `return` above the gate, which turned out to be inside a `num()`
 * helper — the naive version was wrong, and they said so before I wrote the
 * same bug.
 */
export function gateViolation(src: string): string | null {
  const body = handlerBody(stripComments(src));
  if (body === null) return "exports no HTTP handler";

  const gate = body.indexOf("getOperator(");
  const firstReturn = body.indexOf("return");

  if (gate === -1) return "never calls getOperator()";
  if (firstReturn !== -1 && firstReturn < gate) return "can return before authorising";
  return null;
}

/** 403 confirms the endpoint exists and that admin is worth attacking. */
export function announces403(src: string): boolean {
  return /\b403\b/.test(stripComments(src));
}

const FILES = walk(ADMIN_DIR);
const ROUTES = FILES.filter((f) => f.endsWith("route.ts"));

// ── proof the checkers can fail, on real files on disk ──────────────────────

test("every checker detects its violation in a real file it has to walk to find", () => {
  // Fixtures are written to disk and discovered by the same walk() the real
  // run uses, so this exercises traversal, the .test.ts exclusion and the
  // comment stripping — not only the string matching.
  const dir = mkdtempSync(join(tmpdir(), "admin-boundary-"));
  try {
    mkdirSync(join(dir, "leaky"), { recursive: true });
    mkdirSync(join(dir, "_lib"), { recursive: true });

    writeFileSync(
      join(dir, "leaky", "route.ts"),
      `import { createServiceClient } from "@/lib/supabase/service";\n` +
        `export async function GET() {\n` +
        `  if (process.env.SHORTCUT) return json({});\n` +
        `  const operator = await getOperator();\n` +
        `  const projectRef = "prj_1";\n` +
        `  return json({ status: 403 });\n` +
        `}\n`,
    );
    writeFileSync(
      join(dir, "_lib", "clean.ts"),
      `/* mentions createServiceClient and projectRef only in a comment */\n` +
        `// and project_id here too\n` +
        `export const fine = 1;\n`,
    );
    // Must be ignored by walk(), or the suite could be silenced by adding one.
    writeFileSync(join(dir, "leaky", "route.test.ts"), `const projectRef = "ignored";`);

    const found = walk(dir);
    assert.equal(found.length, 2, `walk should find 2 non-test files, found ${found.length}`);

    const leaky = readFileSync(join(dir, "leaky", "route.ts"), "utf8");
    assert.deepEqual(serviceRoleIn(leaky), ["createServiceClient"]);
    assert.deepEqual(tenantScopeIn(leaky), ["projectRef"]);
    assert.equal(gateViolation(leaky), "can return before authorising");
    assert.equal(announces403(leaky), true);

    const clean = readFileSync(join(dir, "_lib", "clean.ts"), "utf8");
    assert.deepEqual(serviceRoleIn(clean), [], "a comment naming it is not a violation");
    assert.deepEqual(tenantScopeIn(clean), [], "nor is a comment naming tenant scope");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a handler with no gate at all is caught, not just one with an early return", () => {
  assert.equal(
    gateViolation(`export async function GET() {\n  return json({});\n}`),
    "never calls getOperator()",
  );
  assert.equal(
    gateViolation(`export async function GET() {\n  const o = await getOperator();\n  return json({});\n}`),
    null,
  );
});

test("the suite refuses to run against an empty directory", () => {
  // Without this, deleting the admin subtree would make every test below pass.
  // Same lesson as fleet-drift's --prove: green over an empty set is not a
  // result.
  assert.ok(FILES.length >= 3, `expected admin files, found ${FILES.length}`);
  assert.ok(ROUTES.length >= 5, `expected admin routes, found ${ROUTES.length}`);
});

// ── the real files ──────────────────────────────────────────────────────────

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

test("no admin file reaches elevated credentials directly", () => {
  // app/api/v2/_lib/auth.ts forbids this, because v1 used a service-role
  // client for 100% of tenant queries and reduced its own RLS to decoration.
  // The reads live in lib/paas/telemetry/operator.ts instead.
  for (const file of FILES) {
    const found = serviceRoleIn(readFileSync(file, "utf8"));
    assert.deepEqual(found, [], `${file.split("admin")[1]} reaches for ${found.join(", ")}`);
  }
});

test("every route authorises before it can return anything", () => {
  for (const route of ROUTES) {
    assert.equal(
      gateViolation(readFileSync(route, "utf8")),
      null,
      `${route.split("admin")[1]} — the gate must be the handler's first statement; ` +
        `returning data on a null operator is the only way this subtree leaks`,
    );
  }
});

test("every route answers 404, never 403", () => {
  for (const route of ROUTES) {
    const src = readFileSync(route, "utf8");
    assert.ok(
      stripComments(src).includes("adminNotFound()"),
      `${route.split("admin")[1]} does not use adminNotFound()`,
    );
    assert.equal(
      announces403(src),
      false,
      `${route.split("admin")[1]} mentions 403 — an operator endpoint answering 403 announces itself`,
    );
  }
});

test("the guard's own claims are still the ones being tested", () => {
  // If someone rewrites guard.ts's header, this fails and whoever changed it
  // has to decide whether the tests still describe the boundary. A stale
  // comment above enforced behaviour is worse than no comment.
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
