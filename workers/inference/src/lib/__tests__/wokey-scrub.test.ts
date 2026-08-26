import { describe, it, expect } from "vitest";
import { scrubJson, stripInfraFromText } from "../brand-scrub.ts";

/**
 * A second supplier is only a secret if the scrub knows its name.
 *
 * Scope note, learned the hard way while writing this: scrubJson deliberately
 * does NOT rewrite model output — that is what the model said, and rewriting it
 * would corrupt legitimate answers. What it scrubs is ERROR text and metadata,
 * which is where an upstream name actually escapes, plus the `provider` key
 * OpenRouter adds. These test that path, not the content path.
 */
describe("stripInfraFromText — the new supplier", () => {
  const leaks: Array<[string, string]> = [
    ["plain name", "Upstream Wokey rejected the request"],
    ["lowercase", "served via wokey"],
    ["bare host", "see wokey.ai for status"],
    ["api host", "failed at api.wokey.ai"],
    ["full url", "error from https://api.wokey.ai/v1/chat/completions"],
    ["env var", "WOKEY_PLATFORM_KEY is not configured"],
  ];
  for (const [label, text] of leaks) {
    it(`scrubs ${label}`, () => {
      expect(stripInfraFromText(text)).not.toMatch(/wokey/i);
    });
  }

  it("still scrubs the original supplier — the new rules did not displace it", () => {
    expect(stripInfraFromText("Upstream OpenRouter rejected it")).not.toMatch(/openrouter/i);
    expect(stripInfraFromText("see https://openrouter.ai/docs")).not.toMatch(/openrouter/i);
  });

  it("leaves model vendor names alone — we publish those ourselves", () => {
    // Scrubbing these would corrupt 'anthropic/claude-sonnet-4.6 is not a valid
    // model ID', which names OUR catalog id back to the caller.
    expect(stripInfraFromText("anthropic/claude-sonnet-4.6 is not valid")).toContain(
      "anthropic/claude-sonnet-4.6",
    );
  });
});

describe("scrubJson — error paths carry the supplier name", () => {
  it("scrubs a supplier name out of an upstream error message", () => {
    const out = JSON.stringify(
      scrubJson({ error: { message: "Wokey returned 502 from api.wokey.ai" } }, "m", "r"),
    );
    expect(out).not.toMatch(/wokey/i);
  });

  it("drops the provider key entirely, whichever supplier set it", () => {
    const out = scrubJson({ provider: "Wokey", choices: [] }, "m", "r");
    expect(out).not.toHaveProperty("provider");
  });
});
