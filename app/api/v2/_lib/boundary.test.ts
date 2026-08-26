/**
 * The tenant boundary, as a test rather than a comment.
 *
 * _lib/auth.ts states the rule: nothing in app/api/v2 may reach for a
 * service-role client, because v1 enabled RLS on every table and then bypassed
 * it on 100% of queries, leaving authorization to hand-written per-route
 * checks — and one omission was a confirmed IDOR. The aliases route states a
 * second: elevate the operation, never the authorization decision, never a
 * tenant-scoped write. runtime-logs states a third: derive a namespace from a
 * row, never accept one from the caller.
 *
 * All three were prose in headers, in files people keep editing.
 *
 * ── EVERY PREDICATE IS DEFINED ONCE ──────────────────────────────────
 *
 * The checks below and the proofs at the bottom call the SAME functions. An
 * earlier version of this file inlined the regexes in both places and a
 * patching mistake stripped the backslashes from one copy — leaving
 * /searchParams.get(s*["']namespace["']s*)/, which matches nothing and had
 * been passing vacuously. A check that cannot fail is read as proof and is
 * worse than no check, which is the whole reason this file exists.
 *
 * ── TWO SUBTREES ARE EXCLUDED, NEITHER SILENCED ──────────────────────
 *
 * app/api/v2/admin/** belongs to the observability lane, is fleet-scoped by
 * construction, and has its own boundary suite.
 *
 * app/api/v2/webhooks/** has no user session by nature — GitHub is the caller.
 * The tenant checks would flag correct code, so the guarantee that DOES apply
 * is asserted instead: the signature is verified before anything is written.
 * Excluding a file without replacing its guarantee is how an exclusion list
 * becomes a way to pass.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = "app/api/v2";

// ── predicates: one definition, used by the real checks and the proofs ──

/** Source with comments removed. */
export function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "admin" && entry.name !== "webhooks") walk(path, out);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Like walk(), but without exclusions and including .tsx — for checking a
 * subtree walk() skips, or the dashboard.
 *
 * The .tsx part is not incidental. The first version collected only .ts, so
 * scanning app/dashboard/v2 found nothing and the check below passed while
 * examining zero files. Its own "the scan must find something" assertion is
 * what caught that — which is the entire argument for including one.
 */
function walkAll(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkAll(path, out);
    else if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".test.ts")
    ) {
      out.push(path);
    }
  }
  return out;
}

const reachesPastRls = (src: string) =>
  /createServiceClient|paas\/db|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE/.test(src);

const callsPromoteAndConverge = (src: string) => /promoteAndConverge/.test(src);

const answers403 = (src: string) => /\b403\b/.test(src);

const selectsCiphertext = (src: string) => /select\([^)]*value_ct/.test(src);

/**
 * A namespace taken from the request rather than derived from a row.
 *
 * These values go into a Kubernetes API path. Validation proves a string is a
 * legal namespace; it cannot prove the caller is entitled to it, and
 * "app-prj-someone-else" is perfectly legal.
 */
const NS_FROM_PARAMS = /params[^;]*\bnamespace\b/;
const NS_FROM_QUERY = /searchParams\s*\.\s*get\(\s*['"`]namespace['"`]\s*\)/;
const takesNamespaceFromRequest = (src: string) =>
  NS_FROM_PARAMS.test(src) || NS_FROM_QUERY.test(src);
const pathDeclaresNamespace = (file: string) => file.includes("[namespace]");

/**
 * Handlers that can return before resolving a caller. Scans only inside an
 * exported handler body — a `return` in a module-level helper is not an early
 * exit, and a naive version flags it.
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
  assert.deepEqual(REAL.filter((f) => callsPromoteAndConverge(read(f))), []);
});

test("every handler resolves a caller before it can return", () => {
  const bad = REAL_ROUTES.flatMap((f) => gateViolations(read(f)).map((v) => `${f} ${v}`));
  assert.deepEqual(bad, []);
});

test("nothing answers 403 — invisible is indistinguishable from absent", () => {
  assert.deepEqual(REAL.filter((f) => answers403(read(f))), []);
});

test("no read path selects ciphertext", () => {
  assert.deepEqual(REAL.filter((f) => selectsCiphertext(read(f))), []);
});

test("no tenant route accepts a namespace from the caller", () => {
  const offenders: string[] = [];
  for (const file of REAL_ROUTES) {
    if (pathDeclaresNamespace(file)) offenders.push(`${file}: namespace in the path`);
    else if (takesNamespaceFromRequest(read(file)))
      offenders.push(`${file}: namespace taken from the request`);
  }
  assert.deepEqual(offenders, [], "a namespace must be derived, never accepted");
});

test("every webhook verifies its signature before it writes anything", () => {
  // A webhook's authentication is the HMAC, not a session. The check must come
  // BEFORE the first write — verifying afterwards means an unsigned request
  // has already had an effect.
  let hooks: string[] = [];
  try {
    hooks = walkAll(join(ROOT, "webhooks")).filter((f) => f.endsWith("route.ts"));
  } catch {
    return; // no webhook subtree yet
  }
  assert.ok(hooks.length > 0, "the webhook subtree exists but has no routes");

  for (const file of hooks) {
    const src = code(readFileSync(file, "utf8"));
    const at = src.indexOf("export async function POST(");
    assert.ok(at >= 0, `${file} has no POST handler`);
    const body = src.slice(at);
    const verify = body.indexOf("verifyWebhookSignature");
    assert.ok(verify >= 0, `${file} never verifies a signature`);
    const write = Math.min(
      ...[".insert(", ".update(", ".upsert(", ".delete(", "create("]
        .map((m) => body.indexOf(m))
        .filter((i) => i >= 0)
        .concat([Number.MAX_SAFE_INTEGER])
    );
    assert.ok(verify < write, `${file} writes before verifying its signature`);
  }
});

test("auth.ts still states the rules these tests enforce", () => {
  const header = readFileSync(join(ROOT, "_lib", "auth.ts"), "utf8");
  assert.match(header, /createServiceClient/);
  assert.match(header, /RLS/);
});

/**
 * Every call to replicaStates() must pass scaled_to_zero_at.
 *
 * DeploymentFact.scaled_to_zero_at is OPTIONAL. Omitting it does not fail —
 * it silently degrades: a sleeping production app renders as a superseded old
 * build, and the user is shown "stopped" for their live site. An optional
 * field that changes correctness rather than completeness produces an
 * invisible failure, and this is the only thing that would notice.
 *
 * String matching rather than a regex on purpose: the shapes here are literal
 * identifiers, and the mangled-escape bug that made the namespace check
 * vacuous came from a regex that survived a patch badly.
 */
const callsReplicaStates = (src: string) => src.includes("replicaStates(");
const passesSleepFact = (src: string) => src.includes("scaled_to_zero_at");

test("every replicaStates call passes the sleep fact", () => {
  // Scans the dashboard too — the call lives there, not in a route.
  const surfaces = [...walk(ROOT), ...walkAll("app/dashboard/v2")];
  const callers = surfaces.filter((f) => callsReplicaStates(read(f)));
  assert.ok(callers.length > 0, "nothing calls replicaStates — has it moved?");

  const silent = callers.filter((f) => !passesSleepFact(read(f)));
  assert.deepEqual(
    silent,
    [],
    "omitting scaled_to_zero_at renders a live sleeping app as a dead one"
  );
});

test("the sleep-fact guard fails on a discovered file that omits it", () => {
  // The detector test above proves the predicates. This proves the WALK and
  // the filter work together — the pair that silently examined zero files
  // when walkAll collected only .ts.
  const root = mkdtempSync(join(tmpdir(), "v2-sleepfact-"));
  writeFileSync(
    join(root, "page.tsx"),
    "const s = await replicaStates(ref, rows.map(d => ({ ref: d.ref })));",
    "utf8"
  );
  const found = walkAll(root);
  assert.equal(found.length, 1, "the walk must see a .tsx file");

  const callers = found.filter((f) => callsReplicaStates(read(f)));
  assert.equal(callers.length, 1, "the call must be detected");
  assert.deepEqual(
    callers.filter((f) => !passesSleepFact(read(f))),
    callers,
    "the omission must be flagged"
  );
});

test("the sleep-fact detector distinguishes passing it from not", () => {
  const withFact = code(
    "await replicaStates(ref, rows.map(d => ({ ref: d.ref, scaled_to_zero_at: d.x })));"
  );
  const without = code(
    "await replicaStates(ref, rows.map(d => ({ ref: d.ref, state: d.state })));"
  );
  assert.ok(callsReplicaStates(withFact) && passesSleepFact(withFact));
  assert.ok(callsReplicaStates(without), "the call itself must be detected");
  assert.ok(!passesSleepFact(without), "the omission must be detected");
});

// ── the same predicates against a fixture tree ───────────────────────
// Every check above must be able to fail. These exercise the SAME functions,
// on every run, rather than being a proof someone performed once.

function buildFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "v2-boundary-"));
  const nested = join(root, "projects", "[ref]");
  mkdirSync(nested, { recursive: true });

  writeFileSync(
    join(nested, "route.ts"),
    [
      `import { createServiceClient } from "@/lib/supabase/server";`,
      `import { promoteAndConverge } from "@/lib/paas/reconciler.ts";`,
      `export async function GET(_r: Request, { params }: { params: Promise<{ namespace: string }> }) {`,
      `  if (x) return apiError("no", "no", 403);`,
      `  const caller = await getCaller();`,
      `  await db.from("env_vars").select("key, value_ct");`,
      `}`,
    ].join("\n"),
    "utf8"
  );

  // Names every forbidden thing, in comments only. auth.ts's own header does
  // this, so a raw-source check fails on its own warning — and the cheapest
  // way to make it pass is deleting the warning.
  writeFileSync(
    join(root, "clean.ts"),
    [
      `// Nothing may import createServiceClient or call promoteAndConverge.`,
      `/* Nor answer 403, select value_ct, or take a namespace from params. */`,
      `const namespace = "app-" + row.projects.ref;`,
      `export const fine = true;`,
    ].join("\n"),
    "utf8"
  );

  writeFileSync(join(root, "route.test.ts"), `createServiceClient(); // 403`, "utf8");
  mkdirSync(join(root, "admin"), { recursive: true });
  writeFileSync(join(root, "admin", "route.ts"), `createServiceClient();`, "utf8");
  mkdirSync(join(root, "webhooks"), { recursive: true });
  writeFileSync(join(root, "webhooks", "route.ts"), `createServiceClient();`, "utf8");

  return root;
}

test("every predicate fires on a real violation in a discovered file", () => {
  const root = buildFixture();
  const found = walk(root);
  const bad = found.filter((f) => f.endsWith("route.ts"));
  assert.equal(bad.length, 1, "the walk must find the nested violating route only");

  const file = bad[0];
  const src = read(file);
  assert.ok(reachesPastRls(src), "service-role import");
  assert.ok(callsPromoteAndConverge(src), "platform write");
  assert.ok(answers403(src), "403");
  assert.ok(selectsCiphertext(src), "value_ct select");
  assert.ok(takesNamespaceFromRequest(src), "namespace from params");
  assert.deepEqual(gateViolations(src), ["GET: returns before the gate"]);
});

test("the namespace-from-query form is detected too", () => {
  // The params form and the query form are different regexes; a fixture that
  // only exercises one leaves the other unproven. This is the one that was
  // silently broken before.
  const src = code(`const ns = new URL(r.url).searchParams.get("namespace");`);
  assert.ok(takesNamespaceFromRequest(src), "query form must be detected");
  assert.ok(pathDeclaresNamespace("app/api/v2/pods/[namespace]/logs/route.ts"));
});

test("a file naming the forbidden things only in comments reads clean", () => {
  const src = read(join(buildFixture(), "clean.ts"));
  assert.ok(!reachesPastRls(src));
  assert.ok(!callsPromoteAndConverge(src));
  assert.ok(!answers403(src));
  assert.ok(!selectsCiphertext(src));
  // Deriving a namespace is not accepting one.
  assert.ok(!takesNamespaceFromRequest(src), "derivation must not be flagged");
});

test("the suite cannot be silenced by adding a .test.ts, admin or webhooks dir", () => {
  const found = walk(buildFixture());
  assert.ok(!found.some((f) => f.endsWith(".test.ts")));
  assert.ok(!found.some((f) => f.includes("admin")));
  assert.ok(!found.some((f) => f.includes("webhooks")));
});
