import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRepoTarget } from "./repo-target.ts";
import type { ProjectRow } from "./db.ts";

const project = (ref: string, provider: string, repo: string) =>
  ({ ref, provider, repo_full_name: repo, id: `id-${ref}` }) as unknown as ProjectRow;

test("one match deploys", () => {
  const t = resolveRepoTarget([project("prj-a", "github", "acme/api")], "acme/api", "github");
  assert.equal(t.kind, "one");
  assert.equal(t.kind === "one" && t.project.ref, "prj-a");
});

test("no match is normal, not an error", () => {
  // We receive pushes for repositories nobody has connected. That is the
  // expected case for an org-wide webhook, not a fault.
  const t = resolveRepoTarget([], "acme/api", "github");
  assert.equal(t.kind, "none");
});

test("TWO TEAMS ON ONE REPO REFUSES RATHER THAN PICKING", () => {
  // This is reachable with a single provider: two teams may each connect the
  // same public repository. Picking either builds one customer's commit onto
  // the other's hostname, and the deploy SUCCEEDS — nobody sees a failure.
  const t = resolveRepoTarget(
    [project("prj-a", "github", "acme/api"), project("prj-b", "github", "acme/api")],
    "acme/api",
    "github",
  );
  assert.equal(t.kind, "ambiguous");
  assert.deepEqual(t.kind === "ambiguous" && t.refs, ["prj-a", "prj-b"]);
});

test("the same name on two providers is two repositories", () => {
  // acme/api on GitLab is not acme/api on GitHub. A provider-blind lookup would
  // let a GitLab push deploy the GitHub project.
  const rows = [project("prj-gh", "github", "acme/api"), project("prj-gl", "gitlab", "acme/api")];
  const t = resolveRepoTarget(rows, "acme/api", "gitlab");
  assert.equal(t.kind, "ambiguous", "an unscoped query must refuse, not silently subset");
  assert.match(t.kind === "ambiguous" ? t.reason : "", /not provider-scoped/);
});

test("a provider-scoped query resolves what the blind one could not", () => {
  // The fix is the query filter; this asserts the filter is sufficient, so the
  // refusal above is a guard against a missing filter rather than the norm.
  const t = resolveRepoTarget([project("prj-gl", "gitlab", "acme/api")], "acme/api", "gitlab");
  assert.equal(t.kind, "one");
  assert.equal(t.kind === "one" && t.project.ref, "prj-gl");
});

test("refusal names the projects, because the operator has to fix the data", () => {
  const t = resolveRepoTarget(
    [project("prj-a", "github", "acme/api"), project("prj-b", "github", "acme/api")],
    "acme/api",
    "github",
  );
  assert.equal(t.kind, "ambiguous");
  if (t.kind !== "ambiguous") return;
  assert.ok(t.refs.length === 2 && t.reason.includes("acme/api"));
});

test("resolution is not a pass-through in either direction", () => {
  // Always refusing breaks every deploy; never refusing is the bug. Both
  // capabilities asserted so neither can regress unnoticed.
  assert.equal(resolveRepoTarget([project("p", "github", "a/b")], "a/b", "github").kind, "one");
  assert.equal(
    resolveRepoTarget([project("p", "github", "a/b"), project("q", "github", "a/b")], "a/b", "github").kind,
    "ambiguous",
  );
});
