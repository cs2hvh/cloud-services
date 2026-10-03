import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deployHookUrl,
  hashHookToken,
  hookHashesEqual,
  isWellFormedHookToken,
  mintHookToken,
} from "./deploy-hooks.ts";

test("a minted token has the documented shape", () => {
  const { token } = mintHookToken();
  assert.match(token, /^dh_[A-Za-z0-9_-]{43}$/);
  assert.ok(isWellFormedHookToken(token));
});

test("the stored hash is the sha256 of the token, and never the token itself", () => {
  const m = mintHookToken();
  assert.equal(m.hash, hashHookToken(m.token));
  assert.match(m.hash, /^[0-9a-f]{64}$/);
  assert.ok(!m.hash.includes(m.token));
});

test("the hint is the last four characters and nothing more", () => {
  const m = mintHookToken();
  assert.equal(m.hint.length, 4);
  assert.ok(m.token.endsWith(m.hint));
});

test("tokens do not repeat", () => {
  // Not a proof of entropy — a guard against someone replacing randomBytes with
  // something deterministic, which would pass every other test here.
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i++) seen.add(mintHookToken().token);
  assert.equal(seen.size, 2000);
});

test("malformed tokens are rejected before any lookup", () => {
  for (const bad of [
    "",
    "dh_",
    "dh_short",
    `sk_${"a".repeat(43)}`, // a personal access token is not a hook
    `dh_${"a".repeat(42)}`,
    `dh_${"a".repeat(44)}`,
    `dh_${"a".repeat(42)}/`, // path characters must never reach a lookup
    `dh_${"a".repeat(42)}=`, // padding is not part of base64url as minted
  ]) {
    assert.equal(isWellFormedHookToken(bad), false, `accepted: ${JSON.stringify(bad)}`);
  }
});

test("hash comparison is exact and length-safe", () => {
  const h = hashHookToken("dh_x");
  assert.ok(hookHashesEqual(h, h));
  assert.ok(!hookHashesEqual(h, hashHookToken("dh_y")));
  assert.ok(!hookHashesEqual(h, h.slice(1)));
});

test("the hook URL tolerates a trailing slash on the app URL", () => {
  assert.equal(deployHookUrl("https://ahurasense.com/", "dh_t"), "https://ahurasense.com/api/v2/hooks/deploy/dh_t");
  assert.equal(deployHookUrl("https://ahurasense.com", "dh_t"), "https://ahurasense.com/api/v2/hooks/deploy/dh_t");
});
