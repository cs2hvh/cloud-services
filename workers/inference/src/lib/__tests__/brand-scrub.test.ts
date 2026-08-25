import { describe, it, expect } from "vitest";
import { scrubJson, stripInfraFromText } from "../brand-scrub.ts";

// The hard rule: a customer must never learn WHO ROUTES their call. Model
// vendor names are public (our own catalog ids are "openai/gpt-4o-mini"), so
// they must survive untouched — scrubbing them would corrupt our own errors.

describe("stripInfraFromText", () => {
  it("removes the routing gateway's name", () => {
    expect(stripInfraFromText("Upstream OpenRouter rejected the request")).not.toMatch(/openrouter/i);
  });

  it("removes a gateway URL, not just the bare name", () => {
    // Real message that reached a customer, 2026-07-28.
    const out = stripInfraFromText(
      "Grok 4 is deprecated. xAI recommends switching to Grok 4.3 (https://openrouter.ai/x-ai/grok-4.3)"
    );
    expect(out).not.toMatch(/openrouter/i);
    expect(out).not.toMatch(/https?:\/\//);
    // The actionable part of the message must survive.
    expect(out).toMatch(/deprecated/i);
    expect(out).toMatch(/Grok 4\.3/);
    // ...and the sentence must still read correctly. A greedy \S* URL match
    // ate the closing ")" and shipped "(the model gateway" to the customer.
    const opens = (out.match(/\(/g) ?? []).length;
    const closes = (out.match(/\)/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(out).toContain("(the model gateway)");
  });

  it("keeps punctuation intact around a scrubbed URL", () => {
    expect(stripInfraFromText("see https://openrouter.ai/docs, then retry")).toBe(
      "see the model gateway, then retry"
    );
    expect(stripInfraFromText("failed at https://x.workers.dev/y. Retry.")).toBe("failed at [internal]. Retry.");
  });

  it("scrubs the other infra names", () => {
    expect(stripInfraFromText("RunPod pod died")).not.toMatch(/runpod/i);
    expect(stripInfraFromText("Cloudflare timed out")).not.toMatch(/cloudflare/i);
    expect(stripInfraFromText("vLLM refused")).not.toMatch(/vllm/i);
    expect(stripInfraFromText("see https://abc.workers.dev/x")).not.toMatch(/workers\.dev/);
  });

  it("leaves MODEL VENDOR names alone — we publish those ourselves", () => {
    const msg = "google/gemini-3-pro is not a valid model ID";
    expect(stripInfraFromText(msg)).toBe(msg);
    expect(stripInfraFromText("openai/gpt-4o-mini is not a valid model ID")).toMatch(/openai\/gpt-4o-mini/);
    expect(stripInfraFromText("anthropic/claude-opus-4.7 unavailable")).toMatch(/anthropic/);
  });

  it("leaves an ordinary parameter error untouched", () => {
    const msg = "max_tokens must be at least 16";
    expect(stripInfraFromText(msg)).toBe(msg);
  });
});

describe("scrubJson — error branch", () => {
  it("scrubs the message text, not only the provider key", () => {
    const out = scrubJson(
      {
        error: {
          message: "Provider OpenRouter returned an error (https://openrouter.ai/docs)",
          code: 400,
          provider: "openrouter",
          metadata: { provider_name: "xai", raw: '{"detail":"OpenRouter upstream failed"}' },
        },
      },
      "openai/gpt-4o-mini"
    );
    const serialized = JSON.stringify(out);
    expect(serialized).not.toMatch(/openrouter/i);
    expect(serialized).not.toMatch(/provider_name/);
    // Non-branded fields survive.
    expect((out.error as Record<string, unknown>).code).toBe(400);
  });

  it("does NOT scrub completion content — a user may legitimately ask about these", () => {
    const out = scrubJson(
      {
        choices: [{ message: { role: "assistant", content: "OpenRouter is an LLM routing service." } }],
      },
      "openai/gpt-4o-mini"
    );
    // Only the `error` branch is text-scrubbed; answers pass through verbatim.
    expect(JSON.stringify(out)).toMatch(/OpenRouter is an LLM routing service/);
  });
});
