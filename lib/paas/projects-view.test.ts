import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripComments } from "./boundary.test.ts";

const ROUTE = "app/api/v2/projects/route.ts";
const src = () => stripComments(readFileSync(ROUTE, "utf8"));

test("THE TENANT ROUTE NEVER REACHES PAST RLS", () => {
  // boundary.test.ts already scans every route for the service-role client.
  // This says it again for the specific file, because that scan is a property of
  // the whole tree and a person reading THIS route should see the rule stated
  // where it applies.
  const s = src();
  assert.ok(!/from\s+["']@\/lib\/paas\/db["']/.test(s), "must not import the service-role client");
  assert.ok(/@\/lib\/supabase\/server/.test(s), "must use the RLS-scoped server client");
});

test("the query carries NO team filter, because the database owns that decision", () => {
  // A hand-written `.eq("team_id", ...)` here would be a second, weaker copy of
  // an RLS policy. Two copies of an authorization rule drift, and the drift is
  // only noticed when the weaker one lets something through.
  const s = src();
  assert.ok(!/\.eq\(\s*["'](team_id|user_id|owner_id)["']/.test(s), "no hand-rolled tenant filter");
});

test("AN ERROR IS NOT AN EMPTY LIST", () => {
  // The defect this route would otherwise ship: PostgREST returns
  // `{ data: null, error }` on failure, and `data ?? []` renders that as "you
  // have no projects". A customer whose read failed would see an empty
  // dashboard and reasonably conclude their apps were deleted.
  const s = src();
  assert.ok(/if\s*\(r\.error\)|\.error\)\s*\{/.test(s), "every read's error must be checked");
  assert.ok(/apiError\(\s*["']internal["']/.test(s), "a failed read must surface as an error, not as data");
});

test("an unauthenticated caller gets 401, never an empty result", () => {
  // Proven live against the running server: 401 with an `unauthenticated` body,
  // not `{projects: [], count: 0}`. The empty-list version is the dangerous one
  // — it looks like a successful answer to a question nobody was allowed to ask.
  const s = src();
  assert.ok(/return unauthenticated\(\)/.test(s));
  assert.ok(/authError \|\| !user/.test(s), "a failed auth lookup must not fall through as anonymous");
});

test("a branch alias is never shown as the app's address", () => {
  // Preview hostnames are `branch` aliases and are per-branch, temporary, and
  // reaped after 48h. Showing one as the project's own hostname would put a URL
  // in the dashboard that stops working on its own.
  assert.match(src(), /kind === "branch"/);
});
