import { describe, it, expect, vi, afterEach } from "vitest";
import { callModelTurn } from "../gateway.js";
import type { RunnerEnv } from "../env.js";

// Doc: nextstespsAI/12-agent-execution-stages.md (T1.3c)

const env = {
  inferenceBaseUrl: "https://gw.test/v1",
  inferencePlatformKey: "pk_test",
  modelTurnTimeoutMs: 5_000,
} as RunnerEnv;

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

afterEach(() => vi.restoreAllMocks());

describe("callModelTurn", () => {
  it("parses content + token usage into a ModelTurn", async () => {
    global.fetch = mockFetch({
      choices: [{ message: { content: "hello" } }],
      usage: { prompt_tokens: 12, completion_tokens: 3 },
    });
    const turn = await callModelTurn(env, "test/model", [{ role: "user", content: "hi" }]);
    expect(turn.content).toBe("hello");
    expect(turn.toolCalls).toEqual([]);
    expect(turn.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
  });

  it("normalizes tool_calls (defaulting type to function)", async () => {
    global.fetch = mockFetch({
      choices: [
        {
          message: {
            content: "",
            tool_calls: [
              { id: "t1", type: "function", function: { name: "web_search", arguments: '{"q":"x"}' } },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 1 },
    });
    const turn = await callModelTurn(env, "test/model", []);
    expect(turn.toolCalls).toEqual([
      { id: "t1", type: "function", name: "web_search", arguments: '{"q":"x"}' },
    ]);
  });

  it("defaults missing fields safely", async () => {
    global.fetch = mockFetch({ choices: [{ message: {} }] });
    const turn = await callModelTurn(env, "test/model", []);
    expect(turn.content).toBe("");
    expect(turn.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("throws on a non-2xx response", async () => {
    global.fetch = mockFetch({ error: "bad" }, false, 500);
    await expect(callModelTurn(env, "test/model", [])).rejects.toThrow(/HTTP 500/);
  });
});
