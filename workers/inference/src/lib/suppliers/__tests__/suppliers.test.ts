import { describe, it, expect } from "vitest";
import { getSupplier, DEFAULT_SUPPLIER, openrouter, wokey } from "../index.ts";
import type { Env } from "../../../types.ts";

const env = {
  OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
  OPENROUTER_PLATFORM_KEY: "sk-test",
} as unknown as Env;

describe("supplier registry", () => {
  it("defaults to OpenRouter when no preference is recorded", () => {
    expect(getSupplier(null).id).toBe("openrouter");
    expect(getSupplier(undefined).id).toBe("openrouter");
    expect(getSupplier("").id).toBe("openrouter");
  });

  it("resolves a known supplier", () => {
    expect(getSupplier("openrouter")).toBe(openrouter);
    expect(getSupplier("wokey")).toBe(wokey);
  });

  it("falls back to OpenRouter on an unknown id rather than throwing", () => {
    // A bad value in models.preferred_provider must send traffic to the safe
    // supplier, not fail the customer's request. Plan §9.4: uncertainty routes
    // to OpenRouter.
    expect(getSupplier("not-a-supplier").id).toBe("openrouter");
    expect(DEFAULT_SUPPLIER.id).toBe("openrouter");
  });
});

describe("openrouter supplier", () => {
  it("strips a trailing slash so path joining cannot double up", () => {
    const withSlash = { ...env, OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1/" } as Env;
    expect(openrouter.baseUrl(withSlash)).toBe("https://openrouter.ai/api/v1");
    expect(`${openrouter.baseUrl(withSlash)}/chat/completions`).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );
  });

  it("reports a missing platform key as undefined, not empty string", () => {
    expect(openrouter.platformKey(env)).toBe("sk-test");
    expect(openrouter.platformKey({ ...env, OPENROUTER_PLATFORM_KEY: "" } as Env)).toBeUndefined();
  });

  it("serves every path the gateway forwards", () => {
    for (const p of ["/chat/completions", "/completions", "/messages", "/embeddings", "/rerank", "/images", "/videos"] as const) {
      expect(openrouter.supports(p)).toBe(true);
    }
  });

  it("carries its own attribution headers", () => {
    expect(openrouter.headers()).toMatchObject({ "X-Title": "AhuraCloud Inference" });
  });
});

describe("wokey supplier", () => {
  // Every expectation here was established by probing the live API on
  // 2026-08-25, not read from documentation. See the file header.
  it("serves chat, messages, images and video", () => {
    for (const p of ["/chat/completions", "/messages", "/images", "/videos"] as const) {
      expect(wokey.supports(p)).toBe(true);
    }
  });

  it("does NOT serve embeddings, rerank or completions — those endpoints 404", () => {
    // Not a policy choice. The endpoints do not exist, so RAG, the semantic
    // cache and rerank can never route here.
    for (const p of ["/embeddings", "/rerank", "/completions"] as const) {
      expect(wokey.supports(p)).toBe(false);
    }
  });

  it("maps image generation to its own path", () => {
    expect(wokey.path("/images")).toBe("/images/generations");
    expect(openrouter.path("/images")).toBe("/images");
  });

  it("is unconfigured until a key exists, and says so rather than sending an empty bearer", () => {
    expect(wokey.platformKey({} as Env)).toBeUndefined();
    expect(wokey.platformKey({ WOKEY_PLATFORM_KEY: "" } as Env)).toBeUndefined();
    expect(wokey.platformKey({ WOKEY_PLATFORM_KEY: "wk-test" } as Env)).toBe("wk-test");
  });

  it("defaults to the public base URL when none is configured", () => {
    expect(wokey.baseUrl({} as Env)).toBe("https://api.wokey.ai/v1");
  });

  it("sends no attribution headers to a marketplace", () => {
    expect(wokey.headers()).toEqual({});
  });
});
