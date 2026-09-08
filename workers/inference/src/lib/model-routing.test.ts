/**
 * Endpoint selection and failover for self-served models.
 *
 * The fetch is injected, the random source is injected, and the credential is
 * a real AES-GCM round trip under a throwaway DEK, so these run with no
 * network and prove the three things that matter: the right URL and header
 * go out, a dead replica is skipped, and a client mistake is not retried.
 */
import { describe, expect, it } from "vitest";
import {
  ManagedUnavailableError,
  forwardToEndpoints,
  managedPath,
  orderEndpoints,
  type ModelRouting,
} from "./model-routing.ts";
import { bytesToBase64, encryptAesGcm } from "./crypto.ts";

function dek(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
}

function routing(overrides: Partial<ModelRouting> = {}): ModelRouting {
  return {
    serving_type: "runpod_byo",
    serving_url: null,
    served_model_name: "glm-5.3-flash",
    upstream_model_id: "glm-5.3-flash",
    is_active: true,
    endpoints: [],
    endpoints_error: false,
    ...overrides,
  };
}

interface Call {
  url: string;
  authorization: string | undefined;
  model: unknown;
}

/** A fetch that answers per URL and records what it was sent. */
function fakeFetch(answers: Record<string, () => Response | Error>, calls: Call[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = init?.headers as Record<string, string>;
    calls.push({
      url,
      authorization: headers?.authorization,
      model: (JSON.parse(String(init?.body)) as { model: unknown }).model,
    });
    const base = Object.keys(answers).find((k) => url.startsWith(k));
    const answer = base ? answers[base]!() : new Error(`no answer for ${url}`);
    if (answer instanceof Error) throw answer;
    return answer;
  }) as typeof fetch;
}

describe("managedPath", () => {
  it("appends the route to a /v1 base and inserts /v1 before it otherwise", () => {
    expect(managedPath("https://x.proxy.runpod.net/v1")).toBe("https://x.proxy.runpod.net/v1/chat/completions");
    expect(managedPath("https://x.proxy.runpod.net/v1/")).toBe("https://x.proxy.runpod.net/v1/chat/completions");
    expect(managedPath("https://phi-4.ahura.svc:8000")).toBe("https://phi-4.ahura.svc:8000/v1/chat/completions");
  });
});

describe("orderEndpoints", () => {
  const a = { id: "a", weight: 1 };
  const b = { id: "b", weight: 3 };

  it("returns every endpoint exactly once", () => {
    const out = orderEndpoints([a, b, { id: "c", weight: 2 }]);
    expect(out.map((e) => e.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("picks first by weight, deterministically for a given random source", () => {
    // random() = 0.9 → r = 3.6 over total 4: skips a (1), lands in b.
    expect(orderEndpoints([a, b], () => 0.9).map((e) => e.id)).toEqual(["b", "a"]);
    // random() = 0.1 → r = 0.4: lands in a.
    expect(orderEndpoints([a, b], () => 0.1).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("does not loop forever when every weight is zero", () => {
    expect(orderEndpoints([{ id: "z", weight: 0 }, { id: "y", weight: 0 }]).length).toBe(2);
  });
});

describe("forwardToEndpoints", () => {
  it("sends the bearer key and the served model name to the chosen endpoint", async () => {
    const key = dek();
    const ct = bytesToBase64(await encryptAesGcm("secret-bearer", key));
    const calls: Call[] = [];
    const fetchImpl = fakeFetch(
      { "https://one.example/v1": () => new Response("{}", { status: 200 }) },
      calls
    );
    const r = routing({
      endpoints: [{ id: "1", baseUrl: "https://one.example/v1", apiKeyCt: ct, servedModelName: null, weight: 1 }],
    });

    const result = await forwardToEndpoints({
      env: { BYOK_DEK: key },
      routing: r,
      body: { model: "zhipu/glm-5.3-flash", messages: [] },
      fetchImpl,
    });

    expect(result.response.status).toBe(200);
    expect(result.baseUrl).toBe("https://one.example/v1");
    expect(result.attempts).toEqual([]);
    expect(calls).toEqual([
      { url: "https://one.example/v1/chat/completions", authorization: "Bearer secret-bearer", model: "glm-5.3-flash" },
    ]);
  });

  it("fails over from a 5xx and from a network error, and reports both", async () => {
    const calls: Call[] = [];
    const fetchImpl = fakeFetch(
      {
        "https://dead.example/v1": () => new Error("connect ECONNREFUSED"),
        "https://cold.example/v1": () => new Response("loading", { status: 503 }),
        "https://ok.example/v1": () => new Response("{}", { status: 200 }),
      },
      calls
    );
    const r = routing({
      endpoints: [
        { id: "d", baseUrl: "https://dead.example/v1", apiKeyCt: null, servedModelName: null, weight: 1 },
        { id: "c", baseUrl: "https://cold.example/v1", apiKeyCt: null, servedModelName: null, weight: 1 },
        { id: "o", baseUrl: "https://ok.example/v1", apiKeyCt: null, servedModelName: null, weight: 1 },
      ],
    });

    // random() → 0 always picks the first remaining endpoint: d, c, o.
    const result = await forwardToEndpoints({
      env: { BYOK_DEK: dek() },
      routing: r,
      body: { model: "m" },
      fetchImpl,
      random: () => 0,
    });

    expect(result.baseUrl).toBe("https://ok.example/v1");
    expect(result.attempts).toEqual([
      { baseUrl: "https://dead.example/v1", status: null, error: "connect ECONNREFUSED" },
      { baseUrl: "https://cold.example/v1", status: 503, error: null },
    ]);
    expect(calls.map((c) => c.authorization)).toEqual([undefined, undefined, undefined]);
  });

  it("returns a 4xx from the first endpoint without trying another", async () => {
    const calls: Call[] = [];
    const fetchImpl = fakeFetch(
      {
        "https://one.example/v1": () => new Response("bad request", { status: 400 }),
        "https://two.example/v1": () => new Response("{}", { status: 200 }),
      },
      calls
    );
    const r = routing({
      endpoints: [
        { id: "1", baseUrl: "https://one.example/v1", apiKeyCt: null, servedModelName: null, weight: 1 },
        { id: "2", baseUrl: "https://two.example/v1", apiKeyCt: null, servedModelName: null, weight: 1 },
      ],
    });

    const result = await forwardToEndpoints({
      env: { BYOK_DEK: dek() },
      routing: r,
      body: { model: "m" },
      fetchImpl,
      random: () => 0,
    });

    expect(result.response.status).toBe(400);
    expect(calls.length).toBe(1);
  });

  it("throws ManagedUnavailableError naming every endpoint when all fail", async () => {
    const fetchImpl = fakeFetch(
      {
        "https://one.example/v1": () => new Response("x", { status: 502 }),
        "https://two.example/v1": () => new Error("boom"),
      },
      []
    );
    const r = routing({
      endpoints: [
        { id: "1", baseUrl: "https://one.example/v1", apiKeyCt: null, servedModelName: null, weight: 1 },
        { id: "2", baseUrl: "https://two.example/v1", apiKeyCt: null, servedModelName: null, weight: 1 },
      ],
    });

    await expect(
      forwardToEndpoints({ env: { BYOK_DEK: dek() }, routing: r, body: { model: "m" }, fetchImpl, random: () => 0 })
    ).rejects.toMatchObject({
      name: "ManagedUnavailableError",
      attempts: [
        { baseUrl: "https://one.example/v1", status: 502 },
        { baseUrl: "https://two.example/v1", error: "boom" },
      ],
    });
  });

  it("skips an endpoint whose credential cannot be opened rather than sending it a bad header", async () => {
    const calls: Call[] = [];
    const fetchImpl = fakeFetch({ "https://two.example/v1": () => new Response("{}", { status: 200 }) }, calls);
    const r = routing({
      endpoints: [
        { id: "1", baseUrl: "https://one.example/v1", apiKeyCt: bytesToBase64(new Uint8Array(40)), servedModelName: null, weight: 1 },
        { id: "2", baseUrl: "https://two.example/v1", apiKeyCt: null, servedModelName: null, weight: 1 },
      ],
    });

    const result = await forwardToEndpoints({
      env: { BYOK_DEK: dek() },
      routing: r,
      body: { model: "m" },
      fetchImpl,
      random: () => 0,
    });

    expect(result.baseUrl).toBe("https://two.example/v1");
    expect(result.attempts[0]?.error).toMatch(/^credential: /);
    expect(calls.length).toBe(1);
  });

  it("falls back to the legacy serving_url with the adapter name when no endpoint rows exist", async () => {
    const calls: Call[] = [];
    const fetchImpl = fakeFetch({ "https://ft.ahura.svc:8000": () => new Response("{}", { status: 200 }) }, calls);
    const r = routing({ serving_type: "runpod_ft", served_model_name: "adapter", serving_url: "https://ft.ahura.svc:8000" });

    await forwardToEndpoints({ env: { BYOK_DEK: dek() }, routing: r, body: { model: "ahura/phi-4:ft-1" }, fetchImpl });

    expect(calls).toEqual([
      { url: "https://ft.ahura.svc:8000/v1/chat/completions", authorization: undefined, model: "adapter" },
    ]);
  });

  it("throws at once when nothing is configured", async () => {
    await expect(
      forwardToEndpoints({ env: { BYOK_DEK: dek() }, routing: routing(), body: {}, fetchImpl: fakeFetch({}, []) })
    ).rejects.toBeInstanceOf(ManagedUnavailableError);
  });
});
