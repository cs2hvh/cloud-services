import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  encryptConnectionToken,
  decryptConnectionToken,
  needsRefresh,
  redactToken,
} from "./credentials.ts";

const TOKEN = "glpat-AbCdEf1234567890xyz";

before(() => {
  process.env.V2_ENV_MASTER_KEY = randomBytes(32).toString("base64");
  process.env.V2_ENV_MASTER_KEY_ID = "mk1";
});

test("a token round-trips", () => {
  const e = encryptConnectionToken("gitlab", "42", "access", TOKEN);
  assert.equal(decryptConnectionToken("gitlab", "42", "access", e.tokenCt, e.dekId), TOKEN);
});

test("the ciphertext does not contain the plaintext", () => {
  const e = encryptConnectionToken("gitlab", "42", "access", TOKEN);
  assert.ok(!e.tokenCt.toString("utf8").includes(TOKEN));
  assert.ok(!e.tokenCt.toString("base64").includes(Buffer.from(TOKEN).toString("base64")));
});

test("two encryptions of the same token differ", () => {
  // A fresh nonce each time. Identical ciphertexts would tell anyone reading
  // the table which teams share a token.
  const a = encryptConnectionToken("gitlab", "42", "access", TOKEN);
  const b = encryptConnectionToken("gitlab", "42", "access", TOKEN);
  assert.notEqual(a.tokenCt.toString("hex"), b.tokenCt.toString("hex"));
});

test("an access ciphertext cannot be read as a refresh token", () => {
  // The kind is bound into the key, so moving a value between columns makes it
  // undecryptable rather than silently valid in the wrong slot.
  const e = encryptConnectionToken("gitlab", "42", "access", TOKEN);
  assert.throws(() => decryptConnectionToken("gitlab", "42", "refresh", e.tokenCt, e.dekId));
});

test("a token cannot be replayed into another connection", () => {
  const e = encryptConnectionToken("gitlab", "42", "access", TOKEN);
  assert.throws(() => decryptConnectionToken("gitlab", "43", "access", e.tokenCt, e.dekId), "different id");
});

test("GitLab project 42 and GitHub installation 42 are different keys", () => {
  // The numeric collision across providers that link_installation also guards
  // against, closed cryptographically as well as by the unique key.
  const e = encryptConnectionToken("gitlab", "42", "access", TOKEN);
  assert.throws(() => decryptConnectionToken("github", "42", "access", e.tokenCt, e.dekId));
});

test("a tampered ciphertext throws rather than returning garbage", () => {
  // GCM is authenticated. v1 returned raw ciphertext on failure and it went
  // into running containers; the equivalent here is sending a blob to GitLab
  // as a bearer token and reading the 401 as an expired connection.
  const e = encryptConnectionToken("gitlab", "42", "access", TOKEN);
  const bad = Buffer.from(e.tokenCt);
  bad[bad.length - 1] ^= 0xff;
  assert.throws(() => decryptConnectionToken("gitlab", "42", "access", bad, e.dekId));
});

test("an env-var ciphertext cannot be fed to this decrypt", () => {
  // Different scheme string, so a value from secrets.ts is refused by name
  // rather than failing somewhere less legible.
  const e = encryptConnectionToken("gitlab", "42", "access", TOKEN);
  assert.throws(
    () => decryptConnectionToken("gitlab", "42", "access", e.tokenCt, "v1:mk1"),
    /unknown scheme/,
  );
});

test("a ciphertext from another master key is refused, not guessed", () => {
  const e = encryptConnectionToken("gitlab", "42", "access", TOKEN);
  assert.throws(() => decryptConnectionToken("gitlab", "42", "access", e.tokenCt, "conn1:mk2"), /master key/);
});

test("a truncated ciphertext is refused before decryption is attempted", () => {
  const e = encryptConnectionToken("gitlab", "42", "access", TOKEN);
  assert.throws(() => decryptConnectionToken("gitlab", "42", "access", e.tokenCt.subarray(0, 10), e.dekId), /too short/);
});

test("encrypting an empty token is refused", () => {
  // An empty credential stored successfully is a connection that looks live and
  // 401s on first use.
  assert.throws(() => encryptConnectionToken("gitlab", "42", "access", ""), /empty token/);
});

test("a missing master key is fatal, never a passthrough", () => {
  const saved = process.env.V2_ENV_MASTER_KEY;
  try {
    delete process.env.V2_ENV_MASTER_KEY;
    assert.throws(() => encryptConnectionToken("gitlab", "42", "access", TOKEN), /not set/);
  } finally {
    process.env.V2_ENV_MASTER_KEY = saved;
  }
});

test("a short master key is fatal rather than padded", () => {
  const saved = process.env.V2_ENV_MASTER_KEY;
  try {
    process.env.V2_ENV_MASTER_KEY = randomBytes(16).toString("base64");
    assert.throws(() => encryptConnectionToken("gitlab", "42", "access", TOKEN), /32 bytes/);
  } finally {
    process.env.V2_ENV_MASTER_KEY = saved;
  }
});

// ── refresh timing ──────────────────────────────────────────────────────────

const NOW = new Date("2026-08-27T12:00:00Z");
const inSeconds = (s: number) => new Date(NOW.getTime() + s * 1000).toISOString();

test("a token expiring soon needs refreshing", () => {
  assert.equal(needsRefresh(inSeconds(60), NOW), true);
  assert.equal(needsRefresh(inSeconds(3600), NOW), false);
});

test("the margin is generous, because a token expiring mid-build fails the clone", () => {
  // 5 minutes: better to refresh once too often than hand a build VM a
  // credential with ninety seconds left.
  assert.equal(needsRefresh(inSeconds(299), NOW), true);
  assert.equal(needsRefresh(inSeconds(301), NOW), false);
});

test("an already-expired token needs refreshing", () => {
  assert.equal(needsRefresh(inSeconds(-1), NOW), true);
});

test("an UNKNOWN expiry needs refreshing, rather than being treated as forever", () => {
  // An unknown lifetime that turns out to be short fails in the build; one that
  // turns out to be long costs a refresh call. Only one of those is expensive.
  assert.equal(needsRefresh(null, NOW), true);
  assert.equal(needsRefresh("not a date", NOW), true);
});

test("a Date and its ISO string agree", () => {
  assert.equal(needsRefresh(new Date(NOW.getTime() + 3600_000), NOW), false);
});

// ── redaction ───────────────────────────────────────────────────────────────

test("redaction keeps a token identifiable without printing it", () => {
  const r = redactToken(TOKEN);
  assert.ok(!r.includes(TOKEN));
  assert.ok(r.startsWith("glpa"), "enough to correlate two log lines");
  assert.ok(r.includes(String(TOKEN.length)), "length, so a truncated token is visible");
});

test("a short token is redacted entirely rather than mostly shown", () => {
  assert.equal(redactToken("abc123"), "(redacted)");
  assert.equal(redactToken(""), "(empty)");
});
