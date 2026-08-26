/**
 * Tests for the Wokey upstream adapter's pure logic.
 *
 * These three functions are the ones where a quiet mistake costs money or
 * leaks information, which is why they are the first tests this worker has:
 *
 *   readCachedTokens    — a miss silently overcharges every cached request
 *   clampCachedTokens   — unvalidated upstream numbers feed the billing math
 *   sanitizeUpstreamError — the upstream names itself in its own error prose
 *
 * The usage fixtures below are real responses captured from
 * api.wokey.ai on 2026-08-25, not invented shapes.
 */
import { describe, expect, it } from "vitest";
import {
  clampCachedTokens,
  readCachedTokens,
  resolveUpstreamKey,
  sanitizeUpstreamError,
} from "./wokey.ts";

// Verbatim from a non-streaming POST /v1/chat/completions.
const WOKEY_USAGE_NONSTREAM = {
  prompt_tokens: 24,
  completion_tokens: 1,
  total_tokens: 25,
  cache_write_tokens: 0,
  cache_read_tokens: 7,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 7,
};

// Verbatim from the final SSE chunk with stream_options.include_usage.
const WOKEY_USAGE_STREAM = {
  input_tokens: 25,
  cache_read_input_tokens: 5,
  output_tokens: 5,
  prompt_tokens: 25,
  completion_tokens: 5,
  total_tokens: 30,
  cache_read_tokens: 5,
};

const OPENAI_USAGE = {
  prompt_tokens: 100,
  completion_tokens: 10,
  prompt_tokens_details: { cached_tokens: 40 },
};

describe("readCachedTokens", () => {
  it("reads OpenAI's spelling in preference to the others", () => {
    // Both present and disagreeing: OpenAI's wins, because a managed vLLM
    // endpoint reporting the standard shape must not be overridden.
    expect(
      readCachedTokens({ ...OPENAI_USAGE, cache_read_tokens: 999 })
    ).toBe(40);
  });

  it("reads Wokey's non-streaming shape", () => {
    expect(readCachedTokens(WOKEY_USAGE_NONSTREAM)).toBe(7);
  });

  it("reads Wokey's final-SSE-chunk shape", () => {
    expect(readCachedTokens(WOKEY_USAGE_STREAM)).toBe(5);
  });

  it("distinguishes 'no cache info' from 'zero cached'", () => {
    // null and 0 must not collapse: one means the upstream said nothing,
    // the other means it reported a real zero.
    expect(readCachedTokens({ prompt_tokens: 10 })).toBeNull();
    expect(readCachedTokens({ cache_read_tokens: 0 })).toBe(0);
  });

  it("survives junk without throwing", () => {
    expect(readCachedTokens(null)).toBeNull();
    expect(readCachedTokens(undefined)).toBeNull();
    expect(readCachedTokens("nope")).toBeNull();
    expect(readCachedTokens({ cache_read_tokens: "12" })).toBeNull();
    expect(readCachedTokens({ prompt_tokens_details: null })).toBeNull();
  });
});

describe("clampCachedTokens", () => {
  it("passes through a plausible value", () => {
    expect(clampCachedTokens(40, 100)).toBe(40);
  });

  it("floors a negative at zero", () => {
    // Unclamped this is the dangerous direction: billable_input is
    // max(0, input - cached), so a negative cached INCREASES the bill.
    expect(clampCachedTokens(-500, 100)).toBe(0);
  });

  it("caps at the input count", () => {
    // Cached tokens are a subset of input tokens by definition, so an
    // upstream claiming more is either buggy or hostile. Either way the
    // cached term (cached * cached_rate) must not run away.
    expect(clampCachedTokens(10_000_000, 100)).toBe(100);
  });

  it("passes through when the ceiling is unknown", () => {
    expect(clampCachedTokens(40, null)).toBe(40);
    expect(clampCachedTokens(40, undefined)).toBe(40);
  });

  it("keeps null as null", () => {
    expect(clampCachedTokens(null, 100)).toBeNull();
  });

  it("rejects non-finite values", () => {
    expect(clampCachedTokens(Number.NaN, 100)).toBeNull();
    expect(clampCachedTokens(Number.POSITIVE_INFINITY, 100)).toBeNull();
  });
});

describe("sanitizeUpstreamError", () => {
  // The real 404 body, captured live. It names the provider twice.
  const REAL_404 =
    '{"error":{"code":"model_not_found","message":"Model ID ' +
    '\\"anthropic/claude-haiku-4.5\\" was not recognized. Model IDs must ' +
    "exactly match an ID in the model list. Visit https://wokey.ai/models " +
    'to copy the correct model ID and try again.","type":"invalid_request_error"}}';

  it("does not leak the upstream provider on a 404", () => {
    const out = sanitizeUpstreamError(404, REAL_404, "req_1");
    const serialized = JSON.stringify(out.body).toLowerCase();
    expect(serialized).not.toContain("wokey");
    expect(serialized).not.toContain("api.wokey.ai");
    expect(out.body.error.code).toBe("model_not_found");
  });

  it("points the caller at our own model list instead", () => {
    const out = sanitizeUpstreamError(404, REAL_404, "req_1");
    expect(out.body.error.message).toContain("/v1/models");
  });

  it("never leaks provider identity at any status", () => {
    const leaky =
      "upstream api.wokey.ai rejected key sk-wok-abc123 for account tier free";
    for (const status of [400, 401, 403, 404, 422, 429, 500, 502, 503]) {
      const out = sanitizeUpstreamError(status, leaky, "req_2");
      const s = JSON.stringify(out.body).toLowerCase();
      expect(s).not.toContain("wokey");
      expect(s).not.toContain("sk-wok");
      expect(s).not.toContain("tier");
    }
  });

  it("hides that OUR credential is what failed", () => {
    // A 401 from upstream is our account's problem, not the customer's.
    // Telling them "unauthorized" invites them to debug their own key.
    const out = sanitizeUpstreamError(401, "invalid api key", "req_3");
    expect(out.body.error.code).toBe("upstream_unavailable");
    expect(out.body.error.message.toLowerCase()).not.toContain("key");
    expect(out.body.error.message.toLowerCase()).not.toContain("auth");
  });

  it("still tells a client a 4xx was their fault", () => {
    const out = sanitizeUpstreamError(400, "bad parameter: temperature", "req_4");
    expect(out.body.error.type).toBe("invalid_request_error");
  });

  it("marks 429 retryable", () => {
    const out = sanitizeUpstreamError(429, "slow down", "req_5");
    expect(out.body.error.type).toBe("rate_limit_error");
  });

  it("preserves the original text for server-side logging", () => {
    const out = sanitizeUpstreamError(404, REAL_404, "req_6");
    expect(out.upstreamText).toBe(REAL_404);
  });

  it("threads the request id through", () => {
    const out = sanitizeUpstreamError(500, "boom", "req_7");
    expect(out.body.error.request_id).toBe("req_7");
  });
});

describe("resolveUpstreamKey — BYOK provider guard", () => {
  // A minimal env is enough: the guard must reject before any Supabase call,
  // so these never touch the network. If the guard regresses, the missing
  // SUPABASE_URL will surface as a different error and the test still fails.
  const env = { WOKEY_PLATFORM_KEY: "wk_platform" } as unknown as Parameters<
    typeof resolveUpstreamKey
  >[0];

  it("rejects a provider this gateway cannot route to", async () => {
    // The point is credential containment, not tidiness: without this the
    // customer's OpenAI key is decrypted and sent to Wokey as a Bearer token.
    await expect(
      resolveUpstreamKey(env, "byok", "org_1", "openai")
    ).rejects.toThrow(/not available for provider 'openai'/);
  });

  it("rejects every non-routable provider in the enum", async () => {
    for (const p of ["openai", "anthropic", "google", "mistral", "custom", "openrouter"]) {
      await expect(
        resolveUpstreamKey(env, "byok", "org_1", p)
      ).rejects.toThrow(/BYOK is not available/);
    }
  });

  it("tells the caller what to do instead", async () => {
    await expect(
      resolveUpstreamKey(env, "byok", "org_1", "anthropic")
    ).rejects.toThrow(/switch to platform billing/);
  });

  it("platform billing is unaffected by the guard", async () => {
    await expect(resolveUpstreamKey(env, "platform", "org_1", "openai")).resolves.toBe(
      "wk_platform"
    );
  });
});
