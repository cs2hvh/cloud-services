/**
 * The partner chain and its failover. These are the rules that decide which
 * third party sees a customer's prompt, so every branch is pinned.
 *
 * Since 2026-09-20 the chain for a proxy model is exactly the partner in its
 * catalog row; forwardWithFallback keeps its multi-provider behaviour so a
 * fallback can be reintroduced per model later.
 */
import { describe, expect, it } from "vitest";
import {
  forwardWithFallback,
  looksLikeUnknownModel,
  shouldFailOver,
  upstreamChain,
  UpstreamsExhaustedError,
  type Upstream,
} from "./upstreams.ts";

const env = {
  WOKEY_BASE_URL: "https://wokey.example/v1",
  WOKEY_PLATFORM_KEY: "wk",
  STARIMG_BASE_URL: "https://star.example/v1",
  STARIMG_PLATFORM_KEY: "sk",
};

describe("upstreamChain", () => {
  it("sends a Starimg model to Starimg and nowhere else", () => {
    const c = upstreamChain({ env, billing: "platform", modelProvider: "starimg" });
    expect(c).toEqual([{ id: "starimg", baseUrl: env.STARIMG_BASE_URL, key: "sk" }]);
  });

  it("sends a Wokey model to Wokey and nowhere else", () => {
    const c = upstreamChain({ env, billing: "platform", modelProvider: "wokey" });
    expect(c).toEqual([{ id: "wokey", baseUrl: env.WOKEY_BASE_URL, key: "wk" }]);
  });

  it("treats a legacy or missing provider as Wokey", () => {
    expect(upstreamChain({ env, billing: "platform", modelProvider: "openrouter" }).map((u) => u.id)).toEqual(["wokey"]);
    expect(upstreamChain({ env, billing: "platform", modelProvider: null }).map((u) => u.id)).toEqual(["wokey"]);
  });

  it("gives a Starimg model no chain at all when Starimg is not configured, never a reroute", () => {
    const c = upstreamChain({ env: { ...env, STARIMG_PLATFORM_KEY: undefined }, billing: "platform", modelProvider: "starimg" });
    expect(c).toEqual([]);
  });

  it("sends a BYOK key to its own vendor only, whatever the model's provider or fallback", () => {
    const c = upstreamChain({ env, billing: "byok", byokKey: "customer-key", modelProvider: "starimg", modelFallback: "wokey" });
    expect(c).toEqual([{ id: "wokey", baseUrl: env.WOKEY_BASE_URL, key: "customer-key" }]);
  });

  it("appends the model's own fallback partner after the primary", () => {
    expect(upstreamChain({ env, billing: "platform", modelProvider: "starimg", modelFallback: "wokey" }).map((u) => u.id)).toEqual(["starimg", "wokey"]);
    expect(upstreamChain({ env, billing: "platform", modelProvider: "wokey", modelFallback: "starimg" }).map((u) => u.id)).toEqual(["wokey", "starimg"]);
  });

  it("ignores a fallback that is the primary again, unknown, or unconfigured", () => {
    expect(upstreamChain({ env, billing: "platform", modelProvider: "starimg", modelFallback: "starimg" }).map((u) => u.id)).toEqual(["starimg"]);
    expect(upstreamChain({ env, billing: "platform", modelProvider: "starimg", modelFallback: "openrouter" }).map((u) => u.id)).toEqual(["starimg"]);
    expect(upstreamChain({ env: { ...env, STARIMG_PLATFORM_KEY: undefined }, billing: "platform", modelProvider: "wokey", modelFallback: "starimg" }).map((u) => u.id)).toEqual(["wokey"]);
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
  it("returns the first provider's answer with no attempts on a clean hit", async () => {
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

  it("a single-provider chain gets no deadline and returns whatever it answers", async () => {
    let sawSignalTimeout = false;
    const f = (async (_url: string, init?: RequestInit) => {
      // With one provider the only abort source is the client; a timer would
      // show up as a TimeoutError here after 300 ms.
      await new Promise((res) => setTimeout(res, 350));
      if (init?.signal?.aborted) sawSignalTimeout = true;
      return new Response("busy", { status: 503 });
    }) as unknown as typeof fetch;
    const r = await forwardWithFallback({ env: fenv, chain: [chain[1]!], path: "/chat/completions", body: {}, stream: false, fetchImpl: f });
    expect(sawSignalTimeout).toBe(false);
    expect(r.provider).toBe("wokey");
    expect(r.response.status).toBe(503);
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

  it("falls over when the first provider says it lacks the model, but not on a caller error", async () => {
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

  it("gives a non-final provider a first-byte deadline and moves on when it hangs", async () => {
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

  it("throws immediately on an empty chain", async () => {
    await expect(
      forwardWithFallback({ env: fenv, chain: [], path: "/chat/completions", body: {}, stream: false, fetchImpl: (async () => ok("x")) as unknown as typeof fetch })
    ).rejects.toBeInstanceOf(UpstreamsExhaustedError);
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
