import { test } from "node:test";
import assert from "node:assert/strict";
import { aliasesToPoint } from "./deploy.ts";
import type { AliasRow } from "./db.ts";

const alias = (ref: string, kind: string, hostname: string) =>
  ({ ref, kind, hostname, project_id: "p", deployment_id: null } as unknown as AliasRow);

const PROD = alias("als-prod", "production", "v2-myapp.ahurasense.com");
const CUSTOM = alias("als-custom", "custom", "www.customer.com");
const PREVIEW_A = alias("als-pa", "branch", "myapp-feature-a-aaa111.ahurasense.com");
const PREVIEW_B = alias("als-pb", "branch", "myapp-feature-b-bbb222.ahurasense.com");
const ALL = [PROD, CUSTOM, PREVIEW_A, PREVIEW_B];

test("A PREVIEW NEVER MOVES THE PRODUCTION HOSTNAME", () => {
  // The one that matters. Before this rule existed, every alias of the project
  // was repointed at whatever built last — so pushing a feature branch replaced
  // production with that branch, silently, and the first symptom would have
  // been a customer seeing someone's work-in-progress on their live site.
  const moved = aliasesToPoint(ALL, true, PREVIEW_A.hostname);
  assert.deepEqual(moved.map((a) => a.ref), ["als-pa"]);
  assert.ok(!moved.includes(PROD), "production must not move");
  assert.ok(!moved.includes(CUSTOM), "a custom domain must not move either");
});

test("one preview does not move another preview", () => {
  // Matched on the exact hostname, not merely on kind. Two branches of one
  // project are both `branch` aliases, and a kind-only filter would have each
  // build stealing the other's hostname.
  assert.deepEqual(aliasesToPoint(ALL, true, PREVIEW_B.hostname).map((a) => a.ref), ["als-pb"]);
});

test("a production build moves production AND custom domains", () => {
  // The original behaviour, preserved. A project can hold several hostnames that
  // all serve the same build; leaving one pointing at an older deployment serves
  // two different builds depending on the URL.
  const moved = aliasesToPoint(ALL, false, PROD.hostname);
  assert.deepEqual(moved.map((a) => a.ref).sort(), ["als-custom", "als-prod"]);
});

test("a production build leaves every branch alias alone", () => {
  // The other direction of the same separation. Production deploying must not
  // drag every open preview onto the production build — that would make every
  // preview URL show main, which is a quieter failure than the reverse and just
  // as wrong.
  const moved = aliasesToPoint(ALL, false, PROD.hostname);
  assert.ok(!moved.some((a) => a.kind === "branch"));
});

test("the filter is not a pass-through in either direction", () => {
  // The paired proof. Returning everything reintroduces the outage; returning
  // nothing means no deploy ever changes what a hostname serves, so every app
  // is frozen at its first build — green tests, dead platform.
  assert.equal(aliasesToPoint(ALL, false, PROD.hostname).length, 2, "must move something");
  assert.equal(aliasesToPoint(ALL, true, "nothing-matches.ahurasense.com").length, 0, "must be capable of moving nothing");
});

test("a first preview has nothing to move, which is how the mint is triggered", () => {
  // An empty result here is the signal to CREATE the branch alias, so this case
  // must be distinguishable rather than an error.
  assert.deepEqual(aliasesToPoint([PROD, CUSTOM], true, "myapp-new-branch-ccc333.ahurasense.com"), []);
});
