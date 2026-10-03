/**
 * The invariants of API-key authentication, as a test rather than a comment.
 *
 * An API key is the second way to become a caller on the v2 API, and it is the
 * one no human watches happen. These assertions pin the four properties that
 * make it safe to expose; each one, if it silently stopped holding, would not
 * fail any other test in the suite.
 *
 * Source assertions rather than behavioural ones: the functions they describe
 * read request headers and reach Supabase, so exercising them would need a
 * logged-in request and a live auth server. What is worth protecting here is
 * structural — WHICH credential is trusted and WHICH client the queries run
 * through — and that is visible in the source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const AUTH = readFileSync(new URL("../../app/api/v2/_lib/auth.ts", import.meta.url), "utf8");

/** The body of one top-level function, from its declaration to the next one. */
function body(source: string, declaration: string): string {
  const start = source.indexOf(declaration);
  assert.notEqual(start, -1, `${declaration} has been renamed or removed`);
  const rest = source.slice(start + declaration.length);
  const end = rest.search(/\n(?:export )?(?:async )?function |\nexport interface /);
  return end === -1 ? rest : rest.slice(0, end);
}

test("only an sk_ token is treated as an API key", () => {
  // A Supabase JWT also arrives as `Bearer …`. Accepting one here would hand a
  // token meant for a different flow to the key validator.
  assert.match(body(AUTH, "async function bearerApiKey"), /startsWith\("sk_"\)/);
});

test("an API key carries its account's suspension", () => {
  // Without this a suspended account keeps full API access after the dashboard
  // has already locked it out — the quiet half of a suspension.
  assert.match(body(AUTH, "async function callerFromApiKey"), /isSuspended\(/);
});

test("the API-key caller queries through RLS, never the service role", () => {
  // The whole point. The service role appears on this path only to validate the
  // key and to obtain the user's own session; if a tenant query ever ran
  // through it, API callers would silently stop being filtered by policy.
  const fn = body(AUTH, "async function callerFromApiKey");
  assert.match(fn, /paasSchema\(createServerSupabase\(/);
  assert.doesNotMatch(fn, /createServiceClient|createWorkerClient|SERVICE_ROLE/);
});

test("a key is resolved before any cookie on the same request", () => {
  // A script that sends a key has named the identity it means to act as.
  // Reading the cookie first would run the call as whoever was last signed in.
  const fn = body(AUTH, "export async function getCaller");
  const key = fn.indexOf("bearerApiKey()");
  const cookie = fn.indexOf("createClient()");
  assert.notEqual(key, -1, "getCaller no longer looks for an API key");
  assert.notEqual(cookie, -1, "getCaller no longer has a cookie path");
  assert.ok(key < cookie, "the cookie path is reached before the API key is checked");
});
