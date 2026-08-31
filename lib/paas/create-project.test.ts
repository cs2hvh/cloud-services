import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCreateProject, slugFromRepo } from "../../app/api/v2/projects/create.ts";

const ok = (over: Record<string, unknown> = {}) =>
  validateCreateProject({ repo: "cs2hvh/my-app", installationId: 156779383, ...over });

test("a valid request produces a plan", () => {
  const r = ok();
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.plan.repoFullName, "cs2hvh/my-app");
  assert.equal(r.plan.slug, "my-app");
  assert.equal(r.plan.productionBranch, "main");
  assert.equal(r.plan.tier, "starter");
  assert.equal(r.plan.instances, 1);
});

test("A MISSING INSTALLATION ID IS REFUSED, never defaulted", () => {
  // This id selects which GitHub credentials get minted. Defaulting it to
  // "whatever installation we can find" would let a project built from one
  // account's repo be deployed with another account's token.
  assert.equal(ok({ installationId: undefined }).ok, false);
  assert.equal(ok({ installationId: 0 }).ok, false);
  assert.equal(ok({ installationId: "not-a-number" }).ok, false);
  assert.equal(ok({ installationId: 1.5 }).ok, false);
});

test("the repo name must be owner/repo and nothing cleverer", () => {
  for (const bad of ["", "no-slash", "a/b/c", "../etc/passwd", "owner/repo;rm -rf /", "owner /repo"]) {
    assert.equal(ok({ repo: bad }).ok, false, `${JSON.stringify(bad)} must be refused`);
  }
});

test("an unknown tier is refused against the TIER TABLE, not a hardcoded list", () => {
  // A tier that reaches the database becomes a pod sized from a row nobody
  // priced. Checking against TIERS means adding a tier to the price list is the
  // only step needed, and inventing one here is impossible.
  assert.equal(ok({ tier: "enormous" }).ok, false);
  assert.equal(ok({ tier: "starter" }).ok, true);
  assert.equal(ok({ tier: "pro" }).ok, true);
});

test("instances are bounded, and a fractional count is not silently floored", () => {
  assert.equal(ok({ instances: 0 }).ok, false);
  assert.equal(ok({ instances: 11 }).ok, false);
  assert.equal(ok({ instances: 2.5 }).ok, false);
  assert.equal(ok({ instances: -1 }).ok, false);
  assert.equal(ok({ instances: 10 }).ok, true);
});

test("a root directory cannot climb out of the repository", () => {
  assert.equal(ok({ rootDirectory: "../../etc" }).ok, false);
  assert.equal(ok({ rootDirectory: "apps/web" }).ok, true);
});

test("leading and trailing slashes on the root directory are normalised away", () => {
  // `/src/` and `src` must mean one directory, not two lookups that both
  // half-work depending on how they are joined later.
  const a = ok({ rootDirectory: "/src/" });
  const b = ok({ rootDirectory: "src" });
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  assert.equal(a.plan.rootDirectory, b.plan.rootDirectory);
  assert.equal(a.plan.rootDirectory, "src");
});

test("A SLUG THAT CANNOT BE A HOSTNAME IS REFUSED AT CREATE TIME", () => {
  // The slug becomes a DNS label. Discovering it is unusable after a build has
  // already run is a much worse place to learn it — the customer has waited
  // minutes for a failure that was knowable at the first keystroke.
  assert.equal(slugFromRepo("owner/___"), "");
  assert.equal(ok({ repo: "owner/___" }).ok, false);
});

test("slugs are lowercased, bounded, and free of runs or edge dashes", () => {
  assert.equal(slugFromRepo("Owner/My_Cool.App"), "my-cool-app");
  assert.equal(slugFromRepo("o/" + "x".repeat(80)).length, 38);
  assert.equal(slugFromRepo("o/--weird--"), "weird");
});

test("validation is not a pass-through in either direction", () => {
  // The paired proof. Accepting everything makes every check above vacuous;
  // refusing everything means no project can ever be created and the tests
  // asserting refusal would still all pass.
  assert.equal(ok().ok, true, "must accept a valid request");
  assert.equal(ok({ repo: "nonsense" }).ok, false, "must reject an invalid one");
});
