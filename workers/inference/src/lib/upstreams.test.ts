/**
 * The partner chain and its failover. These are the rules that decide which
 * third party sees a customer's prompt, so every branch is pinned.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  forwardWithFallback,
  looksLikeUnknownModel,
  resetUpstreamCaches,
  shouldFailOver,
  starimgModels,
  upstreamChain,
  UpstreamsExhaustedError,
  type Upstream,
} from "./upstreams.ts";

const env = {
  WOKEY_BASE_URL: "https://wokey.example/v1",
  WOKEY_PLATFORM_KEY: "wk",
  STARIMG_BASE_URL: "https://star.example/v1",
  STARIMG_PLATFORM_KEY: "sk",
  UPSTREAM_PRIMARY: "starimg" as const,
};
const listed = new Set(["claude-haiku-4-5", "gpt-6-astra"]);

describe("upstreamChain", () => {
  it("puts the primary first when it serves the model", () => {
    const c = upstreamChain({ env, billing: "platform", upstreamModelId: "claude-haiku-4-5", primaryModels: listed });
    expect(c.map((u) => u.id)).toEqual(["starimg", "wokey"]);
    expect(c[0]?.key).toBe("sk");
    expect(c[1]?.key).toBe("wk");
  });

  it("skips the primary for a model it does not list", () => {
    const c = upstreamChain({ env, billing: "platform", upstreamModelId: "gpt-5.3-codex", primaryModels: listed });
    expect(c.map((u) => u.id)).toEqual(["wokey"]);
  });

  it("skips the primary when its list is unknown", () => {
    const c = upstreamChain({ env, billing: "platform", upstreamModelId: "claude-haiku-4-5", primaryModels: null });
    expect(c.map((u) => u.id)).toEqual(["wokey"]);
  });

  it("skips the primary when it is not configured", () => {
    const c = upstreamChain({ env: { ...env, STARIMG_PLATFORM_KEY: undefined }, billing: "platform", upstreamModelId: "claude-haiku-4-5", primaryModels: listed });
    expect(c.map((u) => u.id)).toEqual(["wokey"]);
  });

  it("keeps the secondary first when UPSTREAM_PRIMARY says so", () => {
    const c = upstreamChain({ env: { ...env, UPSTREAM_PRIMARY: "wokey" }, billing: "platform", upstreamModelId: "claude-haiku-4-5", primaryModels: listed });
    expect(c.map((u) => u.id)).toEqual(["wokey", "starimg"]);
  });

  it("sends a BYOK key to its own vendor only, never into the chain", () => {
    const c = upstreamChain({ env, billing: "byok", byokKey: "customer-key", upstreamModelId: "claude-haiku-4-5", primaryModels: listed });
    expect(c).toEqual([{ id: "wokey", baseUrl: env.WOKEY_BASE_URL, key: "customer-key" }]);
  });
});

describe("failover decisions", () => {
  it("recognises the ways a provider says it lacks a model", () => {
    expect(looksLikeUnknownModel(404, '{"error":{"message":"Model glm-5.1 not found"}}')).toBe(true);
    expect(looksLikeUnknownModel(400, '{"error":{"message":"The model `x` does not exist"}}')).toBe(true);
    expect(looksLikeUnknownModel(400, '{"error":{"message":"Invalid model: y"}}')).toBe(true);
  });

  it("does not mistake a caller's bad request for a missing model", () => {
    expect(looksLikeUnknownModel(400, '{"error":{"message":"messages: must not be empty"}}')).toBe(false);
    expect(looksLikeUnknownModel(400, '{"error":{"message":"max_tokens must be positive"}}')).toBe(false);
  });

  it("fails over on 5xx and 429, never on a plain 4xx", () => {
    expect(shouldFailOver(502, "")).toBe(true);
    expect(shouldFailOver(429, "")).toBe(true);
    expect(shouldFailOver(401, "")).toBe(false);
    expect(shouldFailOver(400, "temperature out of range")).toBe(false);
  });
});

const chain: Upstream[] = [
  { id: "starimg", baseUrl: "https://star.example/v1", key: "sk" },
  { id: "wokey", baseUrl: "https://wokey.example/v1", key: "wk" },
];
const fenv = { UPSTREAM_PRIMARY_TTFB_MS: "200", UPSTREAM_PRIMARY_NONSTREAM_MS: "300" };
const ok = (tag: string) => new Response(JSON.stringify({ tag }), { status: 200 });

describe("forwardWithFallback", () => {
  it("returns the primary's answer with no attempts on a clean hit", async () => {
    const seen: string[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      seen.push(`${url} ${new Headers(init?.headers).get("authorization")}`);
      return ok("star");
    }) as unknown as typeof fetch;
    const r = await forwardWithFallback({ env: fenv, chain, path: "/chat/completions", body: { a: 1 }, stream: false, fetchImpl: f });
    expect(r.provider).toBe("starimg");
    expect(r.attempts).toEqual([]);
    expect(seen).toEqual(["https://star.example/v1/chat/completions Bearer sk"]);
  });

  it("falls over on a network failure", async () => {
    let n = 0;
    const f = (async () => {
      n++;
      if (n === 1) throw new TypeError("fetch failed");
      return ok("wokey");
    }) as unknown as typeof fetch;
    const r = await forwardWithFallback({ env: fenv, chain, path: "/chat/completions", body: {}, stream: false, fetchImpl: f });
    expect(r.provider).toBe("wokey");
    expect(r.attempts).toHaveLength(1);
    expect(r.attempts[0]?.error).toContain("fetch failed");
  });

  it("falls over on a 5xx and on a 429", async () => {
    for (const status of [502, 429]) {
      let n = 0;
      const f = (async () => (++n === 1 ? new Response("busy", { status }) : ok("wokey"))) as unknown as typeof fetch;
      const r = await forwardWithFallback({ env: fenv, chain, path: "/chat/completions", body: {}, stream: false, fetchImpl: f });
      expect(r.provider).toBe("wokey");
      expect(r.attempts[0]?.status).toBe(status);
    }
  });

  it("falls over when the primary says it lacks the model, but not on a caller error", async () => {
    let n = 0;
    const f = (async () => (++n === 1 ? new Response('{"error":{"message":"model not found"}}', { status: 404 }) : ok("wokey"))) as unknown as typeof fetch;
    const r = await forwardWithFallback({ env: fenv, chain, path: "/chat/completions", body: {}, stream: false, fetchImpl: f });
    expect(r.provider).toBe("wokey");

    n = 0;
    const g = (async () => (++n === 1 ? new Response('{"error":{"message":"messages must not be empty"}}', { status: 400 }) : ok("wokey"))) as unknown as typeof fetch;
    const r2 = await forwardWithFallback({ env: fenv, chain, path: "/chat/completions", body: {}, stream: false, fetchImpl: g });
    expect(r2.provider).toBe("starimg");
    expect(r2.response.status).toBe(400);
  });

  it("gives the primary a first-byte deadline and moves on when it hangs", async () => {
    let n = 0;
    const f = ((_url: string, init?: RequestInit) => {
      n++;
      if (n === 1) {
        return new Promise<Response>((_res, rej) => {
          init?.signal?.addEventListener("abort", () => rej(init.signal!.reason));
        });
      }
      return Promise.resolve(ok("wokey"));
    }) as unknown as typeof fetch;
    const t = Date.now();
    const r = await forwardWithFallback({ env: fenv, chain, path: "/chat/completions", body: {}, stream: true, fetchImpl: f });
    expect(r.provider).toBe("wokey");
    expect(r.attempts[0]?.error).toContain("TimeoutError");
    expect(Date.now() - t).toBeGreaterThanOrEqual(180);
  });

  it("returns the last provider's error response rather than throwing", async () => {
    const f = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
    const r = await forwardWithFallback({ env: fenv, chain, path: "/chat/completions", body: {}, stream: false, fetchImpl: f });
    expect(r.provider).toBe("wokey");
    expect(r.response.status).toBe(503);
    expect(r.attempts).toHaveLength(1);
  });

  it("throws only when every provider is unreachable", async () => {
    const f = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(
      forwardWithFallback({ env: fenv, chain, path: "/chat/completions", body: {}, stream: false, fetchImpl: f })
    ).rejects.toBeInstanceOf(UpstreamsExhaustedError);
  });

  it("does not fail over when the client itself went away", async () => {
    const ac = new AbortController();
    const f = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener("abort", () => rej(init.signal!.reason));
      })) as unknown as typeof fetch;
    const p = forwardWithFallback({ env: fenv, chain, path: "/chat/completions", body: {}, stream: true, clientSignal: ac.signal, fetchImpl: f });
    ac.abort(new DOMException("client gone", "AbortError"));
    await expect(p).rejects.toThrow("client gone");
  });
});

describe("starimgModels", () => {
  beforeEach(() => resetUpstreamCaches());

  it("is null when the primary is not configured", async () => {
    expect(await starimgModels({ ...env, STARIMG_PLATFORM_KEY: undefined } as never)).toBeNull();
  });

  it("caches the list and serves it stale when a refresh fails", async () => {
    let calls = 0;
    const f = (async () => {
      calls++;
      if (calls === 1) return new Response(JSON.stringify({ data: [{ id: "a" }, { id: "b" }] }), { status: 200 });
      return new Response("nope", { status: 500 });
    }) as unknown as typeof fetch;
    const first = await starimgModels(env as never, f);
    expect([...first!]).toEqual(["a", "b"]);
    const second = await starimgModels(env as never, f);
    expect(second).toBe(first);
    expect(calls).toBe(1);
  });
});
