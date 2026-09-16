/**
 * The health verdict is the whole point of the probe, so it is tested
 * without a network. The September outage had two shapes: a hostname that
 * answered 404, and a pod that was up but served a different model name.
 * Both must read as failures.
 */
import { describe, expect, it } from "vitest";
import { judgeProbe, probeEndpoint, type EndpointRow } from "./endpoint-health.ts";

const models = (...ids: string[]) => ({ data: ids.map((id) => ({ id, object: "model" })) });

describe("judgeProbe", () => {
  it("is ok when the pod lists the served name", () => {
    expect(judgeProbe(200, models("glm-5.3-flash"), "glm-5.3-flash", null)).toEqual({
      ok: true,
      reason: "ok",
      servedIds: ["glm-5.3-flash"],
    });
  });

  it("fails when the pod is up but serves a different name", () => {
    // The GLM 5.3 pod came back as "glm5.3-R1" while the row still said
    // "glm-5.3-uncensored"; every request 404'd. That is not healthy.
    const v = judgeProbe(200, models("glm5.3-R1"), "glm-5.3-uncensored", null);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("served_name_missing");
    expect(v.servedIds).toEqual(["glm5.3-R1"]);
  });

  it("does not require a name when the row has none", () => {
    expect(judgeProbe(200, models("anything"), null, null).ok).toBe(true);
  });

  it("carries the HTTP status in the reason", () => {
    expect(judgeProbe(404, null, "x", null).reason).toBe("http_404");
    expect(judgeProbe(401, { error: "Unauthorized" }, "x", null).reason).toBe("http_401");
    expect(judgeProbe(502, null, "x", null).reason).toBe("http_502");
  });

  it("separates a timeout from a connection failure", () => {
    expect(judgeProbe(null, null, "x", "TimeoutError: The operation was aborted due to timeout").reason).toBe("timeout");
    expect(judgeProbe(null, null, "x", "TypeError: fetch failed").reason).toBe("unreachable");
  });

  it("treats a 200 with an unreadable body as the name missing", () => {
    expect(judgeProbe(200, null, "x", null).reason).toBe("served_name_missing");
    expect(judgeProbe(200, "<html>", "x", null).reason).toBe("served_name_missing");
  });
});

describe("probeEndpoint", () => {
  const row: EndpointRow = {
    id: "e1",
    model_id: "zhipu/glm-5.3-flash-derisked",
    base_url: "https://pod.example/v1",
    api_key_ct: "\\x00",
    served_model_name: "glm-5.3-flash",
    enabled: true,
    label: "pod 1",
  };

  it("calls /models on the base with the bearer key", async () => {
    let seen: { url: string; auth: string | null } | null = null;
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      seen = { url, auth: new Headers(init?.headers).get("authorization") };
      return new Response(JSON.stringify(models("glm-5.3-flash")), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await probeEndpoint(row, "secret", fakeFetch);
    expect(seen).toEqual({ url: "https://pod.example/v1/models", auth: "Bearer secret" });
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
  });

  it("appends /v1 when the base lacks it", async () => {
    let url = "";
    const fakeFetch = (async (u: string) => {
      url = u;
      return new Response(JSON.stringify(models("glm-5.3-flash")), { status: 200 });
    }) as unknown as typeof fetch;
    await probeEndpoint({ ...row, base_url: "https://pod.example" }, "k", fakeFetch);
    expect(url).toBe("https://pod.example/v1/models");
  });

  it("reports a credential that could not be decrypted without calling the pod", async () => {
    let called = false;
    const fakeFetch = (async () => {
      called = true;
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;
    const r = await probeEndpoint(row, null, fakeFetch);
    expect(called).toBe(false);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("credential");
  });

  it("never throws on a network failure", async () => {
    const fakeFetch = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const r = await probeEndpoint(row, "k", fakeFetch);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("unreachable");
    expect(r.error).toContain("fetch failed");
  });
});
