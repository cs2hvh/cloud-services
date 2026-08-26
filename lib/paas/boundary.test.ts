import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
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

test("no request handler imports the service-role database client", () => {
  const allowed = new Set(SERVICE_ROLE_ALLOWED.map((a) => a.path));
  const offenders: string[] = [];

  for (const f of appFiles()) {
    const r = rel(f);
    if (allowed.has(r)) continue;
    const src = readFileSync(f, "utf8");
    // Matches `from "@/lib/paas/db"` and `from "../../lib/paas/db.ts"` alike,
    // but NOT lib/paas/db-something or lib/paas/telemetry/*.
    if (/from\s+["'][^"']*lib\/paas\/db(\.ts)?["']/.test(src)) offenders.push(r);
  }

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
  const offenders: string[] = [];
  for (const f of appFiles()) {
    const src = readFileSync(f, "utf8");
    if (/\bpromoteAndConverge\b/.test(src)) offenders.push(rel(f));
  }
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
