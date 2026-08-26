/**
 * Env var encryption tests.
 *
 *   node --env-file=.env --env-file=.env.local --test lib/paas/secrets.test.ts
 *
 * Weighted toward failing LOUDLY. v1's decryption failed silently: a wrong or
 * rotated key made it return the raw ciphertext as the value, which was then
 * written into the Kubernetes Secret and into the customer's .env download.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encryptEnvValue,
  decryptEnvValue,
  bytesToPgHex,
  pgHexToBytes,
  secretEquals,
} from "./secrets.ts";

const PRJ = "prj-abc123";

test("round-trips a value", () => {
  const { valueCt, dekId } = encryptEnvValue(PRJ, "DATABASE_URL", "postgres://u:p@h/db");
  assert.equal(decryptEnvValue(PRJ, "DATABASE_URL", valueCt, dekId), "postgres://u:p@h/db");
});

test("handles empty, unicode and long values", () => {
  for (const v of ["", "héllo 🌍 \n\t", "x".repeat(64_000)]) {
    const { valueCt, dekId } = encryptEnvValue(PRJ, "K", v);
    assert.equal(decryptEnvValue(PRJ, "K", valueCt, dekId), v);
  }
});

test("the same plaintext encrypts differently every time", () => {
  // A deterministic ciphertext would leak which variables share a value across
  // projects just by comparing bytes.
  const a = encryptEnvValue(PRJ, "K", "same");
  const b = encryptEnvValue(PRJ, "K", "same");
  assert.notEqual(a.valueCt.toString("hex"), b.valueCt.toString("hex"));
});

// ── the properties that actually contain a breach ───────────────────────────

test("a ciphertext cannot be replayed into another PROJECT", () => {
  const { valueCt, dekId } = encryptEnvValue("prj-victim", "SECRET", "victim-value");
  assert.throws(
    () => decryptEnvValue("prj-attacker", "SECRET", valueCt, dekId),
    /authentication failed/,
    "moving a row between projects must not make it readable",
  );
});

test("a ciphertext cannot be replayed under another KEY name", () => {
  const { valueCt, dekId } = encryptEnvValue(PRJ, "STRIPE_SECRET", "sk_live_x");
  assert.throws(
    () => decryptEnvValue(PRJ, "PUBLIC_THING", valueCt, dekId),
    /authentication failed/,
    "renaming a var to a public-prefixed name must not expose it as a build arg",
  );
});

test("tampering with the ciphertext is detected", () => {
  const { valueCt, dekId } = encryptEnvValue(PRJ, "K", "value");
  const tampered = Buffer.from(valueCt);
  tampered[tampered.length - 20] ^= 0xff;
  assert.throws(() => decryptEnvValue(PRJ, "K", tampered, dekId), /authentication failed/);
});

test("a truncated ciphertext is rejected, not partially decrypted", () => {
  const { valueCt, dekId } = encryptEnvValue(PRJ, "K", "value");
  assert.throws(() => decryptEnvValue(PRJ, "K", valueCt.subarray(0, 8), dekId), /truncated/);
});

test("failure NEVER returns ciphertext or a placeholder — the v1 bug", () => {
  const { valueCt, dekId } = encryptEnvValue("prj-a", "K", "real-secret");
  let returned: unknown = "SENTINEL";
  try {
    returned = decryptEnvValue("prj-b", "K", valueCt, dekId);
  } catch {
    returned = "THREW";
  }
  assert.equal(returned, "THREW", "a failed decrypt must raise, never return a value-shaped result");
});

test("a value written under another master key is refused with a clear reason", () => {
  const { valueCt } = encryptEnvValue(PRJ, "K", "v");
  assert.throws(
    () => decryptEnvValue(PRJ, "K", valueCt, "v1:mk99"),
    /encrypted under master key "mk99"/,
    "must name the actual problem rather than surfacing an auth failure",
  );
});

test("an unknown scheme is refused", () => {
  const { valueCt } = encryptEnvValue(PRJ, "K", "v");
  assert.throws(() => decryptEnvValue(PRJ, "K", valueCt, "v9:mk1"), /unknown encryption scheme/);
});

test("dekId records scheme and master key so rotation is possible", () => {
  assert.match(encryptEnvValue(PRJ, "K", "v").dekId, /^v1:mk[a-z0-9]+$/);
});

// ── storage encoding ────────────────────────────────────────────────────────

test("bytea hex encoding round-trips", () => {
  const { valueCt } = encryptEnvValue(PRJ, "K", "value");
  assert.deepEqual(pgHexToBytes(bytesToPgHex(valueCt)), valueCt);
});

test("a non-bytea string is rejected rather than silently mangled", () => {
  assert.throws(() => pgHexToBytes("not-hex"), /expected a/);
});

test("secretEquals is length-safe and correct", () => {
  assert.equal(secretEquals("abc", "abc"), true);
  assert.equal(secretEquals("abc", "abd"), false);
  assert.equal(secretEquals("abc", "abcd"), false);
  assert.equal(secretEquals("", ""), true);
});
