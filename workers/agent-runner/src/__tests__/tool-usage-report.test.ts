import { describe, it, expect, vi, afterEach } from "vitest";
import { reportToolUsage } from "../tool-usage-report.js";
import type { RunnerEnv } from "../env.js";

const env = {
  inferenceBaseUrl: "https://gw.test/v1",
  inferencePlatformKey: "pk_test",
} as RunnerEnv;

afterEach(() => vi.restoreAllMocks());

describe("reportToolUsage", () => {
  it("posts a web_search step to the ingress with on-behalf-of attribution", async () => {
    let seenUrl: string | undefined;
    let seenHeaders: Record<string, string> | undefined;
    let seenBody: Record<string, unknown> | undefined;
    global.fetch = vi.fn(async (url, init) => {
      seenUrl = String(url);
      seenHeaders = init?.headers as Record<string, string>;
      seenBody = JSON.parse(String(init?.body));
      return { ok: true, status: 200, text: async () => "" } as unknown as Response;
    }) as unknown as typeof fetch;

    await reportToolUsage(env, "org_1", "run_1:2", {
      unitLabel: "web_search",
      units: 1,
      status: "success",
    });

    expect(seenUrl).toBe("https://gw.test/v1/agent-tool-usage");
    expect(seenHeaders?.["X-Ahura-On-Behalf-Of-Org"]).toBe("org_1");
    expect(seenHeaders?.Authorization).toBe("Bearer pk_test");
    expect(seenBody).toMatchObject({
      toolType: "web_search",
      unitLabel: "web_search",
      units: 1,
      requestId: "run_1:2",
      status: "success",
    });
  });

  it("maps cpu_second -> code and function_call -> function toolTypes", async () => {
    const seenToolTypes: string[] = [];
    global.fetch = vi.fn(async (_url, init) => {
      seenToolTypes.push((JSON.parse(String(init?.body)) as { toolType: string }).toolType);
      return { ok: true, status: 200, text: async () => "" } as unknown as Response;
    }) as unknown as typeof fetch;

    await reportToolUsage(env, "org_1", "run_1:0", { unitLabel: "cpu_second", units: 3.2, status: "success" });
    await reportToolUsage(env, "org_1", "run_1:1", { unitLabel: "function_call", units: 1, status: "success" });

    expect(seenToolTypes).toEqual(["code", "function"]);
  });

  it("maps file_search, memory_write, memory_search to their agent/* toolTypes", async () => {
    const seenToolTypes: string[] = [];
    global.fetch = vi.fn(async (_url, init) => {
      seenToolTypes.push((JSON.parse(String(init?.body)) as { toolType: string }).toolType);
      return { ok: true, status: 200, text: async () => "" } as unknown as Response;
    }) as unknown as typeof fetch;

    await reportToolUsage(env, "org_1", "run_1:0", { unitLabel: "file_search", units: 1, status: "success" });
    await reportToolUsage(env, "org_1", "run_1:1", { unitLabel: "memory_write", units: 1, status: "success" });
    await reportToolUsage(env, "org_1", "run_1:2", { unitLabel: "memory_search", units: 1, status: "success" });

    expect(seenToolTypes).toEqual(["file_search", "memory_write", "memory_search"]);
  });

  it("is a no-op for an unrecognized unit label (no agent/* catalog row)", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await reportToolUsage(env, "org_1", "run_1:0", { unitLabel: "mcp_call", units: 1, status: "success" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is a no-op for a zero/absent unit count (nothing to bill)", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await reportToolUsage(env, "org_1", "run_1:0", { unitLabel: "web_search", units: 0, status: "success" });
    await reportToolUsage(env, "org_1", "run_1:1", { unitLabel: "web_search", units: null, status: "success" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swallows a network failure (logged, not thrown) so reporting never breaks the run", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    await expect(
      reportToolUsage(env, "org_1", "run_1:0", { unitLabel: "web_search", units: 1, status: "success" })
    ).resolves.toBeUndefined();
  });

  it("swallows a non-2xx ingress response (logged, not thrown)", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => "bad request",
    })) as unknown as typeof fetch;

    await expect(
      reportToolUsage(env, "org_1", "run_1:0", { unitLabel: "web_search", units: 1, status: "success" })
    ).resolves.toBeUndefined();
  });
});
