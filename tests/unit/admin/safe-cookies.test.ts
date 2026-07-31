import { describe, it, expect } from "vitest";
import { isUsableAuthValue, safeAuthCookies } from "@/lib/supabase/safe-cookies";

// Regression for the platform-wide 500 found by E2E on 2026-07-29: a malformed
// Supabase auth cookie made EVERY authenticated route return 500 instead of
// redirecting to login.

const session = { access_token: "x", refresh_token: "y", user: { id: "u" } };
const good = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");

describe("isUsableAuthValue", () => {
  it("accepts a real session payload", () => {
    expect(isUsableAuthValue(good)).toBe(true);
  });

  it("rejects `base64-garbage` — legal base64url that is NOT JSON", () => {
    // The case a first attempt missed: "garbage" is entirely legal base64url,
    // so an alphabet-only check passed it and the crash moved to JSON.parse.
    expect(isUsableAuthValue("base64-garbage")).toBe(false);
  });

  it("rejects standard base64 with + and / (not base64url)", () => {
    expect(isUsableAuthValue("base64-ab/cd+ef")).toBe(false);
  });

  it("rejects an empty payload", () => {
    expect(isUsableAuthValue("base64-")).toBe(false);
  });

  it("rejects valid base64 whose contents are not an object", () => {
    expect(isUsableAuthValue("base64-" + Buffer.from('"a string"').toString("base64url"))).toBe(false);
    expect(isUsableAuthValue("base64-" + Buffer.from("42").toString("base64url"))).toBe(false);
    expect(isUsableAuthValue("base64-" + Buffer.from("null").toString("base64url"))).toBe(false);
  });

  it("rejects truncated JSON — the realistic corruption", () => {
    const truncated = JSON.stringify(session).slice(0, 20);
    expect(isUsableAuthValue("base64-" + Buffer.from(truncated).toString("base64url"))).toBe(false);
  });

  it("leaves non-base64 (legacy/plain) values alone", () => {
    expect(isUsableAuthValue('{"access_token":"x"}')).toBe(true);
  });

  it("keeps a session whose JSON contains multi-byte UTF-8", () => {
    // A display name with an accent or CJK must not be mistaken for corruption.
    // The old escape()-based fallback mangled these; atob + TextDecoder does not.
    const unicode = { access_token: "x", user: { name: "café ✓ 日本語 — Ωmega" } };
    const value = "base64-" + Buffer.from(JSON.stringify(unicode)).toString("base64url");
    expect(isUsableAuthValue(value)).toBe(true);
  });

  it("decodes without depending on legacy globals", () => {
    // Guards the Edge path: this file runs on every request through middleware,
    // so a ReferenceError here would fail the whole site, not one login.
    const value = "base64-" + Buffer.from(JSON.stringify({ a: 1 })).toString("base64url");
    const original = globalThis.Buffer;
    try {
      // @ts-expect-error — simulate a runtime with no Buffer (Edge/worker).
      delete (globalThis as { Buffer?: unknown }).Buffer;
      expect(isUsableAuthValue(value)).toBe(true);
    } finally {
      globalThis.Buffer = original;
    }
  });
});

describe("safeAuthCookies", () => {
  it("passes a healthy jar through untouched", () => {
    const jar = [{ name: "sb-ref-auth-token", value: good }, { name: "theme", value: "dark" }];
    expect(safeAuthCookies(jar)).toEqual(jar);
  });

  it("drops a malformed auth cookie so the request reads as unauthenticated", () => {
    const jar = [{ name: "sb-ref-auth-token", value: "base64-garbage" }, { name: "theme", value: "dark" }];
    expect(safeAuthCookies(jar)).toEqual([{ name: "theme", value: "dark" }]);
  });

  it("REASSEMBLES chunks before judging them", () => {
    // Each chunk is a fragment of one base64 string; judged alone a valid
    // session would be thrown away.
    const half = Math.ceil(good.length / 2);
    const jar = [
      { name: "sb-ref-auth-token.0", value: good.slice(0, half) },
      { name: "sb-ref-auth-token.1", value: good.slice(half) },
    ];
    expect(safeAuthCookies(jar)).toHaveLength(2);
  });

  it("reassembles out-of-order chunks correctly", () => {
    const half = Math.ceil(good.length / 2);
    const jar = [
      { name: "sb-ref-auth-token.1", value: good.slice(half) },
      { name: "sb-ref-auth-token.0", value: good.slice(0, half) },
    ];
    expect(safeAuthCookies(jar)).toHaveLength(2);
  });

  it("drops EVERY chunk when the assembled session is broken", () => {
    const half = Math.ceil(good.length / 2);
    const jar = [
      { name: "sb-ref-auth-token.0", value: good.slice(0, half) },
      { name: "other", value: "keep" },
    ]; // chunk .1 lost — the classic truncation
    expect(safeAuthCookies(jar).map((c) => c.name)).toEqual(["other"]);
  });

  it("never touches non-auth cookies, however odd", () => {
    const jar = [{ name: "weird", value: "base64-!!!" }, { name: "sb-ref-auth-token", value: good }];
    expect(safeAuthCookies(jar)).toEqual(jar);
  });

  it("leaves a jar with no auth cookie alone", () => {
    const jar = [{ name: "theme", value: "dark" }];
    expect(safeAuthCookies(jar)).toEqual(jar);
  });

  it("handles an empty jar", () => {
    expect(safeAuthCookies([])).toEqual([]);
  });
});
