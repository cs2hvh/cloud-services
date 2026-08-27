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
 *
 * THERE ARE TWO AUTH IDIOMS IN THIS CODEBASE and this predicate must know
 * both. It originally knew only `getCaller()`, which is this lane's helper.
 * Merging the deploy lane brought eight handlers using the other one:
 *
 *   const supabase = await createClient();
 *   const { data: { user }, error } = await supabase.auth.getUser();
 *   if (error || !user) return unauthenticated();
 *
 * That is a real gate — it resolves the caller from the session cookie and
 * refuses when there is none — so flagging it was a FALSE POSITIVE, and it
 * fired on eight handlers at once when the branches merged.
 *
 * The dangerous way to fix that is to accept any file mentioning `getUser`.
 * Then a handler that calls it, ignores the result and serves data would pass.
 * So both idioms are matched on the SAME two-part shape they share: obtain a
 * caller, and have the refusal appear before any other return. `getCaller()`
 * is paired with its null check by convention; `auth.getUser()` is paired here
 * with an explicit `!user` refusal, and a handler with the call but no refusal
 * is still reported.
 *
 * Worth saying out loud rather than only encoding: two idioms for the same
 * security decision is itself a drift risk. One of them should win. Until
 * that is decided this predicate is the thing keeping both honest.
 */
/**
 * Does this stretch of source obtain a caller AND refuse when there is none?
 *
 * Shared by the handler check and the helper check below, so a helper is held
 * to exactly the standard a handler is. Defining it once is the point: two
 * copies of "what counts as a gate" is how one of them quietly gets weaker.
 */
function gatesInline(body: string): "caller" | "supabase" | "unrefused" | null {
  if (body.includes("getCaller()")) return "caller";
  if (!body.includes("auth.getUser()")) return null;
  const refuses = ["!user", "!data.user", "!session"].some((n) => body.includes(n));
  return refuses ? "supabase" : "unrefused";
}

/**
 * Functions anywhere in the v2 surface whose own body gates.
 *
 * THE THIRD IDIOM is delegation. Four handlers do no auth themselves:
 *
 *   export async function POST(req) { return createProject(req); }
 *   const r = await requireProject(ref); if ("error" in r) return r.error;
 *
 * Both are properly authenticated — createProject gates at
 * create-route.ts:15, requireProject at env/route.ts:46 — but the gate is one
 * call away and in a DIFFERENT FILE in the first case.
 *
 * This is collected rather than allowlisted, and the difference matters. An
 * allowlist of trusted helper names would be a suppression list: add a name
 * and the check stops looking. Here a name earns its place only by containing
 * a gate, checked by the same predicate that checks handlers. A helper that
 * stops gating drops out of this set on the next run and every handler
 * delegating to it starts failing.
 */
function collectGateHelpers(files: string[], readFile: (f: string) => string): Set<string> {
  const names = new Set<string>();
  for (const file of files) {
    const src = readFile(file);
    const re = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const name = m[1];
      // Handlers are checked directly; they are not delegation targets.
      if (["GET", "POST", "PATCH", "PUT", "DELETE"].includes(name)) continue;
      // Body = from here to the next top-level function, good enough to tell
      // whether the gate sits inside this one.
      const rest = src.slice(m.index + m[0].length);
      const next = rest.search(/\n(?:export\s+)?(?:async\s+)?function\s/);
      const body = next < 0 ? rest : rest.slice(0, next);
      if (gatesInline(body) === "caller" || gatesInline(body) === "supabase") {
        names.add(name);
      }
    }
  }
  return names;
}

function gateViolations(src: string, gateHelpers: Set<string> = new Set()): string[] {
  const bad: string[] = [];
  for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
    const at = src.indexOf(`export async function ${method}(`);
    if (at < 0) continue;
    const body = src.slice(at);

    const inline = gatesInline(body);
    if (inline === "unrefused") {
      bad.push(`${method}: calls auth.getUser() but never refuses a missing user`);
      continue;
    }

    let gate = -1;
    let gateName: string | null = null;
    if (inline === "caller") gate = body.indexOf("getCaller()");
    else if (inline === "supabase") gate = body.indexOf("auth.getUser()");
    else {
      // Idiom three: delegation to a helper that has itself been VERIFIED to
      // gate. Earliest such call wins, so the position check still applies.
      for (const name of gateHelpers) {
        const at2 = body.indexOf(`${name}(`);
        if (at2 >= 0 && (gate < 0 || at2 < gate)) {
          gate = at2;
          gateName = name;
        }
      }
    }

    // The FIRST return that is not the delegation itself.
    //
    // `export async function POST(req) { return createProject(req); }` has its
    // return at position 0 and the gate just after it, which reads as
    // "returns before the gate" and is exactly backwards — that return IS the
    // gate. So a return whose own statement contains the gate call does not
    // count as an early exit, while any other return still does.
    let ret = -1;
    for (let i = body.indexOf("return "); i >= 0; i = body.indexOf("return ", i + 1)) {
      const end = body.indexOf(";", i);
      const statement = body.slice(i, end < 0 ? Math.min(i + 160, body.length) : end);
      if (gateName && statement.includes(`${gateName}(`)) continue;
      ret = i;
      break;
    }

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

/**
 * Helpers that gate, collected from the whole surface — including create-route.ts,
 * which is not a route module and so is not in REAL_ROUTES, but is where
 * POST /projects actually authenticates.
 */
const GATE_HELPERS = collectGateHelpers(REAL, read);

test("the gate-helper set is real, not empty", () => {
  // If this set silently empties, every delegating handler starts failing —
  // loudly, which is the safe direction. But an empty set would also mean the
  // collector had stopped working, and that is worth naming separately from
  // the handlers it would take down with it.
  assert.ok(
    GATE_HELPERS.size >= 2,
    `collected only ${GATE_HELPERS.size} gate helpers — the collector has stopped working`
  );
  assert.ok(GATE_HELPERS.has("requireProject"), "requireProject gates and must be found");
  assert.ok(GATE_HELPERS.has("createProject"), "createProject gates and must be found");
});

test("every handler resolves a caller before it can return", () => {
  const bad = REAL_ROUTES.flatMap((f) =>
    gateViolations(read(f), GATE_HELPERS).map((v) => `${f} ${v}`)
  );
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

/**
 * allowMissing on a WRITE turns every failure into a silent success.
 *
 * app-deploy-3 hit this: a quota script reported three namespaces enforced
 * while creating zero ResourceQuotas, because allowMissing swallowed the
 * error. On a GET it is correct — a 404 reading a build log genuinely means
 * there is no log. On a POST, PUT, PATCH or DELETE it means the write did not
 * happen and nobody was told.
 *
 * Checks the k8s raw() call shape: the option and the method appear in the
 * same object literal.
 */
/**
 * NO REGEX HERE, DELIBERATELY. The first version of this predicate used one
 * and a patching step stripped every backslash, leaving
 *
 *   /raws*<[^>]*>?s*(s*{([sS]*?)}s*)/g
 *
 * which matches nothing. The real check then PASSED while examining zero
 * call sites — the third time today a regex survived a patch badly and left a
 * vacuous guard. Only the detector proof below caught it.
 *
 * String scanning has survived every edit, so that is what this uses.
 */
/**
 * Returns BOTH what it found and how many sites it examined.
 *
 * cloud-app-v2-d8 s point, and it is the fix for how this check failed twice:
 * a guard that can only pass or fail has one silent failure mode — examining
 * nothing and reporting clean. A guard with a third state, could-not-observe,
 * has none. Both times my predicate matched zero sites and PASSED; an
 * examined count would have shown zero on the first run, with no paired proof
 * needed.
 */
function allowMissingSites(src: string): { examined: number; onWrite: string[] } {
  let examined = 0;
  const bad: string[] = [];
  let at = src.indexOf("allowMissing");
  while (at >= 0) {
    // trimStart() rather than a regex: this line was /^allowMissings*:s*true/
    // after a patch ate its backslashes, which matched nothing and made the
    // whole check vacuous.
    const after = src.slice(at + "allowMissing".length).trimStart();
    const flagged =
      after.startsWith(":") && after.slice(1).trimStart().startsWith("true");
    if (flagged) {
      examined += 1;
      // The method appears in the same object literal. Look back to the
      // nearest opening brace and forward to the closing one.
      const open = src.lastIndexOf("{", at);
      const close = src.indexOf("}", at);
      const body = src.slice(open < 0 ? 0 : open, close < 0 ? src.length : close);
      const mAt = body.indexOf("method");
      if (mAt >= 0) {
        const after = body.slice(mAt);
        const q = after.search(/["'`]/);
        if (q >= 0) {
          const rest = after.slice(q + 1);
          const endQ = rest.search(/["'`]/);
          const method = endQ > 0 ? rest.slice(0, endQ) : "";
          if (method && method.toUpperCase() !== "GET") bad.push(method);
        }
      }
    }
    at = src.indexOf("allowMissing", at + 1);
  }
  return { examined, onWrite: bad };
}

test("allowMissing never appears on a write", () => {
  let examined = 0;
  const offenders: string[] = [];
  for (const file of REAL) {
    const r = allowMissingSites(read(file));
    examined += r.examined;
    for (const method of r.onWrite)
      offenders.push(`${file}: allowMissing on ${method}`);
  }

  // THE THIRD STATE. Zero sites examined does not mean clean, it means the
  // scanner is broken — which is exactly how this check passed twice while
  // reading nothing. The lane genuinely uses allowMissing on GET in
  // runtime-logs, so zero here is always a bug in this file.
  assert.ok(
    examined > 0,
    "examined zero allowMissing sites: the scanner is broken, not the code"
  );

  assert.deepEqual(offenders, [], "a swallowed write failure reports success");
});

test("the allowMissing detector tells a read from a write", () => {
  const write = code(
    'await k.raw<string>({ method: "PUT", path: p, allowMissing: true });'
  );
  assert.deepEqual(allowMissingSites(write).onWrite, ["PUT"], "a write must be caught");

  const readOk = code(
    'await k.raw<string>({ method: "GET", path: p, allowMissing: true });'
  );
  const ok = allowMissingSites(readOk);
  assert.deepEqual(ok.onWrite, [], "a GET is legitimate");
  assert.equal(ok.examined, 1, "a legitimate GET is still an examined site");

  const noFlag = code('await k.raw<string>({ method: "DELETE", path: p });');
  const none = allowMissingSites(noFlag);
  assert.deepEqual(none.onWrite, [], "no flag, no finding");
  assert.equal(none.examined, 0, "and nothing to examine");
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

// ── the gate predicate knows both idioms, and is not fooled by either ──
// Widening a security predicate is where one gets quietly disabled, so each
// of these is a shape that MUST still be caught after the widening.

test("the gate accepts the Supabase idiom done properly", () => {
  const src = code(`export async function GET(r: Request) {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return unauthenticated();
    return json({ ok: true });
  }`);
  assert.deepEqual(gateViolations(src), [], "a real Supabase gate is not a violation");
});

test("the gate still catches a handler with NO auth at all", () => {
  const src = code(`export async function GET() { return json({ secrets: 1 }); }`);
  assert.deepEqual(gateViolations(src), ["GET: never resolves a caller"]);
});

test("calling auth.getUser() without refusing is NOT a gate", () => {
  // The dangerous widening: accepting any file that mentions getUser. This
  // handler resolves a user, ignores the answer, and serves data anyway.
  const src = code(`export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    console.log(user);
    return json({ secrets: 1 });
  }`);
  assert.deepEqual(gateViolations(src), [
    "GET: calls auth.getUser() but never refuses a missing user",
  ]);
});

test("the gate still catches a return placed before it", () => {
  const src = code(`export async function POST(r: Request) {
    if (r.headers.get("x-skip")) return json({ ok: true });
    const { data: { user }, error } = await (await createClient()).auth.getUser();
    if (error || !user) return unauthenticated();
    return json({ ok: true });
  }`);
  assert.deepEqual(gateViolations(src), ["POST: returns before the gate"]);
});

test("a helper is only trusted if it actually gates", () => {
  // The delegation idiom is the widening most likely to become a suppression
  // list. It cannot: a name earns trust by containing a gate, checked by the
  // same predicate. Here the helper does NOT gate, so the handler delegating
  // to it is still reported.
  const helpers = collectGateHelpers(["fake.ts"], () =>
    code(`async function loadProject(ref: string) { return db.get(ref); }`)
  );
  assert.equal(helpers.size, 0, "a helper with no gate must not be collected");

  const handler = code(`export async function GET() {
    const p = await loadProject("x");
    return json(p);
  }`);
  assert.deepEqual(gateViolations(handler, helpers), ["GET: never resolves a caller"]);
});

test("a one-line delegating handler is not read as returning early", () => {
  // `return createProject(req)` puts the return BEFORE the gate call textually
  // while being the gate call. Reported as "returns before the gate" until the
  // position check learned to skip the delegating statement.
  const helpers = collectGateHelpers(["fake.ts"], () =>
    code(`async function createThing(req: Request) {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) return unauthenticated();
      return json({ ok: true });
    }`)
  );
  const handler = code(`export async function POST(req: Request) {
    return createThing(req);
  }`);
  assert.deepEqual(gateViolations(handler, helpers), []);
});

test("a genuine early return before a delegated gate is still caught", () => {
  // The other half of that fix: skipping the delegating return must not skip
  // a real one that precedes it.
  const helpers = collectGateHelpers(["fake.ts"], () =>
    code(`async function createThing(req: Request) {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) return unauthenticated();
      return json({ ok: true });
    }`)
  );
  const handler = code(`export async function POST(req: Request) {
    if (req.headers.get("x-skip")) return json({ ok: true });
    return createThing(req);
  }`);
  assert.deepEqual(gateViolations(handler, helpers), ["POST: returns before the gate"]);
});

test("a helper that does gate is collected and trusted", () => {
  const helpers = collectGateHelpers(["fake.ts"], () =>
    code(`async function requireThing(ref: string) {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) return { error: unauthenticated() };
      return { ok: true };
    }`)
  );
  assert.ok(helpers.has("requireThing"), "a gating helper must be collected");

  const handler = code(`export async function GET() {
    const r = await requireThing("x");
    if ("error" in r) return r.error;
    return json(r);
  }`);
  assert.deepEqual(gateViolations(handler, helpers), []);
});

test("the getCaller idiom is still enforced unchanged", () => {
  const good = code(`export async function GET() {
    const caller = await getCaller();
    if (!caller) return unauthenticated();
    return json({ ok: true });
  }`);
  assert.deepEqual(gateViolations(good), []);
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
