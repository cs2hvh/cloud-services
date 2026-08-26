import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

/**
 * The elevation rule, as a CHECK rather than a comment.
 *
 *   Elevate the OPERATION, never the AUTHORIZATION DECISION,
 *   and never do a tenant-scoped read or write with the service role.
 *
 * Master stated it, I adopted it, app-deploy-3 arrived at it independently from
 * the operator side — and it was written into three file headers with nothing
 * enforcing it. Three comments in three places, zero checks, guarding
 * directories future authors will edit without opening those headers.
 *
 * Master's observation, and they were right. This is my subtree's version,
 * modelled on the vm.ts stage-marker test: a test that fails when a RULE is
 * broken rather than when a function returns the wrong value.
 *
 * lib/paas/db.ts uses the SUPABASE SERVICE ROLE. It bypasses RLS entirely, so
 * anything importing it is asserting there is no requesting user to authorize.
 * That is true of reconcilers, sweeps and provisioning scripts. It is false of
 * a route serving a logged-in customer, and the failure mode is silent: the
 * query works, returns data, and returns the WRONG TEAM'S data.
 */

const REPO = new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

/**
 * Routes that may reach past RLS, each with the reason it is allowed.
 *
 * An allowlist with a stated justification per entry, not a list of paths. An
 * exclusion that does not say why is how an exclusion list becomes a way to
 * pass — the same objection Master raised about silencing their boundary suite.
 */
const SERVICE_ROLE_ALLOWED: Array<{ path: string; why: string }> = [
  {
    path: "app/api/v2/webhooks/github/route.ts",
    why:
      "GitHub is the caller and cannot present a session, so there is no " +
      "authorization decision to elevate past. The HMAC signature IS the " +
      "authentication, and the repository identifies the project. This must " +
      "never grow a filter taken from the request body to read tenant data on " +
      "behalf of a caller.",
  },
];

/**
 * Strip comments before matching.
 *
 * WITHOUT THIS THE TEST PUNISHES DOCUMENTATION. Master's aliases route mentions
 * promoteAndConverge in a comment explaining why it deliberately uses
 * reconcileProjectByRef instead — which is the very decision this file exists to
 * enforce. Flagging that made the cheapest way to go green "delete the comment
 * that documents the rule", which is worse than having no check at all.
 *
 * Third appearance of this trap today: app-deploy-3 hit it in guard.ts, Master
 * hit it in their own suite and fixed it, and then I shipped it here after
 * being told about it twice.
 *
 * The `[^:]` guard keeps `https://` out of the line-comment pattern.
 */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Test files are not violations.
 *
 * A test asserting the forbidden thing is absent must be able to NAME the
 * forbidden thing. Scanning them also means anyone could silence this suite by
 * adding a test file — the opposite of what it is for.
 */
export function isTestFile(path: string): boolean {
  return /\.test\.tsx?$/.test(path);
}

/**
 * The predicates, defined ONCE and used by both the real checks and their proofs.
 *
 * Master shipped a namespace check whose regex had been mangled by a heredoc
 * into something matching nothing — passing vacuously from the moment it was
 * written, in the file whose entire purpose is that checks must be able to
 * fail. It survived because the same pattern was inlined twice and only one
 * copy rotted.
 *
 * Each carries its own violating and innocent example, so the proof cannot
 * drift from the thing it proves.
 */
export const FORBIDDEN = {
  serviceRoleDb: {
    name: "service-role db client",
    // Matches `from "@/lib/paas/db"` and `from "../../lib/paas/db.ts"`, but not
    // lib/paas/db-something and not lib/paas/telemetry/*.
    test: (src: string) => /from\s+["'][^"']*lib\/paas\/db(\.ts)?["']/.test(src),
    violating: 'import { projects } from "@/lib/paas/db";',
    innocent: 'import { operatorView } from "@/lib/paas/telemetry/operator";',
  },
  tenantWriteViaReconciler: {
    name: "promoteAndConverge",
    test: (src: string) => /\bpromoteAndConverge\b/.test(src),
    violating: "await promoteAndConverge(projectId, ref);",
    innocent: "await reconcileProjectByRef(ref);",
  },
} as const;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === "node_modules" || e === ".next" || e === ".git") continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

function appFiles(): string[] {
  return walk(join(REPO, "app"));
}

function rel(f: string): string {
  return relative(REPO, f).split(sep).join("/");
}

/**
 * The whole pipeline — walk, filter, strip, match — as one function, so it can
 * be proved END TO END rather than a piece at a time.
 *
 * Master's second bug is why this exists. Their guard's walker collected only
 * `.ts` while the call site was a `.tsx` page, so the check examined ZERO files
 * and passed. Every predicate was correct in isolation; the WALK and the FILTER
 * were broken together, and testing the string matching said nothing about it.
 *
 * Proving each predicate separately is not proving the pipeline. I proved mine
 * end to end once, by hand, with a probe file I then deleted — so that proof
 * protected exactly nothing after the day it ran.
 */
export function scanTree(
  root: string,
  predicate: (src: string) => boolean,
  opts: { allowed?: Set<string>; base?: string } = {},
): string[] {
  const base = opts.base ?? root;
  const offenders: string[] = [];
  for (const f of walk(root)) {
    const r = relative(base, f).split(sep).join("/");
    if (opts.allowed?.has(r) || isTestFile(r)) continue;
    if (predicate(stripComments(readFileSync(f, "utf8")))) offenders.push(r);
  }
  return offenders;
}

test("no request handler imports the service-role database client", () => {
  const allowed = new Set(SERVICE_ROLE_ALLOWED.map((a) => a.path));
  // base: REPO so offenders come back as `app/...`, matching the allowlist.
  const offenders = scanTree(join(REPO, "app"), FORBIDDEN.serviceRoleDb.test, { allowed, base: REPO });

  assert.deepEqual(
    offenders,
    [],
    `These reach past RLS with the service role:\n  ${offenders.join("\n  ")}\n\n` +
      "A route serving a logged-in customer must use an RLS-scoped client. The " +
      "failure mode is silent: the query succeeds and returns another team's " +
      "data. If a route genuinely has no requesting user, add it to " +
      "SERVICE_ROLE_ALLOWED with the reason.",
  );
});

test("no request handler performs a tenant-scoped write through the reconciler", () => {
  // promoteAndConverge writes paas.aliases with the service role. Master
  // refused it from their route for exactly this reason and chose
  // reconcileProjectByRef instead — elevate the convergence, keep the tenant
  // write under RLS. This is what keeps that a property rather than a habit.
  const offenders = scanTree(join(REPO, "app"), FORBIDDEN.tenantWriteViaReconciler.test, { base: REPO });
  assert.deepEqual(
    offenders,
    [],
    "promoteAndConverge does a tenant-scoped write with the service role. " +
      "A route should write the alias under RLS and then call " +
      "reconcileProjectByRef to converge.",
  );
});

test("every allowlisted exception states why, in more than a few words", () => {
  // An exclusion that does not argue for itself is how an allowlist becomes a
  // way to pass. Requiring prose makes adding one a decision someone signs.
  for (const a of SERVICE_ROLE_ALLOWED) {
    assert.ok(a.why.length > 80, `${a.path} needs a real justification, not a note`);
  }
});

test("the allowlist does not name files that no longer exist", () => {
  // A stale allowlist silently permits a path someone may later recreate for a
  // completely different purpose.
  const present = new Set(appFiles().map(rel));
  for (const a of SERVICE_ROLE_ALLOWED) {
    assert.ok(present.has(a.path), `${a.path} is allowlisted but does not exist — remove it`);
  }
});

test("the scan actually sees the app directory", () => {
  // A boundary test that silently scans nothing passes forever. This is the
  // same failure as an enum-mirror test that passes when the database is
  // unreachable: it reports confidence it never established.
  const files = appFiles();
  assert.ok(files.length > 5, `expected to find route files, found ${files.length}`);
  assert.ok(
    files.some((f) => rel(f).startsWith("app/api/v2/")),
    "expected to find the v2 API routes",
  );
});

test("EVERY PREDICATE CAN ACTUALLY FAIL", () => {
  // The check on the checks. Master shipped one whose regex had been mangled by
  // a heredoc into a pattern matching nothing — passing vacuously from the
  // moment it was written, in the file whose whole purpose is that checks must
  // be able to fail. It survived because the pattern was inlined twice and only
  // one copy rotted.
  //
  // Each predicate is asserted to match a violating line AND to leave an
  // innocent one alone. Matching everything is the same defect as matching
  // nothing: a check that fails on correct code gets deleted, and then there is
  // no check at all.
  for (const [key, rule] of Object.entries(FORBIDDEN)) {
    assert.equal(rule.test(rule.violating), true, `${key} does not catch its own violating example — it may match nothing`);
    assert.equal(rule.test(rule.innocent), false, `${key} flags innocent code — it may match everything`);
  }
});

test("the db predicate does not confuse neighbouring modules for the client itself", () => {
  // lib/paas/telemetry/* is safe to import from a route; lib/paas/db is not.
  // A predicate too loose here would fail every operator route and be removed.
  const t = FORBIDDEN.serviceRoleDb.test;
  assert.equal(t('from "@/lib/paas/db"'), true);
  assert.equal(t('from "../../lib/paas/db.ts"'), true);
  assert.equal(t('from "@/lib/paas/telemetry/operator"'), false);
  assert.equal(t('from "@/lib/paas/k8s/client"'), false);
  assert.equal(t('from "@/lib/paas/replicas"'), false, "the shaped accessor is the SAFE way to read this");
});

test("a comment EXPLAINING the rule is not a violation of it", () => {
  // Master's aliases route mentions promoteAndConverge in a comment saying why
  // it deliberately uses reconcileProjectByRef instead. Flagging that made the
  // cheapest way to go green "delete the comment documenting the rule" — worse
  // than having no check at all. Third time this trap appeared today.
  const documented = `
    // We deliberately do NOT call promoteAndConverge here: it does a
    // tenant-scoped write with the service role. Alias is written under RLS
    // above, then we converge.
    await reconcileProjectByRef(ref);
  `;
  assert.equal(FORBIDDEN.tenantWriteViaReconciler.test(stripComments(documented)), false);

  const blockComment = `/* see also: import { projects } from "@/lib/paas/db" */\nexport async function GET() {}`;
  assert.equal(FORBIDDEN.serviceRoleDb.test(stripComments(blockComment)), false);
});

test("real code is still caught when it sits next to a comment", () => {
  // The other half. Stripping comments must not become a way to hide a call.
  const sneaky = `
    // this is fine, honest
    import { projects } from "@/lib/paas/db";
    await promoteAndConverge(a, b); // documented above
  `;
  const src = stripComments(sneaky);
  assert.equal(FORBIDDEN.serviceRoleDb.test(src), true);
  assert.equal(FORBIDDEN.tenantWriteViaReconciler.test(src), true);
});

test("stripComments does not eat a URL", () => {
  const src = 'const u = "https://github.com/a/b.git";';
  assert.equal(stripComments(src).includes("github.com/a/b.git"), true);
});

test("a test file cannot silence this suite", () => {
  // Scanning *.test.ts would mean anyone could add a test naming the forbidden
  // thing and turn the suite red until it was excluded — or, worse, could
  // silence it by getting it excluded.
  assert.equal(isTestFile("app/api/v2/_lib/boundary.test.ts"), true);
  assert.equal(isTestFile("app/api/v2/projects/[ref]/aliases/route.ts"), false);
});

test("THE WHOLE PIPELINE CATCHES A VIOLATION, walk and filter included", () => {
  // Master's second bug: their walker collected only .ts while the call site
  // was a .tsx page, so the check examined ZERO files and passed. Every
  // predicate was right in isolation; the walk and the filter were broken
  // TOGETHER, and testing the string matching said nothing about it.
  //
  // I proved this pipeline once by hand with a probe file I then deleted, so
  // that proof stopped protecting anything the moment it finished. This one is
  // permanent and runs the same scanTree the real checks use.
  const root = mkdtempSync(join(tmpdir(), "boundary-proof-"));
  try {
    mkdirSync(join(root, "api", "deep"), { recursive: true });

    // .tsx specifically — the extension Master's walker dropped.
    writeFileSync(join(root, "api", "deep", "page.tsx"),
      'import { projects } from "@/lib/paas/db";\nexport default function P() { return null; }\n');
    // nested, to prove recursion
    writeFileSync(join(root, "api", "deep", "route.ts"),
      "export async function POST() { await promoteAndConverge(a, b); }\n");
    // innocent, to prove it does not flag everything
    writeFileSync(join(root, "api", "ok.ts"),
      'import { operatorView } from "@/lib/paas/telemetry/operator";\n');
    // a comment mentioning it, to prove stripping runs inside the pipeline
    writeFileSync(join(root, "api", "documented.ts"),
      "// deliberately NOT promoteAndConverge — see the elevation rule\nexport const x = 1;\n");
    // a test file, to prove it cannot silence the suite
    writeFileSync(join(root, "api", "sneaky.test.ts"),
      'import { projects } from "@/lib/paas/db";\n');

    const dbHits = scanTree(root, FORBIDDEN.serviceRoleDb.test);
    assert.deepEqual(dbHits, ["api/deep/page.tsx"], "must catch a .tsx, recursively, and nothing else");

    const writeHits = scanTree(root, FORBIDDEN.tenantWriteViaReconciler.test);
    assert.deepEqual(writeHits, ["api/deep/route.ts"], "must catch real code and skip the comment");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
