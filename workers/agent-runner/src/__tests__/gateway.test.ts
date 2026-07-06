import { describe, it, expect, vi, afterEach } from "vitest";
import { callModelTurn, toWireMessages } from "../gateway.js";
import type { RunnerEnv } from "../env.js";
import type { LoopMessage } from "@ahura/agent-core";

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

  it("retries a transient 5xx, then succeeds", async () => {
    let n = 0;
    global.fetch = vi.fn(async () => {
      n++;
      if (n < 2) return { ok: false, status: 503, text: async () => "busy" } as unknown as Response;
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "ok" } }], usage: {} }), text: async () => "" } as unknown as Response;
    }) as unknown as typeof fetch;
    const turn = await callModelTurn(env, "test/model", []);
    expect(turn.content).toBe("ok");
    expect(n).toBe(2); // one retry
  });

  it("does NOT retry a 4xx (e.g. guardrail block)", async () => {
    let n = 0;
    global.fetch = vi.fn(async () => { n++; return { ok: false, status: 403, text: async () => "blocked" } as unknown as Response; }) as unknown as typeof fetch;
    await expect(callModelTurn(env, "test/model", [])).rejects.toThrow(/HTTP 403/);
    expect(n).toBe(1); // no retry on client error
  });
});

// Regression: after a tool call, the assistant turn must serialize tool_calls in
// OpenAI's NESTED shape and the result as a role:'tool' message, or the follow-up
// model turn 400s. (Found by live web_search testing — the loop ran 2 steps then failed.)
describe("toWireMessages", () => {
  it("nests assistant tool_calls into OpenAI shape + keeps the tool result", () => {
    const msgs: LoopMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "web_search", name: "web_search", arguments: '{"query":"x"}' }] },
      { role: "tool", tool_call_id: "c1", content: '{"results":[]}' },
    ];
    const wire = toWireMessages(msgs);
    expect(wire[1]).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [{ id: "c1", type: "function", function: { name: "web_search", arguments: '{"query":"x"}' } }],
    });
    expect(wire[2]).toEqual({ role: "tool", tool_call_id: "c1", content: '{"results":[]}' });
  });

  it("leaves a normal assistant answer without a tool_calls field", () => {
    const wire = toWireMessages([{ role: "assistant", content: "final" }]);
    expect(wire[0]).toEqual({ role: "assistant", content: "final" });
    expect("tool_calls" in wire[0]).toBe(false);
  });
});
